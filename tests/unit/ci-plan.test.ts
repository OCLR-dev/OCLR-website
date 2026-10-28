import { describe, expect, it } from "vitest";
import { planCi, assertCiGate, type CiPlan } from "../../scripts/ci-plan";
function needs(plan: CiPlan) {
  return {
    plan: { result: "success", outputs: { json: JSON.stringify(plan) } },
    verify: { result: "success" },
    build: { result: "success" },
    e2e: { result: "success" },
    "remote-e2e": { result: "success" },
    "header-e2e": { result: plan.full ? "success" : "skipped" },
    "remote-matrix": { result: plan.full ? "success" : "skipped" },
  };
}
describe("core/full CI policy", () => {
  it("defaults to two core shards", () =>
    expect(planCi()).toMatchObject({ full: false, e2e_shards: [1, 2] }));
  it("preserves eight full functional shards on explicit opt-in", () =>
    expect(planCi(true)).toMatchObject({
      full: true,
      e2e_shards: [1, 2, 3, 4, 5, 6, 7, 8],
    }));
  for (const full of [false, true]) {
    const plan = planCi(full);
    it(`accepts the selected ${full ? "full" : "core"} suite`, () =>
      expect(() => assertCiGate(needs(plan))).not.toThrow());
    for (const job of ["plan", "verify", "build", "e2e", "remote-e2e"] as const)
      for (const result of ["failure", "cancelled", "skipped", ""])
        it(`rejects ${job} ${result} in full=${full}`, () => {
          const input = needs(plan);
          input[job].result = result;
          expect(() => assertCiGate(input)).toThrow();
        });
    for (const job of ["header-e2e", "remote-matrix"] as const)
      it(`does not conceal ${job} failure in full=${full}`, () => {
        const input = needs(plan);
        input[job].result = "failure";
        expect(() => assertCiGate(input)).toThrow();
      });
  }
  for (const invalid of [
    { full: "false" },
    { full: false, e2e_shards: [1] },
    { full: true, e2e_shards: [1, 2] },
    {},
  ])
    it("rejects malformed coverage plans " + JSON.stringify(invalid), () => {
      const input = needs(planCi());
      input.plan.outputs.json = JSON.stringify(invalid);
      expect(() => assertCiGate(input)).toThrow();
    });
  it("rejects missing or malformed plan JSON", () => {
    const input = needs(planCi());
    input.plan.outputs.json = "";
    expect(() => assertCiGate(input)).toThrow();
    input.plan.outputs.json = "{";
    expect(() => assertCiGate(input)).toThrow();
  });
});
