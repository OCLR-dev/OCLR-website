import { globSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import {
  availabilityWrite,
  practiceWrite,
} from "../src/lib/player-workspace-contracts";
import { practiceValueSchema } from "../src/lib/player-workspace-model";
import {
  desktopContractVersion,
  desktopErrorSchema,
} from "../src/lib/desktop-wire";
import { reviewBwsWrite } from "../src/lib/bws-write-contract";
import {
  addManualRegistrationWrite,
  addManualRegistrationsWrite,
  previewManualRegistrationWrite,
  previewManualRegistrationsWrite,
} from "../src/lib/manual-registration-write-contract";
import { refereeRelayWrite } from "../src/lib/referee-relay-contract";
import {
  removeRegistrationWrite,
  restoreRegistrationWrite,
  reviewRegistrationWrite,
  submitRegistrationWrite,
  withdrawRegistrationWrite,
} from "../src/lib/registration-write-contract";
import {
  deleteReplayWrite,
  uploadReplayWrite,
} from "../src/lib/replay-write-contract";
import {
  createStreamingAccessWrite,
  revokeStreamingAccessWrite,
} from "../src/lib/streaming-write-contract";
import {
  browserWriteError,
  type WriteApiOperation,
} from "../src/lib/write-api-contract";

const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
const operations: readonly WriteApiOperation[] = [
  uploadReplayWrite,
  deleteReplayWrite,
  refereeRelayWrite,
  createStreamingAccessWrite,
  revokeStreamingAccessWrite,
  availabilityWrite,
  practiceWrite,
  submitRegistrationWrite,
  withdrawRegistrationWrite,
  removeRegistrationWrite,
  restoreRegistrationWrite,
  reviewRegistrationWrite,
  previewManualRegistrationWrite,
  addManualRegistrationWrite,
  previewManualRegistrationsWrite,
  addManualRegistrationsWrite,
  reviewBwsWrite,
];
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

function commandActions(schema: z.ZodType | undefined) {
  const choices =
    schema instanceof z.ZodDiscriminatedUnion ? schema.options : [schema];
  return choices.flatMap((choice) => {
    if (!(choice instanceof z.ZodObject)) return [];
    const action = choice.shape.action;
    return action instanceof z.ZodLiteral ? [...action.values] : [];
  });
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
          const actions = commandActions(operation.request);
          return [
            method,
            {
              status: "documented",
              operationId: operation.id,
              access: operation.access,
              ...(actions.length ? { actions } : {}),
              consumers: operation.consumers,
              ...(operation.externalConsumers
                ? { externalConsumers: operation.externalConsumers }
                : {}),
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

const browserOrigin = {
  name: "Origin",
  in: "header",
  required: true,
  description: "Must match the configured site origin.",
  schema: { type: "string" },
} as const;
const jsonRequestErrors = {
  400: "Missing, malformed, or invalid JSON command.",
  413: "The JSON body exceeds the byte limit.",
  415: "Content-Type must be application/json.",
};

function openapiOperation(operation: WriteApiOperation) {
  const desktop = operation.access === "desktop";
  const requestId = desktop
    ? { "X-Request-Id": { schema: { type: "string", format: "uuid" } } }
    : {};
  const parameters = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
    ([, name]) => ({
      name,
      in: "path",
      required: true,
      schema: jsonSchema(operation.parameters?.[name] ?? z.string(), "input"),
    }),
  );
  if (!desktop) parameters.push(browserOrigin);

  return {
    operationId: operation.id,
    summary: operation.summary,
    description: operation.description,
    security: desktop
      ? [{ desktopBearer: [] }]
      : [{ browserSession: [] }, { localBrowserSession: [] }],
    ...(operation.scope ? { "x-required-desktop-scope": operation.scope } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(operation.request
      ? {
          requestBody: {
            required: true,
            "x-max-body-bytes": operation.maxBodyBytes,
            content: {
              [operation.requestMediaType ?? "application/json"]: {
                schema: jsonSchema(operation.request, "input"),
              },
            },
          },
        }
      : {}),
    responses: {
      [operation.successStatus]: {
        description: operation.successDescription,
        ...(desktop
          ? {
              headers: {
                ...requestId,
                ...(operation.contractHeader
                  ? {
                      [operation.contractHeader]: {
                        schema: {
                          type: "string",
                          const: desktopContractVersion,
                        },
                      },
                    }
                  : {}),
              },
            }
          : {}),
        content: {
          "application/json": {
            schema: jsonSchema(operation.response, "output"),
          },
        },
      },
      ...Object.fromEntries(
        Object.entries({
          ...(operation.request && !operation.requestMediaType
            ? jsonRequestErrors
            : {}),
          ...operation.errors,
        }).map(([status, description]) => [
          status,
          {
            description,
            ...(desktop ? { headers: requestId } : {}),
            content: {
              "application/json": {
                schema: operation.errorResponses?.[Number(status)]
                  ? jsonSchema(
                      operation.errorResponses[Number(status)],
                      "output",
                    )
                  : {
                      $ref: `#/components/schemas/${desktop ? "DesktopWriteError" : "BrowserWriteError"}`,
                    },
              },
            },
          },
        ]),
      ),
    },
  };
}

const paths: Record<
  string,
  Record<string, ReturnType<typeof openapiOperation>>
> = {};
for (const operation of operations) {
  paths[operation.path] ??= {};
  paths[operation.path][operation.method.toLowerCase()] =
    openapiOperation(operation);
}

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "OCLR write API",
    version: "0.2.0",
    description:
      "Incremental documentation of existing OCLR browser and desktop routes. See write-api-inventory.json for coverage.",
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
      desktopBearer: {
        type: "http",
        scheme: "bearer",
        description:
          "Opaque OCLR desktop access token. Required scope is listed on each operation.",
      },
    },
    schemas: {
      BrowserWriteError: jsonSchema(browserWriteError, "output"),
      DesktopWriteError: jsonSchema(desktopErrorSchema, "output"),
    },
  },
  paths,
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
