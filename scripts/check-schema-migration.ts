import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import ts from "typescript";

class SchemaMigrationError extends Error {}

function runtimeSource(source: string) {
  // Erase types without loading the schema, its imports or any database config.
  // Preserve value imports so an import change cannot disappear as an unused type.
  const result = ts.transpileModule(source, {
    fileName: "schema.ts",
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
      removeComments: true,
      newLine: ts.NewLineKind.LineFeed,
    },
  });
  if (
    result.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error)
  )
    throw new SchemaMigrationError(
      "Cannot parse database schema for the migration check.",
    );
  return result.outputText;
}

export function checkSchemaMigration(
  repository: string,
  previousSha: string,
  nextSha: string,
) {
  if (![previousSha, nextSha].every((sha) => /^[a-f0-9]{40}$/.test(sha)))
    throw new SchemaMigrationError(
      "Schema migration check requires full commit SHAs.",
    );
  const read = (sha: string, path: string) =>
    execFileSync("git", ["-C", repository, "show", `${sha}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const before = read(previousSha, "src/db/schema.ts");
  const after = read(nextSha, "src/db/schema.ts");
  if (before === after) return "Schema migration check: schema unchanged.";

  const count = (sha: string) => {
    const journal = JSON.parse(read(sha, "drizzle/meta/_journal.json"));
    if (!Array.isArray(journal.entries))
      throw new SchemaMigrationError("Invalid committed migration journal.");
    return journal.entries.length;
  };
  const oldCount = count(previousSha);
  const newCount = count(nextSha);
  if (newCount > oldCount)
    return "Schema migration check: new committed migration present.";
  if (newCount === oldCount && runtimeSource(before) === runtimeSource(after))
    return "Schema migration check: only TypeScript types/comments changed.";
  throw new SchemaMigrationError(
    "Database schema runtime definition changed without a new committed migration. Reconcile the schema before deploying.",
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 3)
      throw new SchemaMigrationError(
        "Usage: check-schema-migration.ts REPOSITORY PREVIOUS_SHA NEXT_SHA",
      );
    console.log(checkSchemaMigration(args[0], args[1], args[2]));
  } catch (error) {
    // Do not print child-process errors, environment configuration or credentials.
    console.error(
      error instanceof SchemaMigrationError
        ? error.message
        : "Cannot read or validate committed database schema/migration history.",
    );
    process.exitCode = 1;
  }
}
