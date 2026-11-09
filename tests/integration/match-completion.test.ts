import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  fixtures,
  matchImports,
  matchResults,
  editionEvents,
  staffRoles,
} from "../../src/db/schema";
import { seedResultReview } from "../fixtures/results";
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
import { fixtureCommand } from "../../src/lib/fixtures";
import { previewFixtureMatch, importFixtureMatch } from "../../src/lib/result-import";
import { fetchMatchSource } from "../../src/lib/osu-matches";
import { HttpError } from "../../src/lib/http";
import type { MatchSource } from "../../src/lib/match-model";
vi.mock("../../src/lib/osu-matches", async (original) => ({
  ...(await original<typeof import("../../src/lib/osu-matches")>()),
  fetchMatchSource: vi.fn(),
}));
const admin = { osuId: 133001, username: "Synthetic Completion Admin" },
  ref = { osuId: 133002, username: "Synthetic Completion Referee" };
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "private MP preview and atomic planned-fixture completion",
  () => {
    let fixtureId: string, source: MatchSource, home: string, away: string;
    beforeAll(() => {
      assertTestDatabase(process.env.TEST_DATABASE_URL);
      vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL!);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      await seedEditions();
      await db().insert(users).values([admin, ref]);
      const seeded = await seedResultReview(admin.osuId, ref.osuId, 1331000);
      source = seeded.source;
      home = seeded.home.teamId;
      away = seeded.away.teamId;
      const f = seeded.context.fixture;
      const data = await fixtureCommand(admin, "test-cup", {
        action: "create",
        confirmed: true,
        label: "Keep organizer label",
        roundId: f.roundId,
        homeTeamId: null,
        awayTeamId: null,
        scheduledAt: "2026-01-01T12:00:00Z",
        timeZone: f.timeZone,
        status: "scheduled",
        mappoolId: f.mappoolId,
        position: 2,
        homeSourceId: null,
        homeSourceOutcome: null,
        awaySourceId: null,
        awaySourceOutcome: null,
        refereeIds: [ref.osuId],
      });
      fixtureId = data.fixtures.find((f) => f.position === 2)!.id;
      vi.mocked(fetchMatchSource).mockResolvedValue(source);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    const command = () => ({
      match: String(source.match.id),
      confirmed: true,
      requestKey: randomUUID(),
      expectedVersion: 0,
      expectedFixtureVersion: 0,
      completion: {
        homeTeamId: home,
        awayTeamId: away,
        sourceFingerprint: source.fingerprint,
      },
    });
    it("previews without writes, matches by player IDs, completes only teams and imports idempotently", async () => {
      const before = await db().select().from(matchImports);
      const preview = await previewFixtureMatch(admin, "test-cup", fixtureId, {
        match: String(source.match.id),
      });
      expect(preview.unique).toBe(true);
      expect(new Set(Object.values(preview.suggested))).toEqual(
        new Set([home, away]),
      );
      expect(await db().select().from(matchImports)).toEqual(before);
      const c = command();
      await importFixtureMatch(admin, "test-cup", fixtureId, c);
      await importFixtureMatch(admin, "test-cup", fixtureId, c);
      const [f] = await db()
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, fixtureId));
      expect(f).toMatchObject({
        homeTeamId: home,
        awayTeamId: away,
        label: "Keep organizer label",
        version: 1,
        scheduledAt: new Date("2026-01-01T12:00:00Z"),
        publishedAt: null,
      });
      expect(
        await db()
          .select()
          .from(matchImports)
          .where(eq(matchImports.fixtureId, fixtureId)),
      ).toHaveLength(1);
      const [result] = await db()
        .select()
        .from(matchResults)
        .where(eq(matchResults.fixtureId, fixtureId));
      expect(result.publishedRevision).toBeNull();
      expect(
        (await db().select().from(editionEvents)).filter(
          (e) => e.kind === "fixture_completed_from_mp",
        ),
      ).toHaveLength(1);
    });
    it("keeps unmatched historical players explicit and allows assigned source preview without scheduling permission", async () => {
      source = structuredClone(source);
      source.games[0].scores[0].osuId = 99999999;
      vi.mocked(fetchMatchSource).mockResolvedValue(source);
      const preview = await previewFixtureMatch(admin, "test-cup", fixtureId, {
        match: String(source.match.id),
      });
      expect(preview.unique).toBe(false);
      expect(
        preview.attribution.find((p) => p.osuId === 99999999)?.teamIds,
      ).toEqual([]);
      expect(
        (
          await previewFixtureMatch(ref, "test-cup", fixtureId, {
            match: String(source.match.id),
          })
        ).source.match.id,
      ).toBe(source.match.id);
      await expect(
        importFixtureMatch(ref, "test-cup", fixtureId, command()),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("rejects stale state, changed source, conflicts, invalid IDs and revoked scopes without partial writes", async () => {
      await expect(
        importFixtureMatch(admin, "test-cup", fixtureId, {
          ...command(),
          expectedFixtureVersion: 99,
        }),
      ).rejects.toMatchObject({ status: 409 });
      const c = command();
      await expect(
        importFixtureMatch(admin, "test-cup", fixtureId, {
          ...c,
          completion: { ...c.completion, sourceFingerprint: "0".repeat(64) },
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        previewFixtureMatch(admin, "test-cup", fixtureId, {
          match: "https://example.com/1",
        }),
      ).rejects.toMatchObject({ status: 400 });
      await db()
        .update(fixtures)
        .set({ homeTeamId: away })
        .where(eq(fixtures.id, fixtureId));
      await expect(
        importFixtureMatch(admin, "test-cup", fixtureId, command()),
      ).rejects.toMatchObject({ status: 409 });
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, ref.osuId));
      await expect(
        previewFixtureMatch(ref, "test-cup", fixtureId, {
          match: String(source.match.id),
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        await db()
          .select()
          .from(matchImports)
          .where(eq(matchImports.fixtureId, fixtureId)),
      ).toHaveLength(0);
    });
    it("handles provider failures and concurrent completion without duplicate writes", async () => {
      vi.mocked(fetchMatchSource).mockRejectedValueOnce(
        new HttpError(503, "Synthetic provider unavailable"),
      );
      await expect(
        previewFixtureMatch(admin, "test-cup", fixtureId, {
          match: String(source.match.id),
        }),
      ).rejects.toMatchObject({ status: 503 });
      expect(
        await db()
          .select()
          .from(matchImports)
          .where(eq(matchImports.fixtureId, fixtureId)),
      ).toEqual([]);
      const attempts = await Promise.allSettled([
        importFixtureMatch(admin, "test-cup", fixtureId, command()),
        importFixtureMatch(admin, "test-cup", fixtureId, command()),
      ]);
      expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await db()
          .select()
          .from(matchImports)
          .where(eq(matchImports.fixtureId, fixtureId)),
      ).toHaveLength(1);
    });
    it("rolls back team completion and its audit if storing the import fails", async () => {
      await db().execute(
        sql`CREATE FUNCTION reject_completion_import_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic import failure'; END $$`,
      );
      try {
        await db().execute(
          sql`CREATE TRIGGER reject_completion_import_test BEFORE INSERT ON match_imports FOR EACH ROW EXECUTE FUNCTION reject_completion_import_test()`,
        );
        await expect(
          importFixtureMatch(admin, "test-cup", fixtureId, command()),
        ).rejects.toThrow();
        const [f] = await db()
          .select()
          .from(fixtures)
          .where(eq(fixtures.id, fixtureId));
        expect(f).toMatchObject({
          homeTeamId: null,
          awayTeamId: null,
          version: 0,
        });
        expect(
          (await db().select().from(editionEvents)).filter(
            (e) => e.kind === "fixture_completed_from_mp",
          ),
        ).toEqual([]);
      } finally {
        await db().execute(
          sql`DROP TRIGGER IF EXISTS reject_completion_import_test ON match_imports`,
        );
        await db().execute(sql`DROP FUNCTION reject_completion_import_test()`);
      }
    });
  },
);
