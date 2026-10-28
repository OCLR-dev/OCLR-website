import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(
  new URL("../../scripts/ci-plan.ts", import.meta.url),
);
describe("native CI planning without changed-file expansion", () => {
  for (const [event, suite, full] of [
    ["push", "", false],
    ["pull_request", "", false],
    ["schedule", "", false],
    ["push", "full", false],
    ["workflow_dispatch", "core", false],
    ["workflow_dispatch", "", false],
    ["workflow_dispatch", "full", true],
    ["unknown", "full", false],
  ] as const)
    it(`${event}/${suite} selects full=${full} even without a Git checkout`, () => {
      const cwd = mkdtempSync(join(tmpdir(), "oclr-ci-plan-test-"));
      try {
        const output = join(cwd, "outputs");
        const stdout = execFileSync(process.execPath, [script], {
          cwd,
          encoding: "utf8",
          env: {
            ...process.env,
            CI_EVENT: event,
            CI_SUITE: suite,
            GITHUB_OUTPUT: output,
            CI_HEAD: "invalid",
            CI_BEFORE: "missing",
          },
        });
        const plan = JSON.parse(stdout);
        expect(plan.full).toBe(full);
        const entries = Object.fromEntries(
          readFileSync(output, "utf8")
            .trim()
            .split("\n")
            .map((line) => {
              const i = line.indexOf("=");
              return [line.slice(0, i), line.slice(i + 1)];
            }),
        );
        expect(JSON.parse(entries.json)).toEqual(plan);
        expect(JSON.parse(entries.e2e_shards)).toEqual(plan.e2e_shards);
        expect(entries.full).toBe(String(full));
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
});
