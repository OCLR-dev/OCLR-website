import { describe, it, expect } from "vitest";
import { s11RefereeDefaults } from "../../src/lib/referee-defaults";
import { refereePolicyForWins } from "../../src/lib/referee-series";
import { refereePolicySchema } from "../../src/lib/referee-model";

describe("BO-linked BP and tiebreaker", () => {
  it("grows BO11 to BO13 and shrinks back without changing Bans, kept restrictions or other settings", () => {
    const policy = s11RefereeDefaults("11", {
      type: "first_to",
      wins: 6,
    })!.policy;
    policy.steps[2].categories = ["HD"];
    policy.maxReplaysPerMap = 2;
    const original = structuredClone(policy);
    const larger = refereePolicyForWins(policy, 7);
    expect(larger.steps.filter((step) => step.kind === "pick")).toHaveLength(
      12,
    );
    expect(larger.steps.at(-1)).toMatchObject({
      kind: "tb",
      tiedAt: 6,
      categories: ["TB"],
    });
    expect(larger.steps.filter((step) => step.kind === "ban")).toEqual(
      original.steps.filter((step) => step.kind === "ban"),
    );
    expect(larger.steps[2].categories).toEqual(["HD"]);
    expect(larger.maxReplaysPerMap).toBe(2);
    expect(refereePolicySchema.safeParse(larger).success).toBe(true);
    expect(refereePolicyForWins(larger, 6)).toEqual(original);
    expect(policy).toEqual(original);
  });
  it("adds the reserved TB when missing and alternates newly appended picks", () => {
    const policy = s11RefereeDefaults("11", {
      type: "first_to",
      wins: 6,
    })!.policy;
    policy.steps = policy.steps.slice(0, 3);
    const linked = refereePolicyForWins(policy, 3);
    expect(
      linked.steps
        .filter((step) => step.kind === "pick")
        .map((step) => step.actor),
    ).toEqual(["firstPick", "secondPick", "firstPick", "secondPick"]);
    expect(linked.steps.at(-1)).toMatchObject({
      kind: "tb",
      tiedAt: 2,
      categories: ["TB"],
    });
  });
  it("handles BO1 and rejects invalid win targets", () => {
    const policy = s11RefereeDefaults("11", {
      type: "first_to",
      wins: 6,
    })!.policy;
    expect(
      refereePolicyForWins(policy, 1).steps.filter(
        (step) => step.kind === "pick",
      ),
    ).toHaveLength(0);
    expect(refereePolicyForWins(policy, 1).steps.at(-1)?.tiedAt).toBe(0);
    for (const wins of [0, 100, 2.5, NaN])
      expect(() => refereePolicyForWins(policy, wins)).toThrow();
  });
});
