import readContracts from "../src/lib/extended-read-contracts.json" with { type: "json" };
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
import {
  changeCaptainsWrite,
  changeTeamsWrite,
  editTeamIdentityWrite,
  changeDraftWrite,
  pickPlayerWrite,
} from "../src/lib/draft-setup-write-contracts";
import {
  assignFixtureRefereesWrite,
  changeFixturesWrite,
  roundRefereePolicyWrite,
} from "../src/lib/fixture-write-contracts";
import {
  changeStaffRolesWrite,
  updateContributorsWrite,
} from "../src/lib/staff-administration-write-contracts";
import {
  changeTournamentWrite,
  createTournamentWrite,
  deleteTournamentDraftWrite,
} from "../src/lib/tournament-write-contracts";
import {
  deletePlayerMessageWrite,
  editPlayerMessageWrite,
  postPlayerMessageWrite,
} from "../src/lib/player-message-write-contract";
import { lookupArchiveStaffWrite } from "../src/lib/archive-staff-write-contract";
import {
  requestDesktopAuthWrite,
  decideDesktopAuthWrite,
  exchangeDesktopAuthWrite,
  refreshDesktopAuthWrite,
  revokeDesktopAuthWrite,
  deleteDesktopSessionWrite,
} from "../src/lib/desktop-auth-write-contracts";
import {
  changeRemoteConnectionWrite,
  disconnectRemoteWrite,
  logoutWrite,
} from "../src/lib/browser-connection-write-contracts";
import {
  queueAdminBackupWrite,
  refreshStaffProfileWrite,
  updateSiteAppearanceWrite,
} from "../src/lib/admin-operations-write-contracts";
import {
  moderateChessWrite,
  placeChessPixelWrite,
} from "../src/lib/ocl-chess-write-contracts";
import { reviewBwsWrite } from "../src/lib/bws-write-contract";
import {
  createDeveloperTokenWrite,
  revokeDeveloperTokenWrite,
} from "../src/lib/developer-token-write-contract";
import {
  addManualRegistrationWrite,
  addManualRegistrationsWrite,
  previewManualRegistrationWrite,
  previewManualRegistrationsWrite,
} from "../src/lib/manual-registration-write-contract";
import {
  changeMappoolWrite,
  previewMappoolWrite,
  changeMappoolWorkbenchWrite,
} from "../src/lib/mappool-write-contracts";
import {
  changeMatchResultWrite,
  importMatchResultWrite,
  previewMatchImportWrite,
} from "../src/lib/match-result-write-contracts";
import {
  changeRefereeMpWrite,
  changeRefereeWorkspaceWrite,
  reconcileRefereeAttemptWrite,
} from "../src/lib/referee-write-contracts";
import { changeRefereeIrcBrowserWrite } from "../src/lib/referee-irc-browser-contract";
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
  changeAwardsWrite,
  changeHistoricalStatisticsWrite,
} from "../src/lib/results-publication-write-contracts";
import {
  scheduleRequestWrite,
  streamingTaskWrite,
} from "../src/lib/scheduling-write-contracts";
import {
  createStreamingAccessWrite,
  revokeStreamingAccessWrite,
} from "../src/lib/streaming-write-contract";
import {
  browserWriteError,
  type WriteApiOperation,
  type WriteResponseSchema,
} from "../src/lib/write-api-contract";

const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
const operations: readonly WriteApiOperation[] = [
  uploadReplayWrite,
  deleteReplayWrite,
  refereeRelayWrite,
  createStreamingAccessWrite,
  revokeStreamingAccessWrite,
  createDeveloperTokenWrite,
  revokeDeveloperTokenWrite,
  availabilityWrite,
  practiceWrite,
  changeStaffRolesWrite,
  lookupArchiveStaffWrite,
  updateContributorsWrite,
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
  scheduleRequestWrite,
  streamingTaskWrite,
  changeCaptainsWrite,
  changeTeamsWrite,
  editTeamIdentityWrite,
  changeDraftWrite,
  pickPlayerWrite,
  changeAwardsWrite,
  changeHistoricalStatisticsWrite,
  changeMappoolWrite,
  previewMappoolWrite,
  changeMappoolWorkbenchWrite,
  changeFixturesWrite,
  assignFixtureRefereesWrite,
  roundRefereePolicyWrite,
  importMatchResultWrite,
  previewMatchImportWrite,
  changeMatchResultWrite,
  changeRefereeWorkspaceWrite,
  changeRefereeMpWrite,
  reconcileRefereeAttemptWrite,
  changeRefereeIrcBrowserWrite,
  createTournamentWrite,
  changeTournamentWrite,
  deleteTournamentDraftWrite,
  postPlayerMessageWrite,
  editPlayerMessageWrite,
  deletePlayerMessageWrite,
  requestDesktopAuthWrite,
  decideDesktopAuthWrite,
  exchangeDesktopAuthWrite,
  refreshDesktopAuthWrite,
  revokeDesktopAuthWrite,
  deleteDesktopSessionWrite,
  changeRemoteConnectionWrite,
  disconnectRemoteWrite,
  logoutWrite,
  queueAdminBackupWrite,
  refreshStaffProfileWrite,
  updateSiteAppearanceWrite,
  placeChessPixelWrite,
  moderateChessWrite,
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

function commandActions(
  schema: z.core.$ZodType | undefined,
  field = "action",
): string[] {
  if (schema instanceof z.ZodUnion)
    return schema.options.flatMap((option) => commandActions(option, field));
  if (schema instanceof z.ZodObject)
    return commandActions(schema.shape.command ?? schema.shape[field], field);
  if (schema instanceof z.ZodLiteral)
    return [...schema.values].filter((value) => typeof value === "string");
  return schema instanceof z.ZodEnum
    ? schema.options.filter((value) => typeof value === "string")
    : [];
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
          if (!operation)
            throw new Error(`Missing write contract for ${method} ${route}`);
          if (matched.has(operation.id))
            throw new Error(`Multiple routes match ${operation.id}`);
          matched.add(operation.id);
          const actions = commandActions(
            operation.query?.[operation.actionField ?? "action"] ??
              operation.request,
            operation.actionField,
          );
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

const readResponseSchemas: Record<string, unknown> = {};
const readDefinitions: Record<string, unknown> = readContracts.$defs;

function includeReadResponse(name: string, schema: unknown) {
  if (Object.hasOwn(readResponseSchemas, name)) return;
  if (!schema) throw new Error(`Missing read response schema ${name}`);
  const serialized = JSON.stringify(schema);
  readResponseSchemas[name] = JSON.parse(
    serialized.replaceAll("#/$defs/", "#/components/schemas/"),
  );
  for (const [, ref] of serialized.matchAll(/"#\/\$defs\/([^"]+)"/g))
    includeReadResponse(ref, readDefinitions[ref]);
}

function responseBranchSchema(response: WriteResponseSchema) {
  if (response instanceof z.ZodType) return jsonSchema(response, "output");
  const name = response.readResource;
  includeReadResponse(name, readContracts.resources[name]);
  return { $ref: `#/components/schemas/${name}` };
}

function responseSchema(response: NonNullable<WriteApiOperation["response"]>) {
  if ("properties" in response) {
    const entries = Object.entries(response.properties);
    return {
      type: "object",
      properties: Object.fromEntries(
        entries.map(([name, schema]) => [name, responseBranchSchema(schema)]),
      ),
      required: entries.map(([name]) => name),
      additionalProperties: false,
    };
  }
  return "anyOf" in response
    ? { anyOf: response.anyOf.map(responseBranchSchema) }
    : responseBranchSchema(response);
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

function headerSchemas(headers: WriteApiOperation["successHeaders"]) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, schema]) => [
      name,
      { schema: jsonSchema(schema, "output") },
    ]),
  );
}

function successResponse(
  description: string,
  response: WriteApiOperation["response"],
  headers: ReturnType<typeof headerSchemas>,
) {
  return {
    description,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(response === null
      ? {}
      : {
          content: {
            "application/json": { schema: responseSchema(response) },
          },
        }),
  };
}

function openapiOperation(operation: WriteApiOperation) {
  const desktop = operation.access === "desktop";
  const desktopErrors = desktop || operation.errorFormat === "desktop";
  const requestIdHeader = {
    "X-Request-Id": { schema: { type: "string", format: "uuid" } },
  };
  const requestId = desktop || operation.contractHeader ? requestIdHeader : {};
  const parameters = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
    ([, name]) => ({
      name,
      in: "path",
      required: true,
      schema: jsonSchema(operation.parameters?.[name] ?? z.string(), "input"),
    }),
  );
  if (operation.access === "browser" || operation.access === "same-origin")
    parameters.push(browserOrigin);
  const query = Object.entries(operation.query ?? {}).map(([name, schema]) => ({
    name,
    in: "query",
    required: !(schema instanceof z.ZodOptional),
    schema: jsonSchema(schema, "input"),
  }));
  const successHeaders = {
    ...requestId,
    ...(operation.contractHeader
      ? {
          [operation.contractHeader]: {
            schema: { type: "string", const: desktopContractVersion },
          },
        }
      : {}),
    ...headerSchemas(operation.successHeaders),
  };

  return {
    operationId: operation.id,
    summary: operation.summary,
    description: operation.description,
    security: desktop
      ? [{ desktopBearer: [] }]
      : operation.access === "browser"
        ? [{ browserSession: [] }, { localBrowserSession: [] }]
        : [],
    ...(operation.scope ? { "x-required-desktop-scope": operation.scope } : {}),
    ...(parameters.length || query.length
      ? { parameters: [...parameters, ...query] }
      : {}),
    ...(operation.request
      ? {
          requestBody: {
            required: operation.requestBodyRequired ?? true,
            "x-max-body-bytes": operation.maxBodyBytes,
            content: {
              [operation.requestMediaType ?? "application/json"]: {
                schema: jsonSchema(operation.request, "input"),
              },
              ...(operation.urlencodedRequest
                ? {
                    "application/x-www-form-urlencoded": {
                      schema: jsonSchema(operation.urlencodedRequest, "input"),
                    },
                  }
                : {}),
            },
          },
        }
      : {}),
    responses: {
      [operation.successStatus]: successResponse(
        operation.successDescription,
        operation.response,
        successHeaders,
      ),
      ...Object.fromEntries(
        Object.entries(operation.additionalSuccess ?? {}).map(
          ([status, result]) => [
            status,
            successResponse(
              result.description,
              result.response,
              headerSchemas(result.headers),
            ),
          ],
        ),
      ),
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
            ...(operation.errorFormat === "desktop"
              ? {
                  headers: {
                    ...requestIdHeader,
                    "Cache-Control": { schema: { type: "string", const: "no-store" } },
                    ...(status === "429"
                      ? { "Retry-After": { schema: { type: "string", const: "60" } } }
                      : {}),
                  },
                }
              : desktop
                ? { headers: requestId }
                : operation.errorHeaders?.[Number(status)]
                  ? {
                      headers: headerSchemas(operation.errorHeaders[Number(status)]),
                    }
                  : {}),
            content: {
              "application/json": {
                schema: operation.errorResponses?.[Number(status)]
                  ? jsonSchema(
                      operation.errorResponses[Number(status)],
                      "output",
                    )
                  : {
                      $ref: `#/components/schemas/${desktopErrors ? "DesktopWriteError" : "BrowserWriteError"}`,
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
    version: "0.4.0",
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
      ...readResponseSchemas,
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
