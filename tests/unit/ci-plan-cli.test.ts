import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const script = fileURLToPath(
  new URL("../../scripts/ci-plan.ts", import.meta.url),
);
let directory: string | undefined;
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
function repository() {
  directory = mkdtempSync(join(tmpdir(), "oclr-ci-plan-test-"));
  const cwd = directory;
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Synthetic CI fixture",
        "-c",
        "user.email=ci@example.test",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  git("init", "-q", "--initial-branch=main");
  mkdirSync(join(cwd, "src/app"), { recursive: true });
  writeFileSync(join(cwd, "src/app/page.tsx"), "synthetic\n");
  git("add", ".");
  git("commit", "-qm", "synthetic initial state");
  const base = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", base);
  function run(env: Record<string, string>, runDirectory = cwd) {
    const output = join(runDirectory, "output");
    writeFileSync(output, "");
    const stdout = execFileSync(process.execPath, [script], {
      cwd: runDirectory,
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        CI_EVENT: "push",
        CI_HEAD: git("-C", runDirectory, "rev-parse", "HEAD"),
        CI_BEFORE: base,
        ...env,
      },
      encoding: "utf8",
    });
    const plan = JSON.parse(stdout);
    const entries = readFileSync(output, "utf8").trim().split("\n");
    expect(entries).toHaveLength(6);
    expect(
      JSON.parse(entries.find((line) => line.startsWith("json="))!.slice(5)),
    ).toEqual(plan);
    return plan;
  }
  return { cwd, git, run, base };
}
describe("native Node CI planning against Git", () => {
  it("fetches only the missing base snapshot from a shallow checkout", () => {
    const { cwd, git, run, base } = repository();
    writeFileSync(join(cwd, "src/app/globals.css"), "synthetic");
    git("add", ".");
    git("commit", "-qm", "synthetic style change");
    writeFileSync(join(cwd, "README.md"), "synthetic");
    git("add", ".");
    git("commit", "-qm", "synthetic prose");
    const shallow = join(cwd, "shallow");
    git("clone", "-q", "--depth=1", pathToFileURL(cwd).href, shallow);
    expect(() =>
      git("-C", shallow, "cat-file", "-e", base + "^{commit}"),
    ).toThrow();
    expect(run({}, shallow)).toMatchObject({
      full: false,
      header_mode: "full",
      remote_matrix: false,
    });
    expect(() =>
      git("-C", shallow, "cat-file", "-e", base + "^{commit}"),
    ).not.toThrow();
  });
  it("includes a renamed page's old path even when moved into documentation", () => {
    const { git, run } = repository();
    git("mv", "src/app/page.tsx", "README.md");
    git("commit", "-qm", "synthetic rename");
    expect(run({})).toMatchObject({ full: false, remote_matrix: true });
  });
  it("compares a manual feature ref to main, including earlier commits", () => {
    const { git, cwd, run } = repository();
    writeFileSync(join(cwd, "src/app/globals.css"), "synthetic");
    git("add", ".");
    git("commit", "-qm", "synthetic UI change");
    writeFileSync(join(cwd, "README.md"), "synthetic");
    git("add", ".");
    git("commit", "-qm", "synthetic prose");
    expect(
      run({ CI_EVENT: "workflow_dispatch", CI_SUITE: "core" }),
    ).toMatchObject({ header_mode: "full", header_appearances: "" });
  });
  it("uses complete acceptance if the base is missing or a full run is requested", () => {
    const { run } = repository();
    expect(run({ CI_BEFORE: "0".repeat(40) }).full).toBe(true);
    expect(run({ CI_EVENT: "schedule" }).full).toBe(true);
    expect(run({ CI_EVENT: "workflow_dispatch", CI_SUITE: "full" }).full).toBe(
      true,
    );
  });
});
