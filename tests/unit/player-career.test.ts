import { describe, expect, it } from "vitest";
import {
  careerTotals,
  type CareerEditionInput,
  type CareerSeries,
} from "../../src/lib/player-career-model";
import type { MapPlay } from "../../src/lib/player-map-performance-model";

function series(
  teamA: string,
  teamB: string,
  winnerTeamId: string | null,
  at: string,
): CareerSeries {
  return {
    teamA,
    teamB,
    label: "Final",
    at,
    winnerTeamId,
    loserTeamId:
      winnerTeamId === null ? null : winnerTeamId === teamA ? teamB : teamA,
  };
}

function play(
  gameId: number,
  osuId: number,
  teamId: string,
  score: number,
  accuracy: number | null = 0.9,
): MapPlay {
  return {
    fixtureId: "fixture",
    gameId,
    stage: "Final",
    title: `Map ${gameId}`,
    slot: "NM1",
    at: "2024-01-01T00:00:00Z",
    osuId,
    teamId,
    score,
    accuracy,
  };
}

describe("careerTotals", () => {
  it("counts podiums, appearances, map places and map results", () => {
    const edition: CareerEditionInput = {
      editionSlug: "s1",
      roster: new Map([
        [1, ["a"]],
        [2, ["a"]],
        [3, ["b"]],
      ]),
      series: [
        series("a", "b", "a", "2024-01-01T00:00:00Z"),
        series("a", "b", "b", "2024-01-02T00:00:00Z"),
        series("a", "b", "a", "2024-01-03T00:00:00Z"),
        series("a", "b", "a", "2024-01-04T00:00:00Z"),
      ],
      podium: { champion: "a", runnerUp: "b", third: [] },
      plays: [
        play(1, 1, "a", 3000, 0.9),
        play(1, 2, "a", 2500, 0.8),
        play(1, 3, "b", 2000, 0.7),
        play(1, 4, "b", 1500, 0.6),
      ],
    };

    const totals = careerTotals([edition]);
    const first = totals.get(1)!;
    const second = totals.get(2)!;
    const third = totals.get(3)!;

    expect(first.seasons).toBe(1);
    expect(first.championships).toBe(1);
    expect(first.thirdPlaces).toBe(0);
    expect(first.firstPlaces).toBe(1);
    expect(first.mapsWon).toBe(1);
    expect(first.mapWinRate).toBe(1);
    expect(first.averageAccuracy).toBeCloseTo(0.9);
    expect(first.longestWinStreak).toBe(2);

    expect(second.secondPlaces).toBe(1);
    expect(second.mapsWon).toBe(1);
    expect(second.averageAccuracy).toBeCloseTo(0.8);

    expect(third.runnerUps).toBe(1);
    expect(third.thirdPlaceMaps).toBe(1);
    expect(third.mapsLost).toBe(1);
    expect(third.mapWinRate).toBe(0);
    expect(third.longestWinStreak).toBe(1);

    // A score below the counted minimum creates no career totals at all.
    expect(totals.has(4)).toBe(false);
  });

  it("orders streak matches across editions by their date", () => {
    const early: CareerEditionInput = {
      editionSlug: "s1",
      roster: new Map([[1, ["a"]]]),
      series: [
        series("a", "b", "a", "2024-01-01T00:00:00Z"),
        series("a", "b", "a", "2024-01-02T00:00:00Z"),
      ],
      podium: { champion: "a", runnerUp: "b", third: [] },
      plays: null,
    };
    const later: CareerEditionInput = {
      editionSlug: "s2",
      roster: new Map([[1, ["c"]]]),
      series: [
        series("c", "d", "c", "2022-01-01T00:00:00Z"),
        series("c", "d", null, "2022-01-02T00:00:00Z"),
        series("c", "d", "c", "2022-01-03T00:00:00Z"),
      ],
      podium: { champion: "d", runnerUp: "c", third: [] },
      plays: null,
    };

    const totals = careerTotals([later, early]).get(1)!;
    // 2022: win, draw, win; 2024: win, win. The last three wins run together.
    expect(totals.longestWinStreak).toBe(3);
    expect(totals.seasons).toBe(2);
    expect(totals.runnerUps).toBe(1);
    expect(totals.championships).toBe(1);
  });
});
