import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { mkdtemp, rm, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { editionEvents, teams } from "../../src/db/schema";
import { prepareDraft } from "../fixtures/draft";
import { staffTeams } from "../../src/lib/teams";
import { assertTestDatabase } from "../database";
vi.mock("../../src/lib/auth/staff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/auth/staff")>()),
  requireStaff: vi.fn(),
}));
import { requireStaff } from "../../src/lib/auth/staff";
import { PATCH } from "../../src/app/api/admin/tournaments/[edition]/teams/[teamId]/route";
const url = process.env.TEST_DATABASE_URL,
  slug = "upload-rollback-test";
describe.skipIf(!url)(
  "team multipart API transaction and file consistency",
  () => {
    let f: Awaited<ReturnType<typeof prepareDraft>>,
      root: string,
      teamId: string,
      version: number,
      bytes: Buffer;
    beforeAll(async () => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", "918001");
      vi.stubEnv("APP_URL", "https://oclr.example.test");
      root = await realpath(
        await mkdtemp(join(tmpdir(), "oclr-upload-api-test-")),
      );
      vi.stubEnv("OCLR_MEDIA_DIR", root);
      bytes = await sharp({
        create: { width: 80, height: 40, channels: 3, background: "purple" },
      })
        .png()
        .toBuffer();
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
      await rm(join(root, "teams"), { recursive: true, force: true });
      f = await prepareDraft(slug, 918001);
      const data = await staffTeams(f.staff, slug);
      teamId = data.teams[0].id;
      version = data.version;
      vi.mocked(requireStaff).mockResolvedValue(f.staff);
    });
    afterAll(async () => {
      await closeDb();
      await rm(root, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });
    async function request(image = bytes, expected = version, edition = slug) {
      const form = new FormData();
      form.set("name", "Synthetic API brand");
      form.set("capacity", "");
      form.set("expectedVersion", String(expected));
      form.set(
        "image",
        new File([new Uint8Array(image)], "../../untrusted.png", {
          type: "image/png",
        }),
      );
      return PATCH(
        new Request("https://oclr.example.test/api/admin/team", {
          method: "PATCH",
          headers: { origin: "https://oclr.example.test" },
          body: form,
        }),
        { params: Promise.resolve({ edition, teamId }) },
      );
    }
    const files = () => readdir(join(root, "teams")).catch(() => []);
    it("rolls back both the record and uploaded asset when audit insertion fails", async () => {
      await db().execute(
        sql`CREATE FUNCTION test_reject_team_image_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='team_edit' THEN RAISE EXCEPTION 'Synthetic team audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_reject_team_image_audit BEFORE INSERT ON edition_events FOR EACH ROW EXECUTE FUNCTION test_reject_team_image_audit()`,
      );
      try {
        expect((await request()).status).toBe(500);
        expect(
          (await db().select().from(teams).where(eq(teams.id, teamId)))[0]
            .avatarKey,
        ).toBeNull();
        expect(await files()).toHaveLength(0);
        expect(
          await db()
            .select()
            .from(editionEvents)
            .where(eq(editionEvents.kind, "team_edit")),
        ).toHaveLength(0);
      } finally {
        await db().execute(
          sql`DROP TRIGGER test_reject_team_image_audit ON edition_events; DROP FUNCTION test_reject_team_image_audit()`,
        );
      }
    });
    it("commits only one concurrent upload, removes loser files and rejects malformed/oversized/cross-scope requests", async () => {
      const responses = await Promise.all([request(), request()]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const [team] = await db()
        .select()
        .from(teams)
        .where(eq(teams.id, teamId));
      expect(await files()).toEqual([`${team.avatarKey}.webp`]);
      const [event] = await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.kind, "team_edit"));
      expect(event.detail).toMatchObject({
        entity: { type: "team", id: teamId },
        before: { avatarKey: null },
        after: { avatarKey: team.avatarKey },
      });
      expect(
        (
          await request(
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
            version + 1,
          )
        ).status,
      ).toBe(400);
      expect(
        (await request(Buffer.alloc(5 * 1024 * 1024 + 20000), version + 1))
          .status,
      ).toBe(413);
      expect((await request(bytes, version + 1, "other-test")).status).toBe(
        404,
      );
      vi.mocked(requireStaff).mockResolvedValue(f.a);
      expect((await request()).status).toBe(403);
      expect(await files()).toEqual([`${team.avatarKey}.webp`]);
    });
  },
);
