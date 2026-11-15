import type { RefereeProjection } from "./referee-model";

export type ReconciliationLink = {
  attemptId: string;
  importId: string | null;
  sourceFingerprint: string | null;
  gameId: number | null;
  sessionRevision: number;
  dependencyFingerprint: string;
};
export type ReconciliationSource = {
  importId: string;
  fingerprint: string;
  matchId: number;
  complete: boolean;
  current: boolean;
  games: {
    id: number;
    beatmapId: number | null;
    winnerTeamId: string | null;
    tied: boolean;
    ended: boolean;
    problems: string[];
  }[];
};
/** Never match by beatmap alone: repeat plays, warmups and replays require a human choice. */
export function compareRefereeAttempts(
  projection: RefereeProjection,
  links: ReconciliationLink[],
  sources: ReconciliationSource[],
  revision: number,
  dependencyFingerprint: string,
) {
  return projection.activeSelections.flatMap((selection) =>
    selection.attempts.map((attempt) => {
      const link = links.find((l) => l.attemptId === attempt.id);
      const source = sources.find((s) => s.importId === link?.importId);
      const game = source?.games.find((g) => g.id === link?.gameId);
      let status:
        | "unmatched"
        | "stale"
        | "missing"
        | "incomplete"
        | "different_map"
        | "different_result"
        | "matched" = "unmatched";
      if (link?.importId) {
        if (
          link.sessionRevision !== revision ||
          link.dependencyFingerprint !== dependencyFingerprint ||
          !source?.current ||
          source.fingerprint !== link.sourceFingerprint
        )
          status = "stale";
        else if (!game) status = "missing";
        else if (game.beatmapId !== selection.beatmapId)
          status = "different_map";
        else if (
          !source.complete ||
          !game.ended ||
          game.problems.length ||
          ["pending", "playing"].includes(attempt.status)
        )
          status = "incomplete";
        else if (
          attempt.status === "completed"
            ? game.winnerTeamId !== attempt.winnerTeamId || game.tied
            : attempt.status === "tied"
              ? !game.tied
              : true
        )
          status = "different_result";
        else status = "matched";
      }
      return {
        attemptId: attempt.id,
        pickId: selection.id,
        pickTeamId: selection.teamId,
        beatmapId: selection.beatmapId,
        category: selection.category,
        attemptNumber: attempt.number,
        attemptStatus: attempt.status,
        winnerTeamId: attempt.winnerTeamId,
        // Input may be a database row. Keep request keys and receipt hashes server-only.
        link: link
          ? {
              attemptId: link.attemptId,
              importId: link.importId,
              sourceFingerprint: link.sourceFingerprint,
              gameId: link.gameId,
              sessionRevision: link.sessionRevision,
              dependencyFingerprint: link.dependencyFingerprint,
            }
          : null,
        sourceWinnerTeamId: game?.winnerTeamId ?? null,
        status,
      };
    }),
  );
}

export const noGameLink = "unlink";
export const unavailableGameLink = "unavailable";

type AttemptForLinking = {
  attemptId: string;
  beatmapId: number;
  link: ReconciliationLink | null;
  attemptStatus: string;
  winnerTeamId: string | null;
};

export function reconciliationOptions<T extends AttemptForLinking>(
  rows: T[],
  sources: ReconciliationSource[],
) {
  const currentGames = sources
    .filter((source) => source.current)
    .flatMap((source) =>
      source.games.map((game) => ({
        ...game,
        importId: source.importId,
        fingerprint: source.fingerprint,
        matchId: source.matchId,
        complete: source.complete,
        value: `${source.importId}:${game.id}`,
      })),
    );
  const occupiedGameIds = new Set(rows.map((row) => row.link?.gameId));
  return rows.map((row) => {
    const games = currentGames.filter(
      (game) => game.beatmapId === row.beatmapId,
    );
    const savedSource = sources.find(
      (source) => source.importId === row.link?.importId,
    );
    const savedGame = games.find(
      (game) =>
        game.id === row.link?.gameId &&
        (game.importId === row.link?.importId ||
          game.matchId === savedSource?.matchId),
    );
    const pickedOnce =
      rows.filter((attempt) => attempt.beatmapId === row.beatmapId).length ===
      1;
    const uniqueGame = games.length === 1 ? games[0] : null;
    const agreesWithRecord =
      uniqueGame &&
      (row.attemptStatus === "tied"
        ? uniqueGame.tied
        : row.attemptStatus === "completed" &&
          row.winnerTeamId !== null &&
          !uniqueGame.tied &&
          uniqueGame.winnerTeamId === row.winnerTeamId);
    return {
      ...row,
      games,
      savedValue: row.link?.importId
        ? (savedGame?.value ?? unavailableGameLink)
        : "",
      suggestion:
        !row.link?.importId &&
        pickedOnce &&
        uniqueGame?.ended &&
        uniqueGame.complete &&
        !uniqueGame.problems.length &&
        agreesWithRecord &&
        !occupiedGameIds.has(uniqueGame.id)
          ? uniqueGame.value
          : null,
    };
  });
}
