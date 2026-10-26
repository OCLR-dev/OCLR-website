import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export type CiPlan = {
  full: boolean;
  header_mode: "smoke" | "full";
  header_appearances: string;
  remote_matrix: boolean;
  reason: string;
};

const themeFiles: Record<string, string> = {
  "pastel-theme.css": "cute-pastel",
  "swiss-theme.css": "swiss-minimal",
  "clay-theme.css": "claymorphism",
  "manga-theme.css": "manga-halftone",
  "glass-theme.css": "glassmorphism",
  "esports-theme.css": "esports-broadcast",
  "arcade-theme.css": "retro-arcade",
  "frutiger-theme.css": "frutiger-aero",
  "skyline-theme.css": "skyline-pop",
};
const sharedHeader = new Set([
  "src/app/layout.tsx",
  "src/app/globals.css",
  "src/lib/preferences.ts",
  "src/components/header.tsx",
  "src/components/site-frame.tsx",
  "src/components/avatar.tsx",
  "src/components/oclr-logo.tsx",
  "src/components/theme-control.tsx",
  "src/components/appearance-control.tsx",
  "src/components/language-control.tsx",
  "src/components/language-control.module.css",
  "tests/e2e/header-overlap.spec.ts",
  "tests/fixtures/header-matrix.ts",
]);

function fullPlan(reason: string): CiPlan {
  return {
    full: true,
    header_mode: "full",
    header_appearances: "",
    remote_matrix: true,
    reason,
  };
}

/** Unknown files and unavailable diffs receive complete coverage. */
export function planCi(files: string[] | undefined, forceFull = false): CiPlan {
  if (forceFull)
    return fullPlan("scheduled or explicitly requested full acceptance");
  if (!files) return fullPlan("changed-file list unavailable");
  let allHeaders = false;
  let remote = false;
  const themes = new Set<string>();
  for (const file of files) {
    if (!file || file.includes("..") || file.includes("\\"))
      return fullPlan("unrecognized changed path");
    if (
      sharedHeader.has(file) ||
      file.startsWith("public/fonts/") ||
      file.startsWith("public/oclr-")
    )
      allHeaders = true;
    if (/^src\/app\/[^/]+-theme\.css$/.test(file)) {
      const appearance = themeFiles[file.slice("src/app/".length)];
      if (!appearance) return fullPlan("unregistered theme file");
      themes.add(appearance);
      continue;
    }
    if (file.endsWith(".css")) {
      if (!file.startsWith("src/")) return fullPlan("unrecognized stylesheet");
      continue;
    }
    if (file.startsWith("src/") || file.startsWith("drizzle/")) {
      remote = true;
      continue;
    }
    if (file.startsWith("tests/remote-e2e/")) {
      remote = true;
      continue;
    }
    if (file.startsWith("tests/e2e/")) continue;
    if (file.startsWith("tests/unit/") || file.startsWith("tests/integration/"))
      continue;
    // Public assets and prose cannot silently exclude application tests:
    // functional E2E and remote permission tests still run for these changes.
    if (file.startsWith("public/") || file.endsWith(".md")) continue;
    return fullPlan("unclassified changed path: " + JSON.stringify(file));
  }
  return {
    full: false,
    header_mode: allHeaders || themes.size ? "full" : "smoke",
    header_appearances: allHeaders ? "" : [...themes].sort().join(","),
    remote_matrix: remote,
    reason:
      "all functional E2E; header and remote coverage selected from changed paths",
  };
}

type Need = { result: string; outputs?: Record<string, string> };
export function assertCiGate(needs: Record<string, Need>): void {
  for (const job of [
    "plan",
    "verify",
    "build",
    "e2e",
    "header-e2e",
    "remote-e2e",
  ])
    if (needs[job]?.result !== "success")
      throw new Error("Required job did not succeed: " + job);
  const raw = needs.plan.outputs?.json;
  if (!raw) throw new Error("Missing CI plan");
  const plan = JSON.parse(raw) as CiPlan;
  if (
    typeof plan.full !== "boolean" ||
    typeof plan.remote_matrix !== "boolean" ||
    !["smoke", "full"].includes(plan.header_mode) ||
    typeof plan.header_appearances !== "string" ||
    (plan.full &&
      (!plan.remote_matrix ||
        plan.header_mode !== "full" ||
        plan.header_appearances))
  )
    throw new Error("Invalid CI plan");
  const matrix = needs["remote-matrix"]?.result;
  if (
    plan.remote_matrix
      ? matrix !== "success"
      : !["success", "skipped"].includes(matrix ?? "")
  )
    throw new Error("Remote matrix did not satisfy CI plan");
}

function git(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function changedFiles(): string[] | undefined {
  try {
    const event = process.env.CI_EVENT;
    let base =
      event === "pull_request" ? process.env.CI_BASE : process.env.CI_BEFORE;
    const head = process.env.CI_HEAD;
    if (!head || !/^[a-f0-9]{40}$/i.test(head)) return;
    if (event === "workflow_dispatch") {
      try {
        base = git("rev-parse", "refs/remotes/origin/main");
      } catch {
        git(
          "fetch",
          "--no-tags",
          "--depth=1",
          "origin",
          "refs/heads/main:refs/remotes/origin/main",
        );
        base = git("rev-parse", "refs/remotes/origin/main");
      }
    }
    if (!base || !/^[a-f0-9]{40}$/i.test(base) || /^0+$/.test(base)) return;
    try {
      git("cat-file", "-e", base + "^{commit}");
    } catch {
      // Diff snapshots do not need the full history of large artwork binaries.
      git("fetch", "--no-tags", "--depth=1", "origin", base);
    }
    // A rename must include the deleted old path, not only the destination.
    const output = execFileSync(
      "git",
      ["diff", "--no-renames", "--name-only", "-z", base, head],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return output.split("\0").filter(Boolean);
  } catch {
    return;
  }
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (process.argv[2] === "gate") {
    assertCiGate(JSON.parse(process.env.CI_NEEDS ?? "{}"));
    console.log("All checks required by the CI plan succeeded.");
  } else {
    const full =
      process.env.CI_EVENT === "schedule" ||
      (process.env.CI_EVENT === "workflow_dispatch" &&
        process.env.CI_SUITE !== "core");
    const plan = planCi(full ? undefined : changedFiles(), full);
    console.log(JSON.stringify(plan, null, 2));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries({ ...plan, json: JSON.stringify(plan) })
          .map(([key, value]) => key + "=" + String(value))
          .join("\n") + "\n",
      );
  }
}
