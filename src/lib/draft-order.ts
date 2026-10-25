export type DraftOrderMode = "snake" | "forward" | "custom";
export const maxDraftTurns = 4096;
export function generateTurnSequence(
  teamIds: string[],
  rounds: number,
  strategy: Exclude<DraftOrderMode, "custom">,
): string[] {
  if (
    !teamIds.length ||
    teamIds.some((id) => !id.trim()) ||
    new Set(teamIds).size !== teamIds.length
  )
    throw new Error("Use a nonempty order of distinct teams.");
  if (
    !Number.isSafeInteger(rounds) ||
    rounds < 1 ||
    rounds * teamIds.length > maxDraftTurns
  )
    throw new Error(
      `Choose whole rounds totaling at most ${maxDraftTurns} picks.`,
    );
  if (strategy !== "snake" && strategy !== "forward")
    throw new Error("Choose Snake or Repeat forward.");
  return Array.from({ length: rounds }, (_, i) =>
    strategy === "snake" && i % 2 ? [...teamIds].reverse() : [...teamIds],
  ).flat();
}
// The explicit sequence remains authoritative. Ambiguous or irregular saved orders are Custom.
export function detectDraftOrder(
  teamIds: string[],
  sequence: string[],
): DraftOrderMode {
  if (!teamIds.length || !sequence.length || sequence.length % teamIds.length)
    return "custom";
  const rounds = sequence.length / teamIds.length;
  const same = (mode: "snake" | "forward") =>
    generateTurnSequence(teamIds, rounds, mode).every(
      (id, i) => id === sequence[i],
    );
  const snake = same("snake"),
    forward = same("forward");
  return snake === forward ? "custom" : snake ? "snake" : "forward";
}
// Unsaved drafts preselect Snake (#280); a saved sequence keeps its detected mode.
export function initialDraftOrderMode(
  teamIds: string[],
  saved: string[],
): DraftOrderMode {
  return saved.length ? detectDraftOrder(teamIds, saved) : "snake";
}
export function turnSequenceProblem(
  sequence: string[],
  teams: { id: string; capacity: number | null; members: number }[],
  poolSize?: number,
): string | null {
  if (!teams.length) return "Configure captain teams first.";
  if (!sequence.length) return "Add at least one pick to the sequence.";
  if (sequence.length > maxDraftTurns)
    return `Use at most ${maxDraftTurns} picks.`;
  if (sequence.some((id) => !teams.some((t) => t.id === id)))
    return "Every turn must reference a current edition team.";
  if (poolSize !== undefined && sequence.length > poolSize)
    return "The configured turns exceed the eligible pool.";
  if (
    teams.some(
      (t) =>
        t.capacity !== null &&
        t.members + sequence.filter((id) => id === t.id).length > t.capacity,
    )
  )
    return "The turn sequence exceeds an approved team capacity (including the captain).";
  return null;
}

/** Save/start validate references, not nominal readiness; picks enforce actual capacity. */
export function turnSequenceStructureProblem(
  sequence: string[],
  teams: { id: string }[],
) {
  return turnSequenceProblem(
    sequence,
    teams.map((t) => ({ ...t, capacity: null, members: 0 })),
  );
}
