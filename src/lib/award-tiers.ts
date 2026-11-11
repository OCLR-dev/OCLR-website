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
/** Only complete, explicit passes over the same teams establish draft rounds.
 * Irregular custom orders have no inferred round: never guess a Tier. */
export function draftAwardTiers(
  sequence: string[],
  picks: { playerId: number; teamId: string; turnIndex: number }[],
  captainIds: number[],
): AwardTier[] {
  const teamIds = new Set(sequence);
  const captainTiers = [...new Set(captainIds)].map((userId) => ({
    userId,
    tier: 0,
  }));
  if (!teamIds.size) return captainTiers;
  const validRounds = new Set<number>();
  for (let start = 0; start < sequence.length; start += teamIds.size) {
    const pass = sequence.slice(start, start + teamIds.size);
    if (pass.length === teamIds.size && new Set(pass).size === teamIds.size)
      validRounds.add(Math.floor(start / teamIds.size) + 1);
  }
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
      const tier = Math.floor(p.turnIndex / teamIds.size) + 1;
      return !captainIds.includes(p.playerId) &&
        !duplicates.has(p.playerId) &&
        p.turnIndex >= 0 &&
        sequence[p.turnIndex] === p.teamId &&
        validRounds.has(tier)
        ? [{ userId: p.playerId, tier }]
        : [];
    })
    .sort((a, b) => a.userId - b.userId);
  return [...captainTiers, ...drafted].sort((a, b) => a.userId - b.userId);
}

export function awardTierLabel(tier: number | null | undefined) {
  return tier === 0 ? "Captain" : tier == null ? "—" : `T${tier}`;
}
