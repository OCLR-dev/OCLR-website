import { describe, it, expect } from "vitest";
import {
  archiveMatchDetails,
  detailGame,
  detailScore,
  sortDetailGames,
} from "../../src/lib/match-details-model";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import type { StatisticsSnapshot } from "../../src/lib/archive-statistics-model";
const snapshot = (): StatisticsSnapshot => ({
  archiveKey: "a".repeat(64),
  source: statisticsSource(),
  poolId: "final",
  included: [1, 2],
});
describe("public match detail projection", () => {
  it("retains multi-room game identity, repeated beatmaps, exclusions and chronological order", () => {
    const first = snapshot(),
      second = snapshot();
    first.source.games = first.source.games.slice(0, 1);
    second.source.match.id++;
    second.source.games = second.source.games.slice(3);
    second.included = [4];
    const d = archiveMatchDetails(statisticsArchive, "one", [
      { snapshot: second, revision: "second" },
      { snapshot: first, revision: "first" },
    ]);
    expect(d.sources).toHaveLength(2);
    expect(d.games.map((g) => g.gameId)).toEqual([1, 4]);
    expect(d.games.map((g) => g.beatmapId)).toEqual([10001, 10001]);
    expect(d.games[0].scores).toHaveLength(4);
    expect(d.games[0].scores[0].hits).toEqual({
      great: 90,
      ok: 5,
      meh: 2,
      miss: 3,
    });
  });
  it("preserves actual failed scores, zero, missing values and exclusion without leaking provider payload", () => {
    const s = statisticsSource().games[0].scores[0];
    s.passed = false;
    s.total = 123;
    s.accuracy = 0;
    s.combo = null;
    s.hitCounts = undefined;
    s.providerFields = { score: 123, secret: "PRIVATE", total_score: 456 };
    const row = detailScore(
      s,
      "Literal Player",
      "a",
      true,
      true,
      "substitution",
    );
    expect(row).toMatchObject({
      total: 123,
      effectiveTotal: 0,
      accuracy: 0,
      combo: null,
      hits: null,
      mapping: "substitution",
    });
    expect(JSON.stringify(row)).not.toContain("PRIVATE");
    expect(
      detailScore(s, "Literal Player", "a", false, true, null).effectiveTotal,
    ).toBeNull();
  });
  it("withholds unknown identities, keeps technical result separate and never invents totals", () => {
    const s = snapshot();
    s.technicalAdjudication = true;
    s.source.games[0].scores[0].osuId = 99999999;
    const d = archiveMatchDetails(statisticsArchive, "one", [
      { snapshot: s, revision: "published" },
    ]);
    expect(d.technicalAdjudication).toBe(true);
    expect(d.games[0].withheldScores).toBe(1);
    expect(d.games[0].rawTotals).toEqual([null, null]);
    expect(JSON.stringify(d)).not.toContain("99999999");
    expect(d.games.filter((g) => g.included)).toHaveLength(2);
    expect(d.games.find((g) => g.gameId === 4)?.included).toBe(false);
  });
  it("sorts offset timestamps by actual instant, keeping missing times last", () => {
    const g = statisticsSource().games[0];
    const make = (id: number, startTime: string | null) =>
      detailGame(
        { ...g, id, startTime },
        1,
        "published",
        false,
        [],
        ["a", "b"],
      );
    expect(
      sortDetailGames([
        make(1, "2020-01-01T08:00:00+08:00"),
        make(2, "2020-01-01T01:00:00Z"),
        make(3, null),
      ]).map((g) => g.gameId),
    ).toEqual([1, 2, 3]);
  });
  it("distinguishes absent provider mods from recorded no-mod plays", () => {
    const g = statisticsSource().games[0];
    const score = g.scores[0];
    expect(
      detailScore(score, "Known", "a", true, false, "roster").modsKnown,
    ).toBe(true);
    score.problems.push("Player mod data is unavailable.");
    expect(detailScore(score, "Known", "a", false, false, null)).toMatchObject({
      mods: [],
      modsKnown: false,
    });
    g.problems.push("Game mod data is unavailable.");
    expect(detailGame(g, 1, "v", false, [], ["a", "b"])).toMatchObject({
      mods: [],
      modsKnown: false,
    });
  });
  it("retains real tied zero totals and leaves missing teams unknown", () => {
    const g = statisticsSource().games[0];
    const scores = g.scores.map((s, i) =>
      detailScore(
        { ...s, total: 0 },
        String(s.osuId),
        i < 2 ? "a" : "b",
        true,
        false,
        "roster",
      ),
    );
    expect(detailGame(g, 1, "v", true, scores, ["a", "b"]).rawTotals).toEqual([
      0, 0,
    ]);
    expect(detailGame(g, 1, "v", true, [], ["a", "b"]).rawTotals).toEqual([
      null,
      null,
    ]);
  });
});
