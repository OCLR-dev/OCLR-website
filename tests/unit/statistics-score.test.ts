import { describe, expect, it } from "vitest";
import {
  ezScoreMultiplierSchema,
  statisticsScore,
} from "../../src/lib/statistics-score";
import {
  projectStatistics,
  type StatisticsSnapshot,
} from "../../src/lib/archive-statistics-model";
import {
  archiveMatchDetails,
  withStatisticsScores,
} from "../../src/lib/match-details-model";
import {
  liveMapPlays,
  mapPerformance,
} from "../../src/lib/player-map-performance";
import { editionSchema } from "../../src/lib/editions";
import { edition } from "../fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";

describe("edition EZ statistics scores", () => {
  it.each([0.0001, 0.5, 1, 1.2345, 100])("accepts multiplier %s", (value) => {
    expect(ezScoreMultiplierSchema.parse(value)).toBe(value);
  });
  it.each([0, -1, 0.00001, 100.0001, 1.12345, Infinity, NaN])(
    "rejects multiplier %s",
    (value) => {
      expect(ezScoreMultiplierSchema.safeParse(value).success).toBe(false);
    },
  );
  it("keeps legacy settings neutral and applies only the recorded EZ mods", () => {
    expect(editionSchema.parse(edition).ezScoreMultiplier).toBeUndefined();
    expect(statisticsScore(500000, ["EZ"], 1.5)).toEqual({
      rawScore: 500000,
      scoreMultiplier: 1.5,
      score: 750000,
    });
    expect(statisticsScore(500000, ["HD", "EZ", "EZ"], 1.5).score).toBe(750000);
    expect(statisticsScore(500000, ["HD"], 1.5).score).toBe(500000);
    expect(statisticsScore(500000, ["EZ"]).score).toBe(500000);
  });
  it.each([
    [3, 0.5, 2],
    [100005, 0.1, 10001],
    [5001, 1.0001, 5002],
    [0, 100, 0],
  ])("rounds %s × %s exactly to %s", (raw, factor, expected) => {
    expect(statisticsScore(raw, ["EZ"], factor).score).toBe(expected);
  });
  it("rejects unsafe adjusted integers", () => {
    expect(() => statisticsScore(Number.MAX_SAFE_INTEGER, ["EZ"], 2)).toThrow(
      RangeError,
    );
  });
  it("uses combined game/player mods, recomputes relative scores and never mutates source snapshots", () => {
    const archive = structuredClone(statisticsArchive);
    archive.pools[0].maps[0].slot = "FM1";
    archive.pools[0].maps[1].slot = "TB";
    const source = statisticsSource();
    source.games[0].scores[0].mods = ["EZ", "HD"];
    source.games[1].mods = ["EZ"];
    const snapshot: StatisticsSnapshot = {
      archiveKey: "a".repeat(64),
      source,
      poolId: "final",
      included: [1, 2],
    };
    const before = structuredClone(snapshot);
    const raw = projectStatistics(archive, "one", snapshot);
    const adjusted = projectStatistics(archive, "one", snapshot, 1.5);
    expect(new Set(adjusted.map((p) => p.slot))).toEqual(
      new Set(["FM1", "TB"]),
    );
    for (const row of adjusted) {
      const original = raw.find(
        (p) => p.gameId === row.gameId && p.osuId === row.osuId,
      )!;
      expect(row.rawScore).toBe(original.score);
      expect(row.score).toBe(
        Math.round(original.score * (row.mods.includes("EZ") ? 1.5 : 1)),
      );
      const maximum = Math.max(
        ...adjusted.filter((p) => p.gameId === row.gameId).map((p) => p.score),
      );
      expect(row.relative).toBe(row.score / maximum);
    }
    expect(projectStatistics(archive, "one", snapshot, 1.5)).toEqual(adjusted);
    expect(snapshot).toEqual(before);
    const details = archiveMatchDetails(archive, "one", [
      { snapshot, revision: "synthetic" },
    ]);
    const report = withStatisticsScores(details, 1.5);
    expect(report.games[0].effectiveTotals).toEqual(
      details.games[0].effectiveTotals,
    );
    expect(report.games[0].scores[0].statisticsTotal).toBe(adjusted[0].score);
    expect(report.games[0].scores[0].total).toBe(
      source.games[0].scores[0].total,
    );
  });
  it("uses original scores for the appearance threshold and preserves known map winners", () => {
    const common = {
      fixtureId: "synthetic",
      gameId: 1,
      stage: "group",
      title: "Synthetic FM",
      slot: "FM1",
      at: null,
      accuracy: 0.9,
      winnerTeamId: "b",
    };
    const plays = [
      { ...common, osuId: 1, teamId: "a", rawScore: 1500, score: 3000 },
      { ...common, osuId: 2, teamId: "a", rawScore: 500000, score: 750000 },
      { ...common, osuId: 3, teamId: "b", rawScore: 600000, score: 600000 },
    ];
    expect(mapPerformance(plays, 1).maps).toEqual([]);
    expect(mapPerformance(plays, 2)).toMatchObject({
      mapsLost: 1,
      firstPlaces: 1,
    });
  });
  it("keeps approved failed-score zero contributions out of counted map appearances", () => {
    const plays = liveMapPlays(
      [
        {
          gameId: 1,
          fixtureId: "synthetic",
          revision: 1,
          fingerprint: "synthetic",
          at: "2026-01-01T00:00:00Z",
          teamIds: ["a", "b"],
          winnerTeamId: "b",
          ezScoreMultiplier: 1.5,
          scores: [
            {
              userId: 1,
              teamId: "a",
              total: 0,
              rawTotal: 500000,
              unadjustedTotal: 0,
              scoreMultiplier: 1.5,
              mods: ["EZ"],
            },
          ],
        },
      ],
      new Map(),
    );
    expect(mapPerformance(plays, 1).maps).toEqual([]);
  });
});
