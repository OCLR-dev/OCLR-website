import type { HistoricalArchive } from "./historical-archive";
import type { MatchGame, MatchScore, MatchSource } from "./match-model";

export const statisticsSeasons = [
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
] as const;
/** Shared by navigation and saved-statistics reads; availability is not publication. */
export function supportsArchiveStatistics(slug: string) {
  return (statisticsSeasons as readonly string[]).includes(slug);
}
export type StatisticsSnapshot = {
  archiveKey: string;
  source: MatchSource;
  poolId: string;
  included: number[];
  allowUnlistedMaps?: boolean;
  excludedScores?: {
    gameId: number;
    osuId: number;
    reason?: "non-participant";
  }[];
  rosterTeamGames?: number[];
  technicalAdjudication?: boolean;
};
// Zero-score lobby occupants require an explicit review decision. A failed
// player's zero remains a real appearance unless the reviewer excludes it.
export function canExcludeStatisticsScore(score: MatchScore) {
  return (
    score.osuId !== null &&
    score.total === 0 &&
    score.combo === 0 &&
    score.accuracy === 0 &&
    // Modern ScoreStatistics is sparse. Do not invent missing hit counts as
    // zero; permit explicit review when misses are recorded and no successful
    // hits are reported, with independently recorded zero score/ACC/combo.
    score.hitCounts !== undefined &&
    score.hitCounts.miss !== null &&
    score.hitCounts.miss > 0 &&
    [score.hitCounts.great, score.hitCounts.ok, score.hitCounts.meh].every(
      (count) => count === null || count === 0,
    ) &&
    score.problems.length === 0
  );
}
// An explicit Admin review may exclude a lobby occupant with a nonzero score,
// but never an actual member of either recorded team. Raw provider data stays intact.
export function canExcludeNonParticipantScore(
  archive: HistoricalArchive,
  fixtureId: string,
  score: MatchScore,
) {
  const fixture = archive.matches.find((m) => m.id === fixtureId);
  const player = archive.players.find((p) => p.osuId === score.osuId);
  return (
    !!fixture &&
    score.osuId !== null &&
    score.total !== null &&
    score.problems.length === 0 &&
    ![fixture.teamA, fixture.teamB].includes(player?.teamId ?? "")
  );
}
// S2's organizer-supplied rules specify 3v3. Other supported editions retain
// the existing four-player safeguard. A slug alone cannot opt into S2's rule.
function statisticsLineupSize(archive: HistoricalArchive) {
  return archive.editionSlug === "s2" &&
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY(?:\/|$)/.test(
      archive.sourceUrl,
    )
    ? 3
    : 4;
}
// A reviewed bench occupant can also be on the edition roster. Require a full
// positive, retained same-team lineup after every exclusion.
export function canExcludeStatisticsBenchScore(
  archive: HistoricalArchive,
  fixtureId: string,
  game: MatchGame,
  score: MatchScore,
  excludedIds: number[] = [],
) {
  const fixture = archive.matches.find((m) => m.id === fixtureId);
  const team = archive.players.find((p) => p.osuId === score.osuId)?.teamId;
  return (
    !!fixture &&
    !!team &&
    [fixture.teamA, fixture.teamB].includes(team) &&
    score.osuId !== null &&
    score.total !== null &&
    score.problems.length === 0 &&
    new Set(
      game.scores
        .filter(
          (other) =>
            other.osuId !== score.osuId &&
            other.osuId !== null &&
            !excludedIds.includes(other.osuId) &&
            (other.total ?? 0) > 0 &&
            other.problems.length === 0 &&
            archive.players.find((p) => p.osuId === other.osuId)?.teamId ===
              team,
        )
        .map((other) => other.osuId),
    ).size >= statisticsLineupSize(archive)
  );
}
export function statisticsScores(
  game: MatchGame,
  excluded: NonNullable<StatisticsSnapshot["excludedScores"]> = [],
) {
  const ids = new Set(
    excluded
      .filter(
        (e) =>
          e.gameId === game.id &&
          game.scores.some(
            (score) =>
              score.osuId === e.osuId &&
              (e.reason === "non-participant" ||
                canExcludeStatisticsScore(score)),
          ),
      )
      .map((e) => e.osuId),
  );
  return game.scores.filter((score) => !ids.has(score.osuId!));
}
export function validStatisticsExclusions(
  snapshot: StatisticsSnapshot,
  archive?: HistoricalArchive,
  fixtureId?: string,
) {
  const excluded = snapshot.excludedScores ?? [];
  return (
    new Set(excluded.map((e) => `${e.gameId}:${e.osuId}`)).size ===
      excluded.length &&
    excluded.every((e) => {
      const game = snapshot.source.games.find((g) => g.id === e.gameId);
      const scores = game?.scores.filter((s) => s.osuId === e.osuId);
      return (
        scores?.length === 1 &&
        (e.reason === "non-participant"
          ? !!archive &&
            !!fixtureId &&
            (canExcludeNonParticipantScore(archive, fixtureId, scores[0]) ||
              canExcludeStatisticsBenchScore(
                archive,
                fixtureId,
                game!,
                scores[0],
                excluded
                  .filter((x) => x.gameId === e.gameId)
                  .map((x) => x.osuId),
              ))
          : canExcludeStatisticsScore(scores[0]))
      );
    })
  );
}
export type StatisticsSourceSummary = {
  mpId: number;
  fixtureId: string;
  version: number;
  importedAt: string | null;
  publishedAt: string | null;
  stale: boolean;
};
export function archiveMpId(url: string) {
  return Number(url.split("/").at(-1));
}
export function statisticsFixtures(archive: HistoricalArchive) {
  return archive.matches.filter(
    (m) =>
      m.score &&
      m.review?.status !== "pending" &&
      m.forfeitWinner === undefined,
  );
}
export function statisticsGameIssues(
  archive: HistoricalArchive,
  fixtureId: string,
  poolId: string,
  game: MatchGame,
  allowUnlistedMaps = false,
  excludedScores: StatisticsSnapshot["excludedScores"] = [],
  useRosterTeams = false,
) {
  const issues: string[] = [];
  const fixture = archive.matches.find((m) => m.id === fixtureId);
  const pool = archive.pools.find((p) => p.id === poolId);
  if (!fixture || (!pool && !allowUnlistedMaps))
    return ["Select the recorded mappool."];
  if (
    !allowUnlistedMaps &&
    !pool?.maps.some((m) => m.beatmapId === game.beatmapId)
  )
    issues.push("Beatmap is outside the selected mappool.");
  if (
    !game.endTime ||
    game.mode !== "osu" ||
    game.teamType !== "team-vs" ||
    !["score", "scorev2"].includes(game.scoringType ?? "")
  )
    issues.push("Game is unfinished or uses unsupported rules.");
  if (game.problems.length || !game.scores.length)
    issues.push("Game data is incomplete.");
  const seen = new Set<number>();
  const colors = new Map<string, Set<string>>();
  const teams = new Set<string>();
  for (const s of statisticsScores(game, excludedScores)) {
    const player = archive.players.find((p) => p.osuId === s.osuId);
    if (
      !player?.teamId ||
      ![fixture.teamA, fixture.teamB].includes(player.teamId) ||
      !s.osuId ||
      seen.has(s.osuId) ||
      s.total === null ||
      s.problems.length ||
      !["blue", "red"].includes(s.team ?? "")
    ) {
      issues.push("A score cannot be matched to the recorded roster.");
      continue;
    }
    seen.add(s.osuId);
    teams.add(player.teamId);
    const c = colors.get(s.team!) ?? new Set<string>();
    c.add(player.teamId);
    colors.set(s.team!, c);
  }
  if (
    teams.size !== 2 ||
    (!useRosterTeams &&
      (colors.size !== 2 ||
        [...colors.values()].some((c) => c.size !== 1) ||
        new Set([...colors.values()].flatMap((c) => [...c])).size !== 2))
  )
    issues.push("Team colors do not identify both recorded teams.");
  return [...new Set(issues)];
}
export function suggestStatisticsPool(
  archive: HistoricalArchive,
  source: MatchSource,
) {
  return (
    [...archive.pools].sort(
      (a, b) =>
        source.games.filter((g) =>
          b.maps.some((m) => m.beatmapId === g.beatmapId),
        ).length -
        source.games.filter((g) =>
          a.maps.some((m) => m.beatmapId === g.beatmapId),
        ).length,
    )[0]?.id ?? ""
  );
}
export function selectedStatisticsGames(snapshot: StatisticsSnapshot) {
  return snapshot.source.games.filter((g) => snapshot.included.includes(g.id));
}
export function fixtureStatisticsIssues(
  archive: HistoricalArchive,
  fixtureId: string,
  snapshots: StatisticsSnapshot[],
) {
  const fixture = archive.matches.find((m) => m.id === fixtureId);
  if (!fixture?.score || fixture.forfeitWinner !== undefined)
    return ["Only played matches have player statistics."];
  const ids = snapshots.map((s) => s.source.match.id);
  if (
    new Set(ids).size !== ids.length ||
    fixture.mpUrls.some((url) => !ids.includes(archiveMpId(url))) ||
    ids.some((id) => !fixture.mpUrls.some((url) => archiveMpId(url) === id))
  )
    return ["Import every recorded MP link before publishing this match."];
  const seen = new Set<number>();
  const wins = [0, 0];
  const issues: string[] = [];
  for (const s of snapshots) {
    if (!validStatisticsExclusions(s, archive, fixtureId))
      issues.push("Invalid score exclusions.");
    const rosterGames = s.rosterTeamGames ?? [];
    if (
      new Set(rosterGames).size !== rosterGames.length ||
      rosterGames.some((id) => !s.source.games.some((g) => g.id === id))
    )
      issues.push("Invalid roster-team review.");
    if (
      new Set(s.included).size !== s.included.length ||
      s.included.some((id) => !s.source.games.some((g) => g.id === id))
    )
      issues.push("Only eligible recorded games can be selected.");
    if (
      !s.source.complete ||
      !s.source.match.endTime ||
      s.source.currentGameId !== null
    )
      issues.push("Complete, closed MP history is required.");
    for (const g of selectedStatisticsGames(s)) {
      issues.push(
        ...statisticsGameIssues(
          archive,
          fixtureId,
          s.poolId,
          g,
          s.allowUnlistedMaps,
          s.excludedScores,
          s.rosterTeamGames?.includes(g.id),
        ),
      );
      // Review selects game identities, not unique beatmaps: a map may be played
      // again legitimately. Excluded replays remain in the published source.
      if (seen.has(g.id)) issues.push("Exclude duplicate games.");
      seen.add(g.id);
      const totals = [fixture.teamA, fixture.teamB].map((id) =>
        statisticsScores(g, s.excludedScores).reduce(
          (sum, score) =>
            sum +
            (archive.players.find((p) => p.osuId === score.osuId)?.teamId === id
              ? (score.total ?? 0)
              : 0),
          0,
        ),
      );
      if (totals[0] === totals[1]) issues.push("Tied maps require review.");
      else wins[totals[0] > totals[1] ? 0 : 1]++;
    }
  }
  const adjudicated =
    snapshots.length > 0 && snapshots.every((s) => s.technicalAdjudication);
  // An adjudicated point may have no MP score. Never fabricate that appearance
  // or relabel a raw map winner; retain the accepted series result separately.
  if (
    !seen.size ||
    (adjudicated
      ? seen.size > fixture.score[0] + fixture.score[1]
      : wins.some((n, i) => n !== fixture.score![i]))
  )
    issues.push(
      "Selected games do not reconcile with the recorded series score.",
    );
  return [...new Set(issues)];
}
export type StatisticsPlay = {
  fixtureId: string;
  mpId: number;
  gameId: number;
  stage: string;
  beatmapId: number;
  title: string;
  slot: string;
  at: string;
  osuId: number;
  teamId: string;
  score: number;
  scoringType: string;
  accuracy: number | null;
  combo: number | null;
  passed: boolean | null;
  mods: string[];
  hits: MatchScore["hitCounts"];
  relative: number | null;
};
export function projectStatistics(
  archive: HistoricalArchive,
  fixtureId: string,
  snapshot: StatisticsSnapshot,
): StatisticsPlay[] {
  const fixture = archive.matches.find((m) => m.id === fixtureId)!;
  const pool = archive.pools.find((p) => p.id === snapshot.poolId);
  return selectedStatisticsGames(snapshot).flatMap((g) => {
    const map = pool?.maps.find((m) => m.beatmapId === g.beatmapId);
    const scores = statisticsScores(g, snapshot.excludedScores);
    const maximum = Math.max(...scores.map((s) => s.total ?? 0));
    return scores.map((s) => ({
      fixtureId,
      mpId: snapshot.source.match.id,
      gameId: g.id,
      stage: fixture.stage,
      beatmapId: g.beatmapId!,
      title:
        map?.title ??
        ([g.beatmap?.artist, g.beatmap?.title, g.beatmap?.difficulty]
          .filter(Boolean)
          .join(" - ") ||
          "#" + g.beatmapId),
      slot: map?.slot ?? "—",
      at: g.startTime!,
      osuId: s.osuId!,
      teamId: archive.players.find((p) => p.osuId === s.osuId)!.teamId!,
      score: s.total!,
      scoringType: g.scoringType!,
      accuracy: s.accuracy,
      combo: s.combo,
      passed: s.passed,
      mods: [...new Set([...g.mods, ...s.mods])].sort(),
      hits: s.hitCounts,
      relative: maximum > 0 ? s.total! / maximum : null,
    }));
  });
}
const average = (values: (number | null)[]) => {
  const known = values.filter((n): n is number => n !== null);
  return known.length
    ? known.reduce((sum, n) => sum + n, 0) / known.length
    : null;
};
export function aggregateStatistics(
  archive: { players: Omit<HistoricalArchive["players"][number], "source">[] },
  plays: StatisticsPlay[],
) {
  return archive.players.map((player) => {
    const rows = plays.filter((p) => p.osuId === player.osuId);
    const combos = rows.flatMap((p) => (p.combo === null ? [] : [p.combo]));
    return {
      ...player,
      maps: rows.length,
      matches: new Set(rows.map((p) => p.fixtureId)).size,
      total: rows.length ? rows.reduce((sum, p) => sum + p.score, 0) : null,
      mean: average(rows.map((p) => p.score)),
      accuracy: average(rows.map((p) => p.accuracy)),
      accuracyMaps: rows.filter((p) => p.accuracy !== null).length,
      relative: average(rows.map((p) => p.relative)),
      combo: combos.length ? Math.max(...combos) : null,
      misses:
        rows.length &&
        rows.every((p) => p.hits?.miss !== null && p.hits?.miss !== undefined)
          ? rows.reduce((sum, p) => sum + p.hits!.miss!, 0)
          : null,
      passRate: average(
        rows.map((p) => (p.passed === null ? null : p.passed ? 1 : 0)),
      ),
    };
  });
}
