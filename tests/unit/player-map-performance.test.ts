import { describe, expect, it } from "vitest";
import type { StatisticsPlay } from "../../src/lib/archive-statistics-model";
import {
  liveMapPlays,
  mapPerformance,
  summarizeMapPerformance,
  type PlayerMapEdition,
} from "../../src/lib/player-map-performance";
import type { RatingGame } from "../../src/lib/yumu-rating";

function play(
  gameId: number,
  osuId: number,
  score: number,
  accuracy: number | null = 0.95,
  at = "2024-01-05T00:00:00Z",
  teamId = "a",
): StatisticsPlay {
  return {
    fixtureId: "fixture",
    mpId: 1,
    gameId,
    stage: "小组赛",
    beatmapId: 1000 + gameId,
    title: `Map ${gameId}`,
    slot: `NM${gameId}`,
    at,
    osuId,
    teamId,
    score,
    scoringType: "score",
    accuracy,
    combo: 500,
    passed: true,
    mods: [],
    hits: { great: 1, ok: 1, meh: 0, miss: 0 },
    relative: null,
  };
}

function edition(
  slug: string,
  maps: PlayerMapEdition["maps"],
  unavailable = false,
): PlayerMapEdition {
  const row = summarizeMapPerformance([{ ...blank(slug), maps }]).editions[0];
  return { ...row, unavailable };
}

function blank(slug: string): PlayerMapEdition {
  return {
    editionSlug: slug,
    editionName: slug.toUpperCase(),
    maps: [],
    averagePlacement: null,
    firstPlaces: 0,
    averageAccuracy: null,
    averageEffectiveRating: null,
    ratedMaps: 0,
    mapsWon: 0,
    mapsLost: 0,
    mapsTied: 0,
    unavailable: false,
  };
}

describe("map performance", () => {
  it("ranks each map with competition ranking and keeps ties shared", () => {
    const result = mapPerformance(
      [
        play(1, 1, 1_000_000),
        play(1, 2, 800_000),
        play(1, 3, 800_000),
        play(1, 4, 500_000),
      ],
      3,
    );
    expect(result.maps[0].placement).toBe(2);
    expect(
      mapPerformance([play(2, 1, 900), play(2, 2, 1_000)], 1).maps[0].placement,
    ).toBe(2);
  });

  it("records personal map wins, losses and ties from the team scores", () => {
    const result = mapPerformance(
      [
        play(1, 1, 1_000_000),
        play(1, 2, 800_000, 0.95, "2024-01-05T00:00:00Z", "b"),
        play(2, 1, 800_000),
        play(2, 2, 1_000_000, 0.95, "2024-01-05T00:00:00Z", "b"),
        play(3, 1, 900_000),
        play(3, 2, 900_000, 0.95, "2024-01-05T00:00:00Z", "b"),
      ],
      1,
    );
    expect(result.maps.map((row) => row.result)).toEqual([
      "tie",
      "loss",
      "win",
    ]);
    expect(result.mapsWon).toBe(1);
    expect(result.mapsLost).toBe(1);
    expect(result.mapsTied).toBe(1);
  });

  it("computes effective rating as own score over the map mean", () => {
    const result = mapPerformance(
      [play(1, 1, 1_000_000), play(1, 2, 800_000), play(1, 3, 600_000)],
      1,
    );
    // Mean = 800,000; own score = 1,000,000 → 1.25.
    expect(result.maps).toHaveLength(1);
    expect(result.maps[0].effectiveRating).toBeCloseTo(1.25);
    expect(result.averageEffectiveRating).toBeCloseTo(1.25);
    expect(result.ratedMaps).toBe(1);
  });

  it("skips effective ratings when the map mean is zero or unusable", () => {
    const result = mapPerformance(
      [play(1, 1, 0), play(1, 2, 0), play(2, 3, 500), play(2, 1, 1_000)],
      1,
    );
    const zeroMap = result.maps.find((row) => row.gameId === 1)!;
    expect(zeroMap.placement).toBe(1);
    expect(zeroMap.effectiveRating).toBeNull();
    // Mean of map 2 is 750, so only that map contributes 1.333…
    expect(result.averageEffectiveRating).toBeCloseTo(1_000 / 750);
    expect(result.ratedMaps).toBe(1);
  });

  it("averages placements, first places and accuracy over recorded maps", () => {
    const result = mapPerformance(
      [
        play(1, 1, 1_000_000, 0.98, "2024-01-05T00:00:00Z"),
        play(1, 2, 500_000),
        play(2, 1, 400_000, 0.9, "2024-01-12T00:00:00Z"),
        play(2, 2, 900_000),
        play(3, 1, 700_000, null, "2024-01-20T00:00:00Z"),
        play(3, 2, 300_000),
      ],
      1,
    );
    expect(result.maps).toHaveLength(3);
    expect(result.averagePlacement).toBeCloseTo((1 + 2 + 1) / 3);
    expect(result.firstPlaces).toBe(2);
    expect(result.averageAccuracy).toBeCloseTo((0.98 + 0.9) / 2);
    // Rows are newest first.
    expect(result.maps.map((row) => row.gameId)).toEqual([3, 2, 1]);
  });

  it("splits average placement by the score count of each map", () => {
    const threeVThree = [1, 2, 3, 4, 5].map((osuId, index) =>
      play(1, osuId, 1_000 - index * 100, 0.95, "2024-01-05T00:00:00Z"),
    );
    const fourVFour = [500, 1_000, 900, 800, 700, 600, 400].map(
      (score, index) => play(2, index + 1, score, 0.95, "2024-01-12T00:00:00Z"),
    );
    const summary = summarizeMapPerformance([
      {
        ...blank("s1"),
        ...mapPerformance([...threeVThree, ...fourVFour], 1),
      },
    ]);
    expect(summary.averagePlacement).toBeCloseTo((1 + 6) / 2);
    expect(summary.averagePlacement3v3).toBe(1);
    expect(summary.averagePlacement4v4).toBe(6);
  });

  it("summarizes editions and ignores empty or unavailable seasons", () => {
    const first = mapPerformance([play(1, 1, 1_000), play(1, 2, 1_000)], 1);
    const summary = summarizeMapPerformance([
      edition("s2", []),
      edition("s1", first.maps),
    ]);
    expect(summary.mapsPlayed).toBe(1);
    expect(summary.firstPlaces).toBe(1);
    expect(summary.ratedMaps).toBe(1);
    expect(summary.averageEffectiveRating).toBeCloseTo(1);
    expect(summary.editions.map((item) => item.editionSlug)).toEqual([
      "s2",
      "s1",
    ]);
  });

  it("keeps the ranked rows when they are merged into an edition", () => {
    // Regression: the fields used to be returned as `rows` while an edition
    // reads `maps`, so every profile showed an empty section despite plays.
    const merged: PlayerMapEdition = {
      ...blank("s1"),
      ...mapPerformance([play(1, 1, 1_000_000), play(1, 2, 800_000)], 1),
    };
    expect(merged.maps).toHaveLength(1);
    expect(summarizeMapPerformance([merged]).mapsPlayed).toBe(1);
  });
});

describe("liveMapPlays", () => {
  const game = (over: Partial<RatingGame> = {}): RatingGame => ({
    gameId: 7,
    fixtureId: "fixture",
    revision: 1,
    fingerprint: "fingerprint",
    roundId: "round",
    at: "2025-04-05T12:00:00Z",
    teamIds: ["a", "b"],
    winnerTeamId: "a",
    scores: [{ userId: 1, total: 900_000, teamId: "a", accuracy: 0.98 }],
    beatmapId: 42,
    beatmap: {
      setId: 1,
      title: "Song",
      artist: "Artist",
      difficulty: "Insane",
    },
    ...over,
  });
  const stages = new Map([["fixture", "group"]]);
  const slots = new Map([["round:42", "NM1"]]);

  it("projects approved games into per-map plays", () => {
    const [row] = liveMapPlays([game()], stages, slots);
    expect(row).toMatchObject({
      fixtureId: "fixture",
      gameId: 7,
      stage: "group",
      title: "Artist - Song - Insane",
      slot: "NM1",
      osuId: 1,
      score: 900_000,
      accuracy: 0.98,
      teamId: "a",
      winnerTeamId: "a",
    });
    expect(row.at).toBe("2025-04-05T12:00:00Z");
  });

  it("keeps placeholders for missing stage, slot and beatmap metadata", () => {
    const [row] = liveMapPlays(
      [game({ beatmap: null, beatmapId: null, roundId: undefined })],
      new Map(),
      new Map(),
    );
    expect(row.stage).toBe("unknown");
    expect(row.slot).toBe("—");
    expect(row.title).toBe("MP #7");
  });

  it("skips games needing review or without a played-at time", () => {
    expect(
      liveMapPlays(
        [game({ problem: "review" }), game({ at: null }), game({ gameId: 8 })],
        stages,
        slots,
      ).map((row) => row.gameId),
    ).toEqual([8]);
  });

  it("feeds the shared aggregation unchanged", () => {
    const plays = liveMapPlays(
      [
        game({
          scores: [
            { userId: 1, total: 1_000, teamId: "a", accuracy: 0.9 },
            { userId: 2, total: 500, teamId: "b", accuracy: 0.8 },
          ],
        }),
      ],
      stages,
      slots,
    );
    const result = mapPerformance(plays, 1);
    expect(result.maps).toHaveLength(1);
    expect(result.maps[0].placement).toBe(1);
    expect(result.maps[0].effectiveRating).toBeCloseTo(1_000 / 750);
  });
});
