import { globSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import {
  availabilityWrite,
  practiceWrite,
  workspaceWriteError,
} from "../src/lib/player-workspace-contracts";
import { practiceValueSchema } from "../src/lib/player-workspace-model";

const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
const operations = [availabilityWrite, practiceWrite];
const readOnlyAliases = new Map([
  ["src/app/api/v1/[...path]/route.ts", "readApiRoute"],
  ["src/app/api/v1/me/route.ts", "readApiRoute"],
  ["src/app/api/v1/streaming/tournaments/[edition]/next/route.ts", "handle"],
]);

function exportedNames(file: string) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
  );
  const names = new Map<string, string>();
  for (const node of source.statements) {
    if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const entry of node.exportClause.elements) {
        if (!entry.isTypeOnly)
          names.set(entry.name.text, (entry.propertyName ?? entry.name).text);
      }
      continue;
    }
    if (
      !ts.canHaveModifiers(node) ||
      !ts
        .getModifiers(node)
        ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    if (ts.isFunctionDeclaration(node) && node.name)
      names.set(node.name.text, node.name.text);
    if (ts.isVariableStatement(node))
      for (const { name } of node.declarationList.declarations)
        if (ts.isIdentifier(name)) names.set(name.text, name.text);
  }
  return names;
}

const matched = new Set<string>();
const routes = globSync("src/app/**/route.{ts,tsx,js,jsx}")
  .map((file) => file.replaceAll("\\", "/"))
  .sort()
  .flatMap((source) => {
    const route =
      source
        .slice("src/app".length)
        .replace(/\/\([^/]+\)/g, "")
        .replace(/\/route\.[^/]+$/, "")
        .replace(/\[([\w-]+)\]/g, "{$1}") || "/";
    const names = exportedNames(source);
    const methods = Object.fromEntries(
      writeMethods
        .filter((method) => names.has(method))
        .map((method) => {
          const operation = operations.find(
            (item) => item.path === route && item.method === method,
          );
          if (readOnlyAliases.get(source) === names.get(method)) {
            return [method, { status: "read-only" }];
          }
          if (!operation) return [method, { status: "pending" }];
          if (matched.has(operation.id))
            throw new Error(`Multiple routes match ${operation.id}`);
          matched.add(operation.id);
          return [
            method,
            {
              status: "documented",
              operationId: operation.id,
              consumers: operation.consumers,
            },
          ];
        }),
    );
    return Object.keys(methods).length ? [{ route, source, methods }] : [];
  });

for (const operation of operations) {
  if (!matched.has(operation.id))
    throw new Error(`No route matches ${operation.id}`);
  for (const consumer of operation.consumers) readFileSync(consumer);
}

function jsonSchema(
  schema: z.ZodType,
  io: "input" | "output",
): z.core.JSONSchema.BaseSchema {
  const { $schema, ...value } = z.toJSONSchema(schema, {
    io,
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema !== practiceValueSchema.shape.comment) return;
      jsonSchema.description = `After trimming surrounding whitespace, the comment may contain up to ${jsonSchema.maxLength} UTF-16 code units.`;
      delete jsonSchema.maxLength;
    },
  });
  void $schema;
  return value;
}

const errorSchema = { $ref: "#/components/schemas/WorkspaceWriteError" };
const response = (
  description: string,
  schema: ReturnType<typeof jsonSchema> = errorSchema,
) => ({
  description,
  content: { "application/json": { schema } },
});

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "OCLR browser write API",
    version: "0.1.0",
    description:
      "Incremental documentation of existing OCLR browser routes. See write-api-inventory.json for coverage.",
  },
  components: {
    securitySchemes: {
      browserSession: {
        type: "apiKey",
        in: "cookie",
        name: "__Host-oclr_session",
      },
      localBrowserSession: {
        type: "apiKey",
        in: "cookie",
        name: "oclr_session",
        description: "Session cookie when plain HTTP is allowed locally.",
      },
    },
    schemas: { WorkspaceWriteError: jsonSchema(workspaceWriteError, "output") },
  },
  paths: Object.fromEntries(
    operations.map((operation) => [
      operation.path,
      {
        [operation.method.toLowerCase()]: {
          operationId: operation.id,
          summary: operation.summary,
          description: [
            operation.description,
            "Requires an accepted registration or captain appointment in a published, non-archived edition with a writable player workspace.",
            "Send the last observed version as expectedVersion, or 0 for the first write. Reuse requestKey only when retrying the same payload after an uncertain outcome.",
          ].join(" "),
          security: [{ browserSession: [] }, { localBrowserSession: [] }],
          parameters: [
            {
              name: "edition",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "Origin",
              in: "header",
              required: true,
              description: "Must match the configured site origin.",
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            "x-max-body-bytes": operation.maxBodyBytes,
            content: {
              "application/json": {
                schema: jsonSchema(operation.request, "input"),
              },
            },
          },
          responses: {
            200: response(
              "The saved version, including for a successful retry.",
              jsonSchema(operation.response, "output"),
            ),
            400: response("Missing, malformed, or invalid JSON command."),
            401: response("An authenticated browser session is required."),
            403: response(
              "Origin, authentication channel, or eligibility rejected.",
            ),
            404: response(operation.notFound),
            409: response(
              "Read-only workspace, stale data, or a reused request key with a different payload.",
            ),
            413: response("The JSON body exceeds the byte limit."),
            415: response("Content-Type must be application/json."),
            500: response("Unexpected failure."),
            503: response(
              "Site origin configuration is unavailable or invalid.",
            ),
          },
        },
      },
    ]),
  ),
};

for (const [file, value] of Object.entries({
  "docs/write-api-inventory.json": routes,
  "docs/write-api.openapi.json": openapi,
})) {
  const generated = `${JSON.stringify(value, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (readFileSync(file, "utf8") !== generated)
      throw new Error(`${file} is stale. Run npm run write-api:generate.`);
  } else {
    writeFileSync(file, generated);
  }
}
