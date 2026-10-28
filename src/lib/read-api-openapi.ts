import { readQuerySchema } from "./read-api-queries";
import { readContractVersion } from "./read-api-version";
import { z } from "zod";
import contracts from "./extended-read-contracts.json" with { type: "json" };
import { readOperations, readSchemas } from "./read-api-operations";
export function readApiSpecification() {
  const components = Object.fromEntries(
    Object.entries(readSchemas)
      .filter(([name]) => !(name in contracts.resources))
      .map(([name, schema]) => {
        const { $schema, ...definition } = z.toJSONSchema(schema);
        void $schema;
        return [name, definition];
      }),
  );
  const replaceRefs = (value: unknown): unknown =>
    JSON.parse(
      JSON.stringify(value).replaceAll("#/$defs/", "#/components/schemas/"),
    );
  Object.assign(
    components,
    replaceRefs(contracts.$defs),
    replaceRefs(contracts.resources),
  );
  const paths: Record<string, unknown> = {};
  for (const operation of readOperations) {
    const parameters: unknown[] = [];
    for (const key of ["edition", "osuId", "id", "replayId"])
      if (operation.path.includes(`{${key}}`))
        parameters.push({
          name: key,
          in: "path",
          required: true,
          schema:
            key === "edition"
              ? {
                  type: "string",
                  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
                  maxLength: 80,
                }
              : key === "osuId"
                ? { type: "string", pattern: "^[1-9][0-9]*$" }
                : { type: "string", format: "uuid" },
        });
    const querySchema = z.toJSONSchema(
      readQuerySchema(operation.id, operation.query),
    );
    for (const key of operation.query)
      parameters.push({
        name: key,
        in: "query",
        required: false,
        description:
          key === "version"
            ? "Pass collectionVersion from page 1 on subsequent pages; restart the entire collection after 409."
            : key === "fixtureId" &&
                ["statisticsWorkspace", "publicArchiveStatistics"].includes(
                  operation.id,
                )
              ? "Recorded historical fixture key, never a provider lookup."
              : undefined,
        schema: querySchema.properties?.[key],
      });
    const successSchema = {
      type: "object",
      required: ["data", "meta"],
      additionalProperties: false,
      properties: {
        data: { $ref: `#/components/schemas/${operation.schema}` },
        meta: { $ref: "#/components/schemas/ReadMeta" },
      },
    };
    const responses: Record<string, unknown> = {
      "200": {
        description:
          "Saved read projection; no provider work or business writes",
        headers: {
          "Cache-Control": { schema: { type: "string", const: "no-store" } },
          "X-Request-Id": { schema: { type: "string", format: "uuid" } },
          "X-OCLR-Read-Contract": {
            schema: { type: "string", const: readContractVersion },
          },
          ...(operation.binary
            ? {
                "Content-Disposition": {
                  description: "Replay attachment filename; CORS-exposed",
                  schema: { type: "string" },
                },
              }
            : {}),
        },
        content: operation.binary
          ? {
              [operation.id === "getTeamAvatar"
                ? "image/webp"
                : "application/octet-stream"]: {
                schema: { type: "string", format: "binary" },
              },
            }
          : { "application/json": { schema: successSchema } },
      },
    };
    for (const code of [400, 401, 403, 404, 409, 413, 429, 500, 503])
      responses[String(code)] = {
        description:
          "Machine-readable error; no-store and matching CORS headers for allowed origins",
        headers:
          code === 429
            ? {
                "Retry-After": {
                  description:
                    "Wait this many seconds before a new request; no automatic replay",
                  schema: { type: "integer", minimum: 1 },
                },
              }
            : undefined,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ReadError" },
          },
        },
      };
    paths[`/api/v1${operation.path}`] = {
      get: {
        operationId: operation.id,
        description: operation.description,
        "x-oclr-issues": operation.issues,
        "x-oclr-scopes": [
          operation.scope,
          ...(operation.additionalScopes ?? []),
        ],
        "x-oclr-query-model": operation.schema,
        "x-oclr-coverage": "docs/remote-coverage.json",
        "x-oclr-read-only": true,
        "x-response-size-limit":
          operation.id === "getTeamAvatar"
            ? 1048576
            : operation.binary
              ? 8388608
              : operation.id === "getApiIdentity"
                ? 262144
                : 2097152,
        security: operation.public
          ? [{}, { DeveloperBearer: [] }]
          : [{ DeveloperBearer: [] }],
        parameters,
        responses,
      },
      head: {
        operationId: `${operation.id}Head`,
        description:
          "Identical authorization, status and headers; no response body.",
        "x-oclr-issues": operation.issues,
        security: operation.public
          ? [{}, { DeveloperBearer: [] }]
          : [{ DeveloperBearer: [] }],
        parameters,
        responses: Object.fromEntries(
          Object.keys(responses).map((code) => [
            code,
            { description: "Identical GET status and headers; no body" },
          ]),
        ),
      },
      options: {
        operationId: `${operation.id}Preflight`,
        "x-oclr-issues": operation.issues,
        security: [],
        responses: {
          "204": { description: "Read-only preflight, no private data" },
          "403": { description: "Origin, method or headers denied" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "OCLR Read API",
      version: readContractVersion,
      description:
        "Versioned saved reads (#269–#272). Public projections remain public-only even with a token. Explicit invalid Authorization never falls back to anonymous/cookies. Reads never fetch providers or mutate business data. Later collection pages require version and restart on 409.",
    },
    servers: [{ url: "/" }],
    paths,
    components: {
      securitySchemes: {
        DeveloperBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "oclr_dev_opaque",
        },
      },
      schemas: {
        ...components,
        ReadMeta: {
          type: "object",
          required: ["apiVersion", "requestId"],
          additionalProperties: false,
          properties: {
            apiVersion: { const: "1" },
            requestId: { type: "string", format: "uuid" },
            pagination: { $ref: "#/components/schemas/Pagination" },
          },
        },
        ReadError: {
          type: "object",
          required: ["error"],
          additionalProperties: false,
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "requestId"],
              additionalProperties: false,
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                requestId: { type: "string", format: "uuid" },
              },
            },
          },
        },
      },
    },
  };
}
