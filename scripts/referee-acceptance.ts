import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertTestDatabase } from "../tests/database";

// Explicit opt-in only. Never connects to real IRC or requests provider credentials.
assertTestDatabase(process.env.TEST_DATABASE_URL);
const checkout = process.env.OCLR_IRC_CHECKOUT;
const expected = process.env.OCLR_IRC_EXPECTED_SHA;
if (!checkout || !existsSync(resolve(checkout, "src/main/oclr-relay.ts")))
  throw Error("Set OCLR_IRC_CHECKOUT to an installed OCLR-IRC checkout.");
if (!expected || !/^[a-f0-9]{40}$/.test(expected))
  throw Error("Set OCLR_IRC_EXPECTED_SHA to the reviewed desktop commit.");
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: checkout,
  encoding: "utf8",
}).trim();
if (sha !== expected)
  throw Error("Desktop checkout differs from OCLR_IRC_EXPECTED_SHA.");
if (
  execFileSync(
    "git",
    ["status", "--porcelain", "--", "src/main", "src/shared"],
    { cwd: checkout, encoding: "utf8" },
  ).trim()
)
  throw Error("Desktop Main/shared sources must match the pinned commit.");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "playwright.referee-acceptance.config.ts",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, OCLR_IRC_CHECKOUT: resolve(checkout) },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
