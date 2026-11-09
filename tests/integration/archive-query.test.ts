import { observe, sourceJson } from "../archive-query-observer";
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
import { db, closeDb, readOnlyData } from "../../src/db";
import {
  editionState,
  historicalStatistics,
  historicalStatisticsSources,
  archiveReadVersions,
} from "../../src/db/schema";
import { backfillArchiveReads } from "../../src/lib/archive-read-maintenance";
import {
  publicArchiveStatistics,
  publicArchivePlayerPlays,
} from "../../src/lib/archive-statistics-reads";
import {
  mapPerformance,
  minimumCountedScore,
  playerMapPerformance,
} from "../../src/lib/player-map-performance";
import { publicPlayer } from "../../src/lib/players";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { archiveQueryFixture } from "../fixtures/archive-query";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("bounded historical queries", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    const f = archiveQueryFixture();
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        status: "completed",
        registration: null,
        archive: f.archive,
      },
    ]);
    await db().insert(historicalStatistics).values(f.rows);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("reads a matching public summary without fetching raw MP JSONB", async () => {
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const legacy = await observe(() => publicArchiveStatistics("s7"));
    await backfillArchiveReads("s7", true);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    const current = await observe(() => publicArchiveStatistics("s7"));
    expect(current.value).toEqual(legacy.value);
    expect(sourceJson(legacy.statements).length).toBeGreaterThan(0);
    expect(sourceJson(current.statements)).toEqual([]);
    expect(current.bytes).toBeLessThan(legacy.bytes / 2);
  });
  it("keeps full fields and bench team games while excluding unrelated games", async () => {
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const all = (await publicArchiveStatistics("s7")).plays;
    const expected = mapPerformance(all, 91003, ["alpha"]);
    expect(expected.maps).toHaveLength(1);
    expect(expected.teamMaps).toBe(2);
    expect(expected.maps[0].teamSize).toBe(4);
    expect(expected.maps[0].effectiveRating).not.toBe(1);
    await backfillArchiveReads("s7", true);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    const current = await observe(() =>
      publicArchivePlayerPlays("s7", 91003, ["alpha"], minimumCountedScore),
    );
    expect(mapPerformance(current.value, 91003, ["alpha"])).toEqual(expected);
    expect(current.value.length).toBeLessThan(all.length);
    expect(current.value.every((p) => p.fixtureId === "one")).toBe(true);
    expect(sourceJson(current.statements)).toEqual([]);
    const inferred = await publicArchivePlayerPlays(
      "s7",
      91003,
      [],
      minimumCountedScore,
    );
    expect(mapPerformance(inferred, 91003)).toEqual(mapPerformance(all, 91003));
    const extra = await publicArchivePlayerPlays(
      "s7",
      91003,
      ["gamma"],
      minimumCountedScore,
    );
    expect(mapPerformance(extra, 91003, ["gamma"])).toEqual(
      mapPerformance(all, 91003, ["gamma"]),
    );
  });
  it("rejects stale source digests even when a legacy edit did not advance version", async () => {
    await backfillArchiveReads("s7", true);
    const [prior] = await db()
      .select()
      .from(historicalStatisticsSources)
      .where(eq(historicalStatisticsSources.mpId, 999177));
    await db()
      .update(historicalStatistics)
      .set({
        published: sql`jsonb_set(published,'{source,games,0,scores,0,total}','850001'::jsonb)`,
      })
      .where(eq(historicalStatistics.mpId, 999177));
    const [next] = await db()
      .select()
      .from(historicalStatisticsSources)
      .where(eq(historicalStatisticsSources.mpId, 999177));
    expect(next.sourceHash).not.toBe(prior.sourceHash);
    const fallback = await observe(() => publicArchiveStatistics("s7"));
    expect(sourceJson(fallback.statements).length).toBeGreaterThan(0);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const expected = await publicArchiveStatistics("s7");
    expect(fallback.value).toEqual(expected);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    await backfillArchiveReads("s7", true);
    const refreshed = await observe(() => publicArchiveStatistics("s7"));
    expect(refreshed.value).toEqual(expected);
    expect(sourceJson(refreshed.statements)).toEqual([]);
  });
  it("preserves multi-season profile analysis within a shared read-only snapshot", async () => {
    const f = archiveQueryFixture();
    f.archive.editionSlug = "s8";
    const key = statisticsArchiveKey(f.archive);
    await seedEditions([
      {
        ...edition,
        slug: "s8",
        status: "completed",
        registration: null,
        archive: f.archive,
      },
    ]);
    await db()
      .insert(historicalStatistics)
      .values(
        f.rows.map((row) => ({
          ...row,
          editionSlug: "s8",
          draft: { ...row.draft, archiveKey: key },
          published: { ...row.published, archiveKey: key },
        })),
      );
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const expected = await readOnlyData(async () =>
      playerMapPerformance(await publicPlayer(91003)),
    );
    expect(expected.editions).toHaveLength(2);
    await backfillArchiveReads("s7", true);
    await backfillArchiveReads("s8", true);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    const actual = await readOnlyData(async () =>
      playerMapPerformance(await publicPlayer(91003)),
    );
    expect(actual).toEqual(expected);
  });
  it("falls back for missing metadata, old projector versions and changed policy", async () => {
    await backfillArchiveReads("s7", true);
    await db()
      .delete(historicalStatisticsSources)
      .where(eq(historicalStatisticsSources.mpId, 999177));
    expect(
      sourceJson(
        (await observe(() => publicArchiveStatistics("s7"))).statements,
      ).length,
    ).toBeGreaterThan(0);
    await db()
      .update(historicalStatistics)
      .set({ version: 4 })
      .where(eq(historicalStatistics.mpId, 999177));
    await backfillArchiveReads("s7", true);
    await db().update(archiveReadVersions).set({ projectorVersion: 1 });
    expect(
      sourceJson(
        (await observe(() => publicArchiveStatistics("s7"))).statements,
      ).length,
    ).toBe(0);
    await backfillArchiveReads("s7", true);
    await db()
      .update(archiveReadVersions)
      .set({ statisticsScorePolicy: "old" });
    expect(
      sourceJson(
        (await observe(() => publicArchiveStatistics("s7"))).statements,
      ).length,
    ).toBe(0);
    await backfillArchiveReads("s7", true, true);
    const [state] = await db().select().from(editionState);
    await db()
      .update(editionState)
      .set({
        configuration: { ...state.configuration!, ezScoreMultiplier: 1.2 },
      });
    expect(
      sourceJson(
        (await observe(() => publicArchiveStatistics("s7"))).statements,
      ).length,
    ).toBe(0);
  });
  it("limits detail reads to the requested fixture's sources", async () => {
    const current = await observe(() => publicArchiveStatistics("s7", "one"));
    expect(current.value.matchDetails).toHaveLength(1);
    const selects = sourceJson(current.statements);
    expect(selects.length).toBeGreaterThan(0);
    expect(selects.every((s) => /"fixture_id" = \$/.test(s))).toBe(true);
    expect(current.value.plays.every((p) => p.fixtureId === "one")).toBe(true);
  });
});
