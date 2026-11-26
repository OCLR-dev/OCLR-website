import type { AwardTier } from "./award-model";
import type { DraftBoard } from "./draft-types";

export function draftBoardTiers(
  board: Pick<DraftBoard, "picks" | "rosters">,
  turnSequence: string[],
) {
  return new Map(
    draftAwardTiers(
      turnSequence,
      board.picks.map(({ player, team, turnIndex }) => ({
        playerId: player.osuId,
        teamId: team.id,
        turnIndex,
      })),
      board.rosters.map(({ team }) => team.captain.osuId),
    ).map(({ userId, tier }) => [userId, tier]),
  );
}
/** A round needs one configured turn for every team. Custom partial or
 * repeated-team passes have no authoritative round positions. */
export function draftRoundPositions(sequence: readonly string[]) {
  const width = new Set(sequence).size;
  const positions = new Map<number, { round: number; position: number }>();
  if (!width) return positions;
  for (let start = 0; start + width <= sequence.length; start += width) {
    if (new Set(sequence.slice(start, start + width)).size !== width) continue;
    for (let position = 0; position < width; position++) {
      positions.set(start + position, {
        round: start / width + 1,
        position: position + 1,
      });
    }
  }
  return positions;
}

/** Only complete, explicit passes over the same teams establish draft rounds.
 * Irregular custom orders have no inferred round: never guess a Tier. */
export function draftAwardTiers(
  sequence: string[],
  picks: { playerId: number; teamId: string; turnIndex: number }[],
  captainIds: number[],
): AwardTier[] {
  const positions = draftRoundPositions(sequence);
  const captainTiers = [...new Set(captainIds)].map((userId) => ({
    userId,
    tier: 0,
  }));
  if (!positions.size) return captainTiers;
  const duplicates = new Set(
    picks
      .filter((p, i) =>
        picks.some(
          (other, j) =>
            j !== i &&
            (other.playerId === p.playerId || other.turnIndex === p.turnIndex),
        ),
      )
      .map((p) => p.playerId),
  );
  const drafted = picks
    .flatMap((p) => {
      const tier = positions.get(p.turnIndex)?.round;
      return !captainIds.includes(p.playerId) &&
        !duplicates.has(p.playerId) &&
        sequence[p.turnIndex] === p.teamId &&
        tier !== undefined
        ? [{ userId: p.playerId, tier }]
        : [];
    })
    .sort((a, b) => a.userId - b.userId);
  return [...captainTiers, ...drafted].sort((a, b) => a.userId - b.userId);
}

export function awardTierLabel(tier: number | null | undefined) {
  return tier === 0 ? "Captain" : tier == null ? "—" : `T${tier}`;
}
