import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("records and blocks a PostgreSQL connection attempt in the frontend monitor's inherited file", () => {
  const directory = mkdtempSync(join(tmpdir(), "oclr-remote-monitor-"));
  const path = join(directory, "attempts.log");
  writeFileSync(path, "");
  try {
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        "./tests/fixtures/no-local-database.ts",
        "--input-type",
        "module",
        "-e",
        `import pg from "pg";
      try {
        await new pg.Pool().connect();
        throw new Error("Monitor did not block the connection");
      } catch (error) {
        if (error.message !== "Remote frontend must never connect to local PostgreSQL") throw error;
      }`,
      ],
      {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          OCLR_DATA_SOURCE: "remote",
          OCLR_TEST_NO_DB_ATTEMPTS: path,
          DATABASE_URL: "",
        },
        stdio: "pipe",
      },
    );
    expect(readFileSync(path, "utf8")).toBe(
      "Local PostgreSQL connection attempted\n",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
