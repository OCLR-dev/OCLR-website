import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  editionState,
  editionRevisions,
  historicalStatistics,
  editionEvents,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { correctS2PoolData } from "../../src/lib/archive-pool-correction";
import { correctS2PoolArchive } from "../../src/lib/archive-pool-correction-model";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import {
  publicArchiveStatistics,
} from "../../src/lib/archive-statistics-reads";
import { readTournament } from "../../src/lib/tournament-reads";
import { tournamentCommand } from "../../src/lib/tournaments";
import { verifyArchiveRelations } from "../../src/lib/archive-relations";

const url = process.env.TEST_DATABASE_URL;
function archive() {
  const value = structuredClone(statisticsArchive);
  value.editionSlug = "s2";
  value.pools = [
    {
      ...value.pools[0],
      id: "gs",
      maps: [
        ...value.pools[0].maps,
        ...["DT5", "TB1"].map((slot, i) => ({
          ...value.pools[0].maps[0],
          slot,
          beatmapId: 88000 + i,
        })),
      ],
    },
    value.pools[0],
  ];
  return value;
}
describe.skipIf(!url)("S2 stored pool correction", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const a = archive();
    await seedEditions([
      {
        ...edition,
        slug: "s2",
        status: "completed",
        registration: null,
        archive: a,
      },
    ]);
    const snapshot = {
      archiveKey: statisticsArchiveKey(a),
      source: statisticsSource(),
      poolId: "gs",
      included: [1, 2],
    };
    await db()
      .insert(historicalStatistics)
      .values({
        editionSlug: "s2",
        mpId: 999177,
        fixtureId: "one",
        version: 3,
        draft: snapshot,
        published: snapshot,
        publishedAt: new Date("2026-01-01T00:00:00Z"),
      });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("previews without writes, then deletes only GS slots and preserves released scores/source/review/time", async () => {
    const before = await publicArchiveStatistics("s2", "one");
    const [row] = await db().select().from(historicalStatistics);
    expect(before.plays.length).toBeGreaterThan(0);
    expect(await correctS2PoolData()).toMatchObject({
      applied: false,
      revision: 0,
      statistics: 1,
      removed: [
        { slot: "DT5", beatmapId: 88000 },
        { slot: "TB1", beatmapId: 88001 },
      ],
    });
    expect((await readTournament("s2"))!.revision).toBe(0);
    expect(
      await correctS2PoolData({ apply: true, expectedRevision: 0 }),
    ).toMatchObject({ applied: true });
    const saved = (await readTournament("s2"))!;
    expect(await verifyArchiveRelations(db(), "s2")).toMatchObject({
      documents: 3,
    });
    expect(saved.edition.archive).toEqual(correctS2PoolArchive(archive()));
    const after = await publicArchiveStatistics("s2", "one");
    expect(after.plays).toEqual(before.plays);
    expect(after.fixtures).toEqual(before.fixtures);
    expect(after.publishedAt).toBe(before.publishedAt);
    const [updated] = await db().select().from(historicalStatistics);
    expect(updated.draft).toEqual({
      ...row.draft,
      archiveKey: after.archiveKey,
    });
    expect(updated.published).toEqual({
      ...row.published!,
      archiveKey: after.archiveKey,
    });
    expect(updated.publishedAt).toEqual(row.publishedAt);
    const old = await db()
      .select()
      .from(editionRevisions)
      .where(eq(editionRevisions.version, 0));
    expect(old[0].configuration.archive).toEqual(archive());
    expect(
      await correctS2PoolData({ apply: true, expectedRevision: 1 }),
    ).toMatchObject({ applied: false, removed: [] });
    expect(await db().select().from(editionEvents)).toHaveLength(1);
  });
  it("rejects stale revision and rolls back if a selected score uses a removed slot", async () => {
    await expect(
      correctS2PoolData({ apply: true, expectedRevision: 8 }),
    ).rejects.toMatchObject({ status: 409 });
    const [row] = await db().select().from(historicalStatistics);
    const changed = structuredClone(row.draft);
    changed.source.games[0].beatmapId = 88000;
    await db()
      .update(historicalStatistics)
      .set({ draft: changed, published: changed });
    await expect(
      correctS2PoolData({ apply: true, expectedRevision: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readTournament("s2"))!.edition.archive).toEqual(archive());
    expect(await db().select().from(editionEvents)).toHaveLength(0);
  });
  it("corrects at archive import instead of masking reads; other editions and Final remain literal", async () => {
    vi.stubEnv("ADMIN_OSU_IDS", "391001");
    await db()
      .insert(users)
      .values({ osuId: 391001, username: "Synthetic admin" });
    await db()
      .update(editionState)
      .set({
        configuration: {
          ...edition,
          status: "completed",
          registration: null,
          published: false,
        },
      });
    await tournamentCommand(
      { osuId: 391001, username: "Synthetic admin" },
      "s2",
      {
        action: "archive",
        expectedRevision: 0,
        confirmed: true,
        archive: archive(),
      },
    );
    expect(await verifyArchiveRelations(db(), "s2")).toMatchObject({
      documents: 3,
    });
    expect((await readTournament("s2"))!.edition.archive).toEqual(
      correctS2PoolArchive(archive()),
    );
    expect(
      correctS2PoolArchive({ ...archive(), editionSlug: "s1" }).pools[0].maps,
    ).toHaveLength(4);
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", url!);
  });
  it("serializes concurrent corrections and records only one revision/audit", async () => {
    const results = await Promise.allSettled([
      correctS2PoolData({ apply: true, expectedRevision: 0 }),
      correctS2PoolData({ apply: true, expectedRevision: 0 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect((await readTournament("s2"))!.revision).toBe(1);
    expect(await db().select().from(editionEvents)).toHaveLength(1);
  });
  it("requires review when a recorded ban contradicts the removed slots", async () => {
    const saved = (await readTournament("s2"))!;
    const changed = structuredClone(saved.edition.archive!);
    changed.matches[0].poolId = "gs";
    changed.matches[0].bansA = "DT5";
    await db()
      .update(editionState)
      .set({ configuration: { ...saved.edition, archive: changed } });
    await expect(
      correctS2PoolData({ apply: true, expectedRevision: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readTournament("s2"))!.edition.archive).toEqual(changed);
  });
});
