import type { RefereeResultGame, SeriesOutcome } from "./match-model";
import type { RefereeWorkspace } from "./referee-workspace";

export type RefereeResultReview = {
  revision: number;
  dependencyFingerprint: string;
  games: RefereeResultGame[];
  series: SeriesOutcome;
  blocker: string | null;
};

/** Count only the final attempt for each active pick or tiebreak. */
export function previewRefereeResult(
  workspace: RefereeWorkspace,
): RefereeResultReview | null {
  const { session, projection, rules, fixture, dependencyFingerprint } =
    workspace;
  if (!session) return null;

  const games: RefereeResultGame[] = [];
  let unresolved = false;
  let extra = false;
  let homeWins = 0;
  let awayWins = 0;
  let tiedMaps = 0;
  for (const pick of projection.activeSelections) {
    if (pick.kind === "ban") continue;
    const attempt = pick.attempts.at(-1);
    if (!attempt) {
      unresolved = true;
      continue;
    }
    const winner = attempt.winnerTeamId;
    const validWinner =
      attempt.status === "completed" &&
      (winner === fixture.homeTeamId || winner === fixture.awayTeamId) &&
      winner !== null;
    const validTie =
      attempt.status === "tied" && rules?.tiedMapPolicy === "count_as_draw";
    if (!validWinner && !validTie) {
      unresolved = true;
      continue;
    }
    if (
      rules?.series.type === "first_to" &&
      Math.max(homeWins, awayWins) >= rules.series.wins
    )
      extra = true;
    if (validTie) tiedMaps++;
    else if (winner === fixture.homeTeamId) homeWins++;
    else awayWins++;
    games.push({
      attemptId: attempt.id,
      beatmapId: pick.beatmapId,
      category: pick.category,
      winnerTeamId: validTie ? null : winner,
    });
  }
  const draw = homeWins === awayWins;
  const series = rules?.series;
  const resolved =
    series?.type === "first_to"
      ? !extra && !draw && Math.max(homeWins, awayWins) === series.wins
      : series?.type === "fixed_maps" &&
        games.length === series.count &&
        (!draw || series.allowDraw);
  const blocker =
    session.dependencyFingerprint !== dependencyFingerprint
      ? "Reconfirm the fixture dependencies in the referee workspace."
      : fixture.status === "cancelled" ||
          !fixture.homeTeamId ||
          !fixture.awayTeamId ||
          fixture.homeTeamId === fixture.awayTeamId ||
          unresolved ||
          !resolved ||
          !games.length
        ? "The saved referee outcomes do not complete the configured series."
        : null;
  return {
    revision: session.revision,
    dependencyFingerprint,
    games,
    series: {
      homeWins,
      awayWins,
      tiedMaps,
      includedGames: games.length,
      winnerTeamId:
        blocker || draw
          ? null
          : homeWins > awayWins
            ? fixture.homeTeamId
            : fixture.awayTeamId,
      draw: !blocker && draw,
      complete: !blocker,
    },
    blocker,
  };
}
