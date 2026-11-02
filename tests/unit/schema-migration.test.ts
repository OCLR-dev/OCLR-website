import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSchemaMigration } from "../../scripts/check-schema-migration";

const schema = `import { jsonb, pgTable, index, check, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const availability = pgTable("availability", {
  intervals: jsonb("intervals")
    .$type<import("@/lib/schedule-model").AvailabilityInterval[]>()
    .notNull(),
  label: text("label").default("open"),
}, t => [index("label_idx").on(t.label), check("label_check", sql\`length(\${t.label}) > 0\`)]);
`;

function compare(
  before: string,
  after: string,
  oldCount = 1,
  newCount = oldCount,
) {
  const root = mkdtempSync(join(tmpdir(), "oclr-schema-migration-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "Schema test",
        GIT_AUTHOR_EMAIL: "schema@example.test",
        GIT_COMMITTER_NAME: "Schema test",
        GIT_COMMITTER_EMAIL: "schema@example.test",
      },
    });
  try {
    git("init", "-q");
    mkdirSync(join(root, "src/db"), { recursive: true });
    mkdirSync(join(root, "drizzle/meta"), { recursive: true });
    const commit = (source: string, count: number) => {
      writeFileSync(join(root, "src/db/schema.ts"), source);
      writeFileSync(
        join(root, "drizzle/meta/_journal.json"),
        JSON.stringify({
          entries: Array.from({ length: count }, (_, idx) => ({ idx })),
        }),
      );
      git("add", ".");
      git(
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-qm",
        "schema",
        "--allow-empty",
      );
      return git("rev-parse", "HEAD").trim();
    };
    return checkSchemaMigration(
      root,
      commit(before, oldCount),
      commit(after, newCount),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("committed schema migration guard", () => {
  it("allows an unchanged schema without a migration", () => {
    expect(compare(schema, schema)).toContain("schema unchanged");
  });

  it("allows the reported season availability $type change without resolving its imports", () => {
    const next = schema.replace(
      'import("@/lib/schedule-model").AvailabilityInterval[]',
      '\n      import("@/lib/player-workspace-model").SeasonAvailabilityInterval[]\n    ',
    );
    expect(compare(schema, next)).toContain("only TypeScript types/comments");
  });

  it("allows erased type imports, aliases and comments without evaluating the schema", () => {
    const next = `import type { Missing } from "module-that-does-not-exist";
type Interval = Missing & { status?: string };
// A type-only edit needs no SQL.
${schema.replace('import("@/lib/schedule-model").AvailabilityInterval[]', "Interval[]")}`;
    expect(compare(schema, next)).toContain("only TypeScript types/comments");
  });

  it.each([
    ["column type", 'jsonb("intervals")', 'text("intervals")'],
    ["column name", 'jsonb("intervals")', 'jsonb("slots")'],
    ["table name", 'pgTable("availability"', 'pgTable("slots"'],
    ["nullability", ".notNull()", ""],
    ["foreign key", ".notNull()", ".notNull().references(() => owner.id)"],
    ["default", '.default("open")', '.default("closed")'],
    ["index", 'index("label_idx")', 'index("another_idx")'],
    ["constraint", "> 0", "> 1"],
    [
      "value import",
      'from "drizzle-orm/pg-core"',
      'from "different-schema-builders"',
    ],
    [
      "string containing type syntax",
      '.default("open")',
      '.default("$type<Changed>()")',
    ],
  ])("rejects a changed %s without a new migration", (_name, before, after) => {
    expect(() => compare(schema, schema.replace(before, after))).toThrow(
      "without a new committed migration",
    );
  });

  it("allows a runtime change accompanied by a new committed migration", () => {
    expect(
      compare(
        schema,
        schema.replace('.default("open")', '.default("closed")'),
        1,
        2,
      ),
    ).toContain("new committed migration present");
  });

  it("does not allow a type-only change to hide a shrinking migration journal", () => {
    expect(() => compare(schema, `${schema}\n// comment`, 2, 1)).toThrow(
      "without a new committed migration",
    );
  });

  it("fails closed if either committed schema cannot be parsed", () => {
    expect(() => compare(schema, "export const broken = {;")).toThrow(
      "Cannot parse",
    );
    expect(() => compare("export const broken = {;", schema)).toThrow(
      "Cannot parse",
    );
  });

  it("requires pinned commit identities", () => {
    expect(() =>
      checkSchemaMigration("/nonexistent", "main", "a".repeat(40)),
    ).toThrow("full commit SHAs");
  });

  it("fails closed on unreadable Git history without printing credentials or Git errors", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(
          new URL("../../scripts/check-schema-migration.ts", import.meta.url),
        ),
        "/nonexistent/oclr-test-repository",
        "a".repeat(40),
        "b".repeat(40),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          MIGRATION_DATABASE_URL: "synthetic-secret-must-not-appear",
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cannot read or validate committed");
    expect(result.stdout + result.stderr).not.toContain(
      "synthetic-secret-must-not-appear",
    );
    expect(result.stderr).not.toContain("fatal:");
  });
});
