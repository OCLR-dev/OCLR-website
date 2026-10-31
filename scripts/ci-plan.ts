import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type CiSuite = "checks" | "core" | "full";

export type CiPlan = {
  suite: CiSuite;
  e2e: boolean;
  full: boolean;
  e2e_shards: number[];
  reason: string;
};

/** Browser coverage is scheduled or explicitly requested, never per push/PR. */
export function planCi(suite: CiSuite = "checks"): CiPlan {
  const full = suite === "full";
  return {
    suite,
    e2e: suite !== "checks",
    full,
    e2e_shards: full ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2],
    reason: full
      ? "explicit manual full acceptance"
      : suite === "core"
        ? "scheduled or explicit manual core smoke"
        : "checks and build only; browser regression is scheduled or manual",
  };
}

export function selectCiSuite(event: string, suite: string): CiSuite {
  if (event === "schedule") return "core";
  if (event === "workflow_dispatch" && (suite === "core" || suite === "full"))
    return suite;
  return "checks";
}

type Need = { result: string; outputs?: Record<string, string> };
export function assertCiGate(needs: Record<string, Need>): void {
  for (const job of ["plan", "verify", "build"])
    if (needs[job]?.result !== "success")
      throw new Error("Selected job did not succeed: " + job);
  const raw = needs.plan.outputs?.json;
  if (!raw) throw new Error("Missing CI plan");
  const plan = JSON.parse(raw) as CiPlan;
  if (
    !["checks", "core", "full"].includes(plan.suite) ||
    plan.full !== (plan.suite === "full") ||
    plan.e2e !== (plan.suite !== "checks") ||
    JSON.stringify(plan.e2e_shards) !==
      JSON.stringify(planCi(plan.suite).e2e_shards)
  )
    throw new Error("Invalid CI plan");
  for (const job of ["e2e", "remote-e2e", "header-e2e", "remote-matrix"])
    if (
      (job === "e2e" || job === "remote-e2e" ? plan.e2e : plan.full)
        ? needs[job]?.result !== "success"
        : needs[job]?.result !== "skipped"
    )
      throw new Error("Browser job did not satisfy CI plan: " + job);
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
      selectCiSuite(process.env.CI_EVENT ?? "", process.env.CI_SUITE ?? ""),
    );
    console.log(JSON.stringify(plan, null, 2));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        "json=" +
          JSON.stringify(plan) +
          "\ne2e=" +
          plan.e2e +
          "\nfull=" +
          plan.full +
          "\ne2e_shards=" +
          JSON.stringify(plan.e2e_shards) +
          "\n",
      );
  }
}
