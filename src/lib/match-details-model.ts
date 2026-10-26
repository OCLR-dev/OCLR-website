import type { MatchGame, MatchScore, ReviewedResult } from "./match-model";
import type { HistoricalArchive } from "./historical-archive";
import {
  statisticsScores,
  type StatisticsSnapshot,
} from "./archive-statistics-model";
import type { ratingSnapshot } from "./ratings";

export type MatchDetailScore = {
  osuId: number;
  username: string;
  teamId: string | null;
  lobbyTeam: MatchScore["team"];
  slot: number | null;
  total: number | null;
  effectiveTotal: number | null;
  accuracy: number | null;
  combo: number | null;
  passed: boolean | null;
  mods: string[];
  modsKnown: boolean;
  hits: NonNullable<MatchScore["hitCounts"]> | null;
  included: boolean;
  mapping: "roster" | "substitution" | null;
  providerScores: {
    score: number | null;
    legacy: number | null;
    total: number | null;
  };
};
export type MatchDetailGame = {
  mpId: number;
  gameId: number;
  revision: string;
  beatmapId: number | null;
  beatmap: MatchGame["beatmap"];
  startTime: string | null;
  endTime: string | null;
  mode: string | null;
  teamType: string | null;
  scoringType: string | null;
  mods: string[];
  modsKnown: boolean;
  included: boolean;
  rosterMapping: boolean;
  scores: MatchDetailScore[];
  withheldScores: number;
  rawTotals: [number | null, number | null];
  effectiveTotals: [number | null, number | null];
};
export type MatchDetails = {
  sources: { mpId: number; revision: string; complete: boolean }[];
  games: MatchDetailGame[];
  teamIds: [string, string];
  failedScorePolicy: "include" | "zero" | null;
  technicalAdjudication: boolean;
  rating: ReturnType<typeof ratingSnapshot> | null;
};
export function detailScore(
  s: MatchScore,
  username: string,
  teamId: string | null,
  included: boolean,
  zeroFailed: boolean,
  mapping: MatchDetailScore["mapping"],
): MatchDetailScore {
  const value = (key: string) =>
    typeof s.providerFields[key] === "number"
      ? (s.providerFields[key] as number)
      : null;
  return {
    osuId: s.osuId!,
    username,
    teamId,
    lobbyTeam: s.team,
    slot: s.slot,
    total: s.total,
    effectiveTotal: included
      ? zeroFailed && s.passed === false
        ? 0
        : s.total
      : null,
    accuracy: s.accuracy,
    combo: s.combo,
    passed: s.passed,
    mods: [...s.mods],
    modsKnown: !s.problems.includes("Player mod data is unavailable."),
    hits: s.hitCounts ? { ...s.hitCounts } : null,
    included,
    mapping,
    providerScores: {
      score: value("score"),
      legacy: value("legacy_total_score"),
      total: value("total_score"),
    },
  };
}
export function detailGame(
  g: MatchGame,
  mpId: number,
  revision: string,
  included: boolean,
  scores: MatchDetailScore[],
  teamIds: [string, string],
  rosterMapping = false,
): MatchDetailGame {
  const totals = (effective: boolean): [number | null, number | null] =>
    teamIds.map((id) => {
      const rows = scores.filter(
        (s) => s.teamId === id && (!effective || s.included),
      );
      // A missing/private/unmapped score makes a total unknown, never a fabricated zero.
      if (
        !rows.length ||
        (!effective && scores.length !== g.scores.length) ||
        scores.some((s) => s.teamId === null && (!effective || s.included)) ||
        (effective && !included)
      )
        return null;
      const values = rows.map((s) => (effective ? s.effectiveTotal : s.total));
      return values.some((v) => v === null)
        ? null
        : values.reduce<number>((n, v) => n + v!, 0);
    }) as [number | null, number | null];
  return {
    mpId,
    gameId: g.id,
    revision,
    beatmapId: g.beatmapId,
    beatmap: g.beatmap,
    startTime: g.startTime,
    endTime: g.endTime,
    mode: g.mode,
    teamType: g.teamType,
    scoringType: g.scoringType,
    mods: [...g.mods],
    modsKnown: !g.problems.includes("Game mod data is unavailable."),
    included,
    rosterMapping,
    scores,
    withheldScores: g.scores.length - scores.length,
    rawTotals: totals(false),
    effectiveTotals: totals(true),
  };
}
export function sortDetailGames(games: MatchDetailGame[]) {
  const time = (value: string | null) =>
    value === null ? Infinity : Date.parse(value);
  return games.sort(
    (a, b) =>
      time(a.startTime) - time(b.startTime) ||
      a.gameId - b.gameId ||
      a.mpId - b.mpId,
  );
}
export function reviewedMatchDetails(
  proposal: ReviewedResult,
  games: MatchGame[],
  mpId: number,
  revision: number,
  identities: Map<number, string>,
): MatchDetails {
  const projected = games.map((g) => {
    const reviewed = proposal.games.find((r) => r.gameId === g.id);
    const decision = proposal.decisions.find((d) => d.gameId === g.id);
    const scores = g.scores.flatMap((s) => {
      const username = s.osuId === null ? undefined : identities.get(s.osuId);
      if (username === undefined) return [];
      const attribution = reviewed?.attribution?.find(
        (a) => a.osuId === s.osuId,
      );
      const roster = proposal.rosterSnapshot.filter((r) =>
        r.osuIds.includes(s.osuId!),
      );
      const substitution = proposal.rulesSnapshot.allowSubstitutions
        ? decision?.substitutions.find((a) => a.osuId === s.osuId)
        : undefined;
      const teamId =
        attribution?.teamId ??
        (roster.length === 1 ? roster[0].teamId : substitution?.teamId) ??
        null;
      return [
        detailScore(
          s,
          username,
          teamId,
          !!reviewed,
          proposal.rulesSnapshot.failedScorePolicy === "zero",
          attribution?.evidence ??
            (roster.length === 1
              ? "roster"
              : substitution
                ? "substitution"
                : null),
        ),
      ];
    });
    const result = detailGame(
      g,
      mpId,
      String(revision),
      !!reviewed,
      scores,
      proposal.teamIds,
    );
    if (reviewed)
      result.effectiveTotals = [reviewed.homeScore, reviewed.awayScore];
    return result;
  });
  return {
    sources: [{ mpId, revision: String(revision), complete: true }],
    games: sortDetailGames(projected),
    teamIds: proposal.teamIds,
    failedScorePolicy: proposal.rulesSnapshot.failedScorePolicy,
    technicalAdjudication: false,
    rating: null,
  };
}
export function archiveMatchDetails(
  archive: HistoricalArchive,
  fixtureId: string,
  snapshots: { snapshot: StatisticsSnapshot; revision: string }[],
): MatchDetails {
  const fixture = archive.matches.find((f) => f.id === fixtureId)!;
  const teamIds: [string, string] = [fixture.teamA, fixture.teamB];
  const games = snapshots.flatMap(({ snapshot: s, revision }) =>
    s.source.games.map((g) => {
      const included = s.included.includes(g.id);
      const retained = statisticsScores(g, s.excludedScores);
      const scores = g.scores.flatMap((score) => {
        const p = archive.players.find((p) => p.osuId === score.osuId);
        if (!p) return [];
        return [
          detailScore(
            score,
            p.username,
            p.teamId && teamIds.includes(p.teamId) ? p.teamId : null,
            included && retained.includes(score),
            false,
            "roster",
          ),
        ];
      });
      return detailGame(
        g,
        s.source.match.id,
        revision,
        included,
        scores,
        teamIds,
        s.rosterTeamGames?.includes(g.id),
      );
    }),
  );
  return {
    sources: snapshots.map(({ snapshot: s, revision }) => ({
      mpId: s.source.match.id,
      revision,
      complete: s.source.complete,
    })),
    games: sortDetailGames(games),
    teamIds,
    failedScorePolicy: "include",
    technicalAdjudication: snapshots.some(
      (s) => s.snapshot.technicalAdjudication,
    ),
    rating: null,
  };
}
