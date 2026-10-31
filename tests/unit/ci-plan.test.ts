import { describe, expect, it } from "vitest";
import {
  planCi,
  assertCiGate,
  type CiSuite,
  type CiPlan,
} from "../../scripts/ci-plan";
function needs(plan: CiPlan) {
  return {
    plan: { result: "success", outputs: { json: JSON.stringify(plan) } },
    verify: { result: "success" },
    build: { result: "success" },
    e2e: { result: plan.e2e ? "success" : "skipped" },
    "remote-e2e": { result: plan.e2e ? "success" : "skipped" },
    "header-e2e": { result: plan.full ? "success" : "skipped" },
    "remote-matrix": { result: plan.full ? "success" : "skipped" },
  };
}
describe("checks/core/full CI policy", () => {
  it("defaults to checks without browsers", () =>
    expect(planCi()).toMatchObject({
      suite: "checks",
      e2e: false,
      full: false,
      e2e_shards: [1, 2],
    }));
  it("preserves eight full functional shards on explicit opt-in", () =>
    expect(planCi("full")).toMatchObject({
      full: true,
      e2e_shards: [1, 2, 3, 4, 5, 6, 7, 8],
    }));
  for (const suite of ["checks", "core", "full"] as CiSuite[]) {
    const plan = planCi(suite);
    it(`accepts the selected ${suite} suite`, () =>
      expect(() => assertCiGate(needs(plan))).not.toThrow());
    for (const job of ["plan", "verify", "build"] as const)
      for (const result of ["failure", "cancelled", "skipped", ""])
        it(`rejects ${job} ${result} in suite=${suite}`, () => {
          const input = needs(plan);
          input[job].result = result;
          expect(() => assertCiGate(input)).toThrow();
        });
    for (const job of [
      "e2e",
      "remote-e2e",
      "header-e2e",
      "remote-matrix",
    ] as const)
      for (const result of ["success", "skipped", "failure", "cancelled", ""])
        it(`validates ${job} ${result} in suite=${suite}`, () => {
          const input = needs(plan);
          const expected = input[job].result;
          input[job].result = result;
          if (result === expected)
            expect(() => assertCiGate(input)).not.toThrow();
          else expect(() => assertCiGate(input)).toThrow();
        });
  }
  for (const invalid of [
    { ...planCi(), suite: "unknown" },
    { ...planCi(), e2e: true },
    { ...planCi("core"), full: true },
    { ...planCi("full"), e2e_shards: [1, 2] },
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
