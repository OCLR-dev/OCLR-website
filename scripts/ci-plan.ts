import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type CiPlan = {
  full: boolean;
  e2e_shards: number[];
  reason: string;
};

/** Ordinary CI always stays core; only an explicit manual full opts in. */
export function planCi(full = false): CiPlan {
  return {
    full,
    e2e_shards: full ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2],
    reason: full
      ? "explicit manual full acceptance"
      : "fixed core smoke; full regression is manual",
  };
}

type Need = { result: string; outputs?: Record<string, string> };
export function assertCiGate(needs: Record<string, Need>): void {
  for (const job of ["plan", "verify", "build", "e2e", "remote-e2e"])
    if (needs[job]?.result !== "success")
      throw new Error("Selected job did not succeed: " + job);
  const raw = needs.plan.outputs?.json;
  if (!raw) throw new Error("Missing CI plan");
  const plan = JSON.parse(raw) as CiPlan;
  if (
    typeof plan.full !== "boolean" ||
    JSON.stringify(plan.e2e_shards) !==
      JSON.stringify(planCi(plan.full).e2e_shards)
  )
    throw new Error("Invalid CI plan");
  for (const job of ["header-e2e", "remote-matrix"])
    if (
      plan.full
        ? needs[job]?.result !== "success"
        : needs[job]?.result !== "skipped"
    )
      throw new Error("Full-only job did not satisfy CI plan: " + job);
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (process.argv[2] === "gate") {
    assertCiGate(JSON.parse(process.env.CI_NEEDS ?? "{}"));
    console.log("All checks selected by the CI plan succeeded.");
  } else {
    const plan = planCi(
      process.env.CI_EVENT === "workflow_dispatch" &&
        process.env.CI_SUITE === "full",
    );
    console.log(JSON.stringify(plan, null, 2));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        "json=" +
          JSON.stringify(plan) +
          "\nfull=" +
          plan.full +
          "\ne2e_shards=" +
          JSON.stringify(plan.e2e_shards) +
          "\n",
      );
  }
}
