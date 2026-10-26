import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  statisticsArchive as a,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics";
import {
  aggregateStatistics,
  fixtureStatisticsIssues,
  statisticsGameIssues,
  projectStatistics,
  statisticsFixtures,
  suggestStatisticsPool,
  validStatisticsExclusions,
  canExcludeStatisticsScore,
  canExcludeStatisticsBenchScore,
  statisticsSeasons,
  type StatisticsSnapshot,
} from "../../src/lib/archive-statistics-model";
const snapshot = (): StatisticsSnapshot => ({
  source: statisticsSource(),
  archiveKey: statisticsArchiveKey(a),
  poolId: "final",
  included: [1, 2],
});
describe("historical MP statistics", () => {
  it("includes S2 ties and missing-MP matches in coverage without counting forfeits or pending reviews", () => {
    const archive = structuredClone(a);
    archive.editionSlug = "s2";
    archive.matches = [
      { ...archive.matches[0], score: [1, 1] },
      { ...archive.matches[0], id: "missing", mpUrls: [] },
      { ...archive.matches[0], id: "forfeit", score: null, forfeitWinner: 0 },
      {
        ...archive.matches[0],
        id: "pending",
        review: {
          status: "pending",
          workingScore: [2, 0],
          rawScore: [2, 0],
          possibleScore: null,
          note: "Synthetic pending",
          startedAt: null,
          redTeamId: "alpha",
          blueTeamId: "beta",
          games: [],
        },
      },
    ];
    expect(statisticsSeasons).toContain("s2");
    expect(statisticsFixtures(archive).map((m) => m.id)).toEqual([
      "one",
      "missing",
    ]);
    const s = snapshot();
    s.source.games[1].scores.forEach((p) => {
      p.total = p.team === "red" ? 100 : 10;
    });
    expect(fixtureStatisticsIssues(archive, "one", [s])).toEqual([]);
    expect(fixtureStatisticsIssues(archive, "missing", [])).not.toEqual([]);
    expect(fixtureStatisticsIssues(archive, "forfeit", [])).toContain(
      "Only played matches have player statistics.",
    );
  });
  it("requires three retained positive teammates for explicitly reviewed S2 bench records, guarded by the exact source", () => {
    const archive = structuredClone(a);
    archive.editionSlug = "s2";
    archive.sourceUrl =
      "https://docs.google.com/spreadsheets/d/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY";
    const s = snapshot(),
      game = s.source.games[0];
    for (const osuId of [91006, 91007]) {
      archive.players.push({
        ...archive.players[0],
        osuId,
        role: "player",
        tier: null,
      });
      game.scores.push({ ...game.scores[0], osuId });
    }
    game.scores[0].total = 50;
    const bench = game.scores[0];
    expect(canExcludeStatisticsBenchScore(archive, "one", game, bench)).toBe(
      true,
    );
    expect(
      canExcludeStatisticsBenchScore(archive, "one", game, bench, [91006]),
    ).toBe(false);
    s.excludedScores = [
      { gameId: 1, osuId: bench.osuId!, reason: "non-participant" },
    ];
    expect(validStatisticsExclusions(s, archive, "one")).toBe(true);
    expect(
      projectStatistics(archive, "one", s).filter(
        (p) => p.gameId === 1 && p.teamId === "alpha",
      ),
    ).toHaveLength(3);
    archive.sourceUrl += "-unrelated";
    expect(canExcludeStatisticsBenchScore(archive, "one", game, bench)).toBe(
      false,
    );
  });
  it("permits explicit review of sparse all-miss records without inventing unknown hit counts", () => {
    const s = statisticsSource().games[0].scores[0];
    Object.assign(s, {
      total: 0,
      accuracy: 0,
      combo: 0,
      hitCounts: { great: null, ok: null, meh: null, miss: 642 },
    });
    expect(canExcludeStatisticsScore(s)).toBe(true);
    expect(s.hitCounts).toEqual({
      great: null,
      ok: null,
      meh: null,
      miss: 642,
    });
    s.hitCounts!.great = 1;
    expect(canExcludeStatisticsScore(s)).toBe(false);
    s.hitCounts = undefined;
    expect(canExcludeStatisticsScore(s)).toBe(false);
    s.hitCounts = { great: null, ok: null, meh: null, miss: null };
    expect(canExcludeStatisticsScore(s)).toBe(false);
  });
  it("explicitly excludes reviewed zero-score occupants without changing raw MP or genuine failures", () => {
    const s = snapshot();
    const game = s.source.games[0];
    const occupant = {
      ...structuredClone(game.scores[0]),
      osuId: 999999,
      total: 0,
      accuracy: 0,
      combo: 0,
      passed: false,
      hitCounts: { great: 0, ok: 0, meh: 0, miss: 100 },
    };
    game.scores.push(occupant);
    expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
      "A score cannot be matched to the recorded roster.",
    );
    s.excludedScores = [{ gameId: game.id, osuId: 999999 }];
    expect(validStatisticsExclusions(s)).toBe(true);
    expect(fixtureStatisticsIssues(a, "one", [s])).toEqual([]);
    expect(projectStatistics(a, "one", s)).toHaveLength(8);
    expect(game.scores).toHaveLength(5);
    // A roster player's actual failure remains an appearance by default.
    game.scores[1] = { ...occupant, osuId: game.scores[1].osuId };
    expect(
      projectStatistics(a, "one", s).filter((p) => p.score === 0),
    ).toHaveLength(1);
  });
  it("rejects forged exclusions, duplicates, positive scores and partially played failures", () => {
    const s = snapshot();
    for (const excludedScores of [
      [{ gameId: 999, osuId: 91001 }],
      [{ gameId: 1, osuId: 999 }],
      [{ gameId: 1, osuId: 91001 }],
    ]) {
      s.excludedScores = excludedScores;
      expect(validStatisticsExclusions(s)).toBe(false);
      expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
        "Invalid score exclusions.",
      );
    }
    const p = s.source.games[0].scores[0];
    Object.assign(p, {
      total: 0,
      accuracy: 0,
      combo: 0,
      passed: false,
      hitCounts: { great: 1, ok: 0, meh: 0, miss: 100 },
    });
    expect(validStatisticsExclusions(s)).toBe(false);
    p.hitCounts!.great = 0;
    expect(validStatisticsExclusions(s)).toBe(true);
    // NF/pass flags do not establish participation; exclusion is still explicit.
    p.passed = true;
    expect(validStatisticsExclusions(s)).toBe(true);
    s.excludedScores!.push({ ...s.excludedScores![0] });
    expect(validStatisticsExclusions(s)).toBe(false);
  });
  it("requires explicit per-game UID team review and still rejects unknown identities", () => {
    const s = snapshot();
    s.source.games[0].scores[0].team = "red";
    expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
      "Team colors do not identify both recorded teams.",
    );
    s.rosterTeamGames = [1];
    expect(fixtureStatisticsIssues(a, "one", [s])).toEqual([]);
    expect(s.source.games[0].scores[0].team).toBe("red");
    expect(projectStatistics(a, "one", s)[0].teamId).toBe("alpha");
    s.source.games[0].scores[0].osuId = 999;
    expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
      "A score cannot be matched to the recorded roster.",
    );
    s.rosterTeamGames = [999];
    expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
      "Invalid roster-team review.",
    );
  });
  it("preserves adjudicated results without inventing scores or accepting extra games", () => {
    const archive = structuredClone(a);
    archive.matches[0].score = [2, 1];
    const s = snapshot();
    expect(fixtureStatisticsIssues(archive, "one", [s])).toContain(
      "Selected games do not reconcile with the recorded series score.",
    );
    s.technicalAdjudication = true;
    expect(fixtureStatisticsIssues(archive, "one", [s])).toEqual([]);
    expect(projectStatistics(archive, "one", s)).toHaveLength(8);
    expect(archive.matches[0].score).toEqual([2, 1]);
    s.included = [];
    expect(fixtureStatisticsIssues(archive, "one", [s])).not.toEqual([]);
    s.included = [1, 4];
    expect(fixtureStatisticsIssues(archive, "one", [s])).toEqual([]);
    s.included = [1, 2];
    archive.matches[0].score = [1, 0];
    expect(fixtureStatisticsIssues(archive, "one", [s])).not.toEqual([]);
  });
  it("allows explicit non-participant review without excluding real roster scores", () => {
    const s = snapshot();
    const game = s.source.games[0];
    game.scores.push({
      ...structuredClone(game.scores[0]),
      osuId: 91005,
      total: 3,
    });
    s.excludedScores = [{ gameId: 1, osuId: 91005, reason: "non-participant" }];
    expect(validStatisticsExclusions(s)).toBe(false);
    expect(fixtureStatisticsIssues(a, "one", [s])).toEqual([]);
    expect(projectStatistics(a, "one", s)).toHaveLength(8);
    expect(game.scores.at(-1)?.total).toBe(3);
    s.excludedScores[0].osuId = 91001;
    expect(validStatisticsExclusions(s, a, "one")).toBe(false);
    s.excludedScores[0].osuId = 99999;
    expect(validStatisticsExclusions(s, a, "one")).toBe(false);
  });
  it("permits only explicitly reviewed bench records beyond four retained teammates", () => {
    const archive = structuredClone(a),
      s = snapshot(),
      game = s.source.games[0];
    for (const uid of [91006, 91007, 91008]) {
      archive.players.push({
        ...archive.players[0],
        osuId: uid,
        username: "Synthetic teammate " + uid,
        role: "player",
        tier: null,
      });
      game.scores.push({ ...structuredClone(game.scores[0]), osuId: uid });
    }
    game.scores[0].total = 50;
    s.excludedScores = [{ gameId: 1, osuId: 91001, reason: "non-participant" }];
    expect(validStatisticsExclusions(s, archive, "one")).toBe(true);
    expect(fixtureStatisticsIssues(archive, "one", [s])).toEqual([]);
    expect(
      projectStatistics(archive, "one", s).filter(
        (p) => p.gameId === 1 && p.teamId === "alpha",
      ),
    ).toHaveLength(4);
    expect(game.scores[0].total).toBe(50);
    s.excludedScores.push({
      gameId: 1,
      osuId: 91006,
      reason: "non-participant",
    });
    expect(validStatisticsExclusions(s, archive, "one")).toBe(false);
    s.excludedScores = [{ gameId: 1, osuId: 91001, reason: "non-participant" }];
    game.scores.find((p) => p.osuId === 91008)!.total = 0;
    expect(validStatisticsExclusions(s, archive, "one")).toBe(false);
  });
  it("requires explicit review for missing historical pools and preserves MP metadata", () => {
    const s = snapshot();
    s.poolId = "";
    expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
      "Select the recorded mappool.",
    );
    s.allowUnlistedMaps = true;
    expect(fixtureStatisticsIssues(a, "one", [s])).toEqual([]);
    expect(projectStatistics(a, "one", s)[0]).toMatchObject({
      slot: "—",
      title: "Synthetic Artist - Synthetic Game - Test",
      scoringType: "score",
    });
  });
  it("covers the actual S7–S10 MP inventory and omits forfeits and unplayed records", () => {
    for (const slug of ["s7", "s8", "s9", "s10"]) {
      const archive = JSON.parse(
        readFileSync("docs/imports/" + slug + "-archive.json", "utf8"),
      );
      const fixtures = statisticsFixtures(archive);
      expect(fixtures.length).toBeGreaterThan(20);
      expect(
        fixtures.every(
          (f) => f.score && f.mpUrls.length && f.forfeitWinner === undefined,
        ),
      ).toBe(true);
    }
  });
  it("reconciles reviewed games, retains repeated maps and rejects warmups, duplicate game IDs and partial coverage", () => {
    expect(fixtureStatisticsIssues(a, "one", [snapshot()])).toEqual([]);
    const s = snapshot();
    s.included.push(3);
    expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
      "Beatmap is outside the selected mappool.",
    );
    s.included = [1, 4];
    expect(fixtureStatisticsIssues(a, "one", [s])).toEqual([]);
    s.source.games[3].id = 1;
    s.included = [1];
    expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
      "Exclude duplicate games.",
    );
    expect(fixtureStatisticsIssues(a, "one", [])).toContain(
      "Import every recorded MP link before publishing this match.",
    );
    s.included = [];
    expect(fixtureStatisticsIssues(a, "one", [s])).toContain(
      "Selected games do not reconcile with the recorded series score.",
    );
  });
  it("rejects unknown identities, colors, unfinished games and unsupported scoring", () => {
    const g = statisticsSource().games[0];
    g.scores[0].osuId = 123;
    expect(statisticsGameIssues(a, "one", "final", g)).toContain(
      "A score cannot be matched to the recorded roster.",
    );
    g.scores[0].osuId = 91001;
    g.scores[0].team = "red";
    expect(statisticsGameIssues(a, "one", "final", g)).toContain(
      "Team colors do not identify both recorded teams.",
    );
    g.endTime = null;
    g.scoringType = "combo";
    expect(statisticsGameIssues(a, "one", "final", g)).toContain(
      "Game is unfinished or uses unsupported rules.",
    );
  });
  it("aggregates by UID with honest missing values, failures and zero-score games", () => {
    const plays = projectStatistics(a, "one", snapshot());
    plays[0].accuracy = null;
    plays[0].passed = false;
    plays[0].hits = undefined;
    const rows = aggregateStatistics(a, plays);
    expect(rows.find((r) => r.osuId === 91001)).toMatchObject({
      maps: 2,
      matches: 1,
      total: 400,
      mean: 200,
      relative: 1,
      accuracy: 0.99,
      accuracyMaps: 1,
      passRate: 0.5,
      misses: null,
    });
    const empty = aggregateStatistics(a, []).find((r) => r.osuId === 91001)!;
    expect(empty).toMatchObject({
      maps: 0,
      total: null,
      relative: null,
      accuracy: null,
      combo: null,
      misses: null,
    });
    const s = snapshot();
    s.source.games[0].scores.forEach((p) => {
      p.total = 0;
    });
    expect(projectStatistics(a, "one", s)[0].relative).toBeNull();
  });
  it("selects the closest recorded pool and keys competition changes but not staff corrections", () => {
    expect(suggestStatisticsPool(a, statisticsSource())).toBe("final");
    const clone = structuredClone(a);
    clone.staff = [];
    clone.notes = [];
    expect(statisticsArchiveKey(clone)).toBe(statisticsArchiveKey(a));
    clone.matches[0].score = [3, 0];
    expect(statisticsArchiveKey(clone)).not.toBe(statisticsArchiveKey(a));
  });
});
