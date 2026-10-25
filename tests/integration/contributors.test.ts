import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  contributorDirectory,
  contributorEvents,
  staffRoles,
  users,
} from "../../src/db/schema";
import {
  contributorsForAdmin,
  publicContributors,
  updateContributors,
} from "../../src/lib/contributors";
import { auditLog } from "../../src/lib/audit";
import { HttpError } from "../../src/lib/http";
import { requireUser } from "../../src/lib/auth/user";
import { GET, PATCH } from "../../src/app/api/admin/contributors/route";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
vi.mock("../../src/lib/auth/user", () => ({ requireUser: vi.fn() }));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 275001, username: "Synthetic Admin" };
const other = { osuId: 275002, username: "Synthetic Contributor Operator" };
const first = {
  id: "27500000-0000-4000-8000-000000000001",
  name: "Synthetic Public",
  osuId: 275101,
  published: true,
};
const second = {
  id: "27500000-0000-4000-8000-000000000002",
  name: "Synthetic Hidden",
  osuId: 275102,
  published: false,
};
const save = (entries: unknown = [first, second], expectedRevision = 0) => ({
  entries,
  expectedRevision,
});
describe.skipIf(!url)("global contributor directory (#275)", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    vi.stubEnv("APP_URL", "http://localhost:3000");
  });
  beforeEach(async () => {
    vi.mocked(requireUser).mockReset();
    await db().execute(
      sql`TRUNCATE contributor_directory, contributor_events, edition_state, users CASCADE`,
    );
    await seedEditions();
    await db().insert(users).values([admin, other]);
  });
  afterAll(async () => {
    await db().execute(sql`TRUNCATE contributor_directory, contributor_events`);
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("saves ordered identities independently of accounts, publishes only minimal identities and audits the actual actor", async () => {
    const saved = await updateContributors(admin, save());
    expect(saved.revision).toBe(1);
    expect(await contributorsForAdmin(admin)).toEqual(saved);
    expect(await publicContributors()).toEqual([
      { name: first.name, osuId: first.osuId },
    ]);
    expect(await db().select().from(staffRoles)).toHaveLength(0);
    const log = await auditLog(admin, { module: "site" });
    expect(log.rows[0]).toMatchObject({
      actorId: admin.osuId,
      action: "contributors_updated",
      edition: null,
      after: { entries: [first, second], revision: 1 },
    });
    const reordered = [
      { ...second, published: true },
      { ...first, name: "Updated literal name" },
    ];
    await updateContributors(admin, save(reordered, 1));
    expect(await publicContributors()).toEqual(
      reordered.map(({ name, osuId }) => ({ name, osuId })),
    );
    await updateContributors(admin, save([], 2));
    expect(await publicContributors()).toEqual([]);
  });
  it("does not duplicate a repeated submission or an unchanged save", async () => {
    const result = await updateContributors(admin, save());
    expect(await updateContributors(admin, save())).toEqual(result);
    expect(await updateContributors(admin, save([first, second], 1))).toEqual(
      result,
    );
    expect(await db().select().from(contributorEvents)).toHaveLength(1);
  });
  it.each(["none", "edition-admin", "developer"])(
    "rejects writes from %s and keeps Developer reads available",
    async (role) => {
      if (role !== "none")
        await db()
          .insert(staffRoles)
          .values({
            userId: other.osuId,
            role: role === "developer" ? "developer" : "admin",
            editionSlug: role === "developer" ? null : "test-cup",
            grantedBy: admin.osuId,
          });
      await expect(updateContributors(other, save())).rejects.toMatchObject({
        status: 403,
      });
      if (role === "developer")
        expect((await contributorsForAdmin(other)).entries).toEqual([]);
      else
        await expect(contributorsForAdmin(other)).rejects.toMatchObject({
          status: 403,
        });
      expect(await db().select().from(contributorEvents)).toHaveLength(0);
    },
  );
  it("rejects duplicate identities, malformed data, forged actor fields and unsafe IDs without partial writes", async () => {
    for (const data of [
      save([first, { ...second, osuId: first.osuId }]),
      save([first, { ...second, id: first.id }]),
      save([{ ...first, name: " " }]),
      save([{ ...first, osuId: -1 }]),
      save([{ ...first, osuId: Number.MAX_SAFE_INTEGER + 1 }]),
      save([{ ...first, id: "bad" }]),
      save([{ ...first, profileUrl: "javascript:alert(1)" }]),
      { ...save(), actorId: other.osuId },
      save([first], -1),
    ]) {
      await expect(updateContributors(admin, data)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(await db().select().from(contributorDirectory)).toHaveLength(0);
    expect(await db().select().from(contributorEvents)).toHaveLength(0);
  });
  it("serializes concurrent changes and rejects stale submissions without losing a saved update", async () => {
    const results = await Promise.allSettled([
      updateContributors(admin, save([first])),
      updateContributors(admin, save([second])),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { status: 409 } });
    expect((await contributorsForAdmin(admin)).revision).toBe(1);
    expect(await db().select().from(contributorEvents)).toHaveLength(1);
  });
  it("rolls back the directory when audit insertion fails", async () => {
    await db().execute(
      sql`CREATE FUNCTION contributor_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER contributor_test_failure BEFORE INSERT ON contributor_events FOR EACH ROW EXECUTE FUNCTION contributor_test_reject()`,
    );
    try {
      await expect(updateContributors(admin, save())).rejects.toThrow(
        "Failed query",
      );
      expect(await publicContributors()).toEqual([]);
      expect(await db().select().from(contributorEvents)).toHaveLength(0);
    } finally {
      await db().execute(
        sql`DROP TRIGGER contributor_test_failure ON contributor_events`,
      );
      await db().execute(sql`DROP FUNCTION contributor_test_reject()`);
    }
  });
  it("enforces authenticated sessions, same-origin writes and server-side roles at the HTTP boundary", async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new HttpError(401, "Sign in to continue."),
    );
    expect((await GET()).status).toBe(401);
    const request = (origin = "http://localhost:3000") =>
      new Request("http://localhost:3000/api/admin/contributors", {
        method: "PATCH",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(save()),
      });
    expect((await PATCH(request())).status).toBe(401);
    vi.mocked(requireUser).mockResolvedValue(other);
    expect((await PATCH(request())).status).toBe(403);
    vi.mocked(requireUser).mockResolvedValue(admin);
    expect((await PATCH(request("https://untrusted.example"))).status).toBe(
      403,
    );
    expect((await PATCH(request())).status).toBe(200);
  });
});
