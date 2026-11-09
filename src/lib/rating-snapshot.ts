import { createHash } from "node:crypto";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { classifyPlayer, PLAYER_CLASS_POLICY } from "./player-class";
import { STATISTICS_SCORE_POLICY } from "./statistics-score";
import { calculateRating, type RatingGame } from "./yumu-rating";

export type RatingSnapshot = ExplicitReadData<"matchRatingWorkspace">;

export function ratingSnapshot(
  games: RatingGame[],
  identities: Map<number, string>,
): RatingSnapshot {
  const report = calculateRating(games);
  const evidence = [
    ...new Map(
      games.map((g) => [
        g.gameId,
        {
          gameId: g.gameId,
          fixtureId: g.fixtureId,
          revision: g.revision,
          fingerprint: g.approvalFingerprint ?? g.fingerprint,
          ...(g.ezScoreMultiplier === undefined
            ? {}
            : {
                ezScoreMultiplier: g.ezScoreMultiplier,
                statisticsScorePolicy: STATISTICS_SCORE_POLICY,
              }),
        },
      ]),
    ).values(),
  ].sort((a, b) => a.gameId - b.gameId);
  const players = report.players.map((p) => ({
    ...p,
    classification: classifyPlayer(p, report.playerCount),
    username: identities.get(p.userId) ?? String(p.userId),
  }));
  return {
    ...report,
    classificationPolicy: PLAYER_CLASS_POLICY,
    players,
    evidence,
    fingerprint: createHash("sha256")
      .update(JSON.stringify([report, evidence, players]))
      .digest("hex"),
  };
}
