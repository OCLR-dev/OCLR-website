import type { RefereePolicy } from "./referee-model";

/** Resize the normal picks while retaining Ban order and restrictions of kept steps. */
export function refereePolicyForWins(
  policy: RefereePolicy,
  wins: number,
): RefereePolicy {
  if (!Number.isInteger(wins) || wins < 1 || wins > 99)
    throw new RangeError("Invalid series wins");
  const count = 2 * (wins - 1);
  const steps: RefereePolicy["steps"] = [];
  let picks = 0;
  let lastActor: "firstPick" | "secondPick" = "secondPick";
  for (const step of policy.steps) {
    if (step.kind === "tb") continue;
    if (step.kind === "pick") {
      if (picks >= count) continue;
      picks++;
      lastActor = step.actor as typeof lastActor;
    }
    steps.push(structuredClone(step));
  }
  while (picks < count) {
    lastActor = lastActor === "firstPick" ? "secondPick" : "firstPick";
    steps.push({
      kind: "pick",
      actor: lastActor,
      categories: [],
      entryIds: [],
      avoidRepeatCategory: false,
      tiedAt: null,
    });
    picks++;
  }
  const tb = policy.steps.find((step) => step.kind === "tb");
  steps.push(
    tb
      ? { ...structuredClone(tb), tiedAt: wins - 1 }
      : {
          kind: "tb",
          actor: "neutral",
          categories: ["TB"],
          entryIds: [],
          avoidRepeatCategory: false,
          tiedAt: wins - 1,
        },
  );
  return { ...structuredClone(policy), steps };
}
