import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb, readOnlyData } from "../../src/db";
import {
  archiveReadPlays,
  archiveReadVersions,
  editionState,
  historicalStatistics,
} from "../../src/db/schema";
import { backfillArchiveReads } from "../../src/lib/archive-read-maintenance";
import {
  archiveMapPerformanceQuery,
  relationalArchiveMapPerformance,
} from "../../src/lib/archive-map-performance";
import {
  publicArchivePlayerPlays,
  publicArchiveStatistics,
} from "../../src/lib/archive-statistics-reads";
import {
  mapPerformance,
  minimumCountedScore,
  type MapPlay,
} from "../../src/lib/player-map-performance-model";
import { assertTestDatabase } from "../database";
import { archiveQueryFixture } from "../fixtures/archive-query";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { observe, sourceJson } from "../archive-query-observer";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("historical SQL map analysis (#911)", () => {
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

  it("returns identical public analysis inside read-only snapshots without transferring opponents or payloads", async () => {
    const source = (await publicArchiveStatistics("s7")).plays;
    await backfillArchiveReads("s7", true);
    for (const teams of [["alpha"], [], ["gamma"], ["alpha", "gamma"]]) {
      const actual = await observe(() =>
        readOnlyData(() => relationalArchiveMapPerformance("s7", 91003, teams)),
      );
      expect(actual.value).toEqual(mapPerformance(source, 91003, teams));
      expect(sourceJson(actual.statements)).toEqual([]);
      const aggregate = actual.statements.find((s) =>
        s.includes("WITH facts AS"),
      )!;
      expect(aggregate).toBeDefined();
      expect(aggregate).not.toMatch(/payload|historical_statistics/);
    }
    expect(
      await relationalArchiveMapPerformance("s7", 999999, ["alpha"]),
    ).toEqual(mapPerformance(source, 999999, ["alpha"]));
  });

  it("preserves tied ranks, duplicate UIDs, raw winners, source order, low-score filtering and bench denominators", async () => {
    const generationId = await generation();
    // Public-source validation is covered above; this fixture exercises the
    // mathematical edge cases independently of import reconciliation rules.
    const plays: MapPlay[] = [];
    for (let gameId = 1; gameId <= 20; gameId++) {
      const count = (gameId % 10) + 1;
      for (let j = 0; j < count; j++) {
        const raw = [2000, 1999, 0, 400000, 600000][(gameId + j) % 5];
        plays.push({
          fixtureId: `f${gameId % 3}`,
          gameId,
          osuId: j < 2 ? 42 : 100 + j,
          teamId: ["alpha", "beta", "gamma"][j % 3],
          stage: "Synthetic Stage",
          title: `Synthetic map ${gameId}`,
          slot: ["NM1", "EZ1", "TB1", "unknown"][gameId % 4],
          at: gameId % 2 ? "2024-01-05T00:00:00Z" : "",
          rawScore: raw,
          score: Math.round(raw * (j % 2 ? 1.5 : 1)),
          accuracy: j % 2 ? null : 0.9512345,
          mods: ["NF", "EZ", "NF", "CL"],
          winnerTeamId: gameId % 3 === 0 ? (j === 1 ? "beta" : "") : null,
        });
      }
    }
    // A tie between the leading teams applies to a third team as before.
    for (const [j, score] of [5000, 5000, 3000].entries())
      plays.push({
        fixtureId: "tie",
        gameId: 50,
        osuId: j === 2 ? 42 : j,
        teamId: ["alpha", "beta", "gamma"][j],
        stage: "Tie",
        title: "Tie",
        slot: "FM1",
        at: "",
        score,
        accuracy: null,
      });
    // The first truthy explicit winner is authoritative even with inconsistent
    // later evidence; ranks still use every counted score for duplicate UIDs.
    plays.push(
      ...[9000, 9000, 4000, 3000, 2000, 2000, 2000, 1999].map((score, j) => ({
        fixtureId: "duplicate",
        gameId: 51,
        osuId: j === 0 || j === 2 ? 42 : j,
        teamId: j < 4 ? "alpha" : "beta",
        stage: "Final",
        title: "Duplicates",
        slot: "HD1",
        at: "2024-01-06",
        score,
        accuracy: 0.95,
        winnerTeamId: j === 1 ? "beta" : j === 2 ? "alpha" : null,
      })),
    );
    for (const [gameId, scores] of [
      [52, [0, 0]],
      [53, [9007199254740000, 9007199254739000, 2000, 3001, 4003]],
    ] as const)
      for (const [j, score] of scores.entries())
        plays.push({
          fixtureId: "arithmetic",
          gameId,
          osuId: j === 0 ? 42 : j,
          teamId: j % 2 ? "alpha" : "beta",
          stage: "Final",
          title: "Arithmetic",
          slot: "NM1",
          at: "",
          rawScore: score || 3000,
          score,
          accuracy: null,
        });
    await replaceFacts(generationId, plays);
    for (const uid of [42, 102, 99999])
      for (const teams of [[], ["alpha"], ["gamma", "beta"]])
        expect(await relationalArchiveMapPerformance("s7", uid, teams)).toEqual(
          mapPerformance(plays, uid, teams),
        );
  });

  it("falls back on missing/stale generations, source changes, withdrawal and unpublished editions", async () => {
    expect(
      await relationalArchiveMapPerformance("s7", 91003, []),
    ).toBeUndefined();
    await backfillArchiveReads("s7", true);
    expect(
      await relationalArchiveMapPerformance("s7", 91003, []),
    ).toBeDefined();
    await db()
      .update(historicalStatistics)
      .set({ published: null, publishedAt: null })
      .where(eq(historicalStatistics.mpId, 999177));
    expect(
      await relationalArchiveMapPerformance("s7", 91003, []),
    ).toBeUndefined();
    const fallback = mapPerformance(
      await publicArchivePlayerPlays(
        "s7",
        91003,
        ["alpha"],
        minimumCountedScore,
      ),
      91003,
      ["alpha"],
    );
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    expect(fallback).toEqual(
      mapPerformance((await publicArchiveStatistics("s7")).plays, 91003, [
        "alpha",
      ]),
    );
    expect(
      await relationalArchiveMapPerformance("s7", 91003, []),
    ).toBeUndefined();
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    await backfillArchiveReads("s7", true);
    expect(
      await relationalArchiveMapPerformance("s7", 91003, ["alpha"]),
    ).toEqual(fallback);
    const [state] = await db().select().from(editionState);
    await db()
      .update(editionState)
      .set({ configuration: { ...state.configuration!, published: false } });
    expect(
      await relationalArchiveMapPerformance("s7", 91003, []),
    ).toBeUndefined();
  });

  it("uses indexed own-game/team scopes on a large synthetic season and returns only personal rows", async () => {
    const generationId = await generation();
    const plays: MapPlay[] = [];
    for (let gameId = 1; gameId <= 5000; gameId++)
      for (let j = 0; j < 8; j++)
        plays.push({
          fixtureId: `fixture-${Math.floor(gameId / 10)}`,
          gameId,
          osuId: gameId <= 10 && j === 0 ? 42 : 100 + j,
          teamId:
            gameId <= 500
              ? j < 4
                ? "alpha"
                : "beta"
              : j < 4
                ? "gamma"
                : "delta",
          stage: "Synthetic Stage",
          title: `Synthetic map ${gameId}`,
          slot: "NM1",
          at: "2024-01-05T00:00:00Z",
          score: 800000 - j * 15000,
          rawScore: 800000 - j * 15000,
          accuracy: 0.95,
          mods: [],
        });
    await replaceFacts(generationId, plays);
    // Historical generations are stable data. Establish their normal visibility
    // map so PostgreSQL can choose covering indexes without forced planner flags.
    await db().execute(sql`VACUUM (ANALYZE) archive_read_plays`);
    const old = await observe(() =>
      publicArchivePlayerPlays("s7", 42, ["alpha"], minimumCountedScore),
    );
    const optimized = await observe(() =>
      relationalArchiveMapPerformance("s7", 42, ["alpha"]),
    );
    expect(optimized.value).toEqual(mapPerformance(plays, 42, ["alpha"]));
    expect(optimized.value).toEqual(mapPerformance(old.value, 42, ["alpha"]));
    expect(old.value).toHaveLength(4000);
    expect(optimized.value!.maps).toHaveLength(10);
    expect(optimized.value!.teamMaps).toBe(500);
    expect(optimized.bytes).toBeLessThan(old.bytes / 10);
    const result = await db().execute(
      sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${archiveMapPerformanceQuery(generationId, 42, ["alpha"])}`,
    );
    const plan = result.rows[0]["QUERY PLAN"] as {
      Plan: Record<string, unknown>;
    }[];
    const names: string[] = [];
    const visit = (node: Record<string, unknown>) => {
      if (node["Index Name"]) names.push(String(node["Index Name"]));
      for (const child of (node.Plans ?? []) as Record<string, unknown>[])
        visit(child);
    };
    visit(plan[0].Plan);
    expect(names).toContain("archive_read_play_counted_uid_idx");
    expect(names).toContain("archive_read_play_counted_team_idx");
    expect(names).toContain("archive_read_play_game_idx");
  }, 30000);
});

async function replaceFacts(generationId: string, plays: MapPlay[]) {
  await db()
    .delete(archiveReadPlays)
    .where(eq(archiveReadPlays.generationId, generationId));
  for (let offset = 0; offset < plays.length; offset += 250)
    await db()
      .insert(archiveReadPlays)
      .values(
        plays.slice(offset, offset + 250).map((p, i) => ({
          generationId,
          position: offset + i,
          fixtureId: p.fixtureId,
          mpId: 999177,
          gameId: p.gameId,
          osuId: p.osuId,
          teamId: p.teamId,
          stage: p.stage,
          title: p.title,
          slot: p.slot,
          beatmapId: 10000 + p.gameId,
          score: p.score,
          rawScore: p.rawScore ?? p.score,
          scoreMultiplier: 1,
          playedAt: p.at!,
          scoringType: "score",
          accuracy: p.accuracy,
          mods: p.mods ?? [],
          winnerTeamId: p.winnerTeamId ?? null,
          optionalFields: ["rawScore", "winnerTeamId"].filter(
            (key) => p[key as keyof MapPlay] !== undefined,
          ),
          payload: { ...p },
        })),
      );
  await db()
    .update(archiveReadVersions)
    .set({ publicPlayCount: plays.length })
    .where(eq(archiveReadVersions.id, generationId));
}

async function generation() {
  const result = await backfillArchiveReads("s7", true);
  if (!("generationId" in result) || !result.generationId)
    throw new Error("Expected a validated synthetic generation.");
  return result.generationId;
}
