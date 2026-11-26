import { readQuerySchema } from "./read-api-queries";
import { readContractVersion } from "./read-api-version";
import { z } from "zod";
import contracts from "./extended-read-contracts.json" with { type: "json" };
import { readOperations, readSchemas } from "./read-api-operations";
import { REPLAY_MAX_BYTES } from "./replay-model";
import {
  showcasePath,
  showcasePoolSchema,
  showcasePoolsSchema,
  showcaseReadMaxBytes,
  showcaseReplaysSchema,
  showcaseVersionQuery,
} from "./streaming-showcase-contract";
const showcaseReplaysExample = {
  data: showcaseReplaysSchema.parse({
    poolId: "a9ad1565-b323-4eba-8572-54a6258d05d2",
    version: 7,
    entries: [
      {
        entryId: "b9ad1565-b323-4eba-8572-54a6258d05d2",
        slot: "NM1",
        replays: [],
      },
      {
        entryId: "c9ad1565-b323-4eba-8572-54a6258d05d2",
        slot: "HD1",
        replays: [
          {
            replayId: "d9ad1565-b323-4eba-8572-54a6258d05d2",
            filename: "HD1-A.osr",
            playerName: "Showcase A",
            mods: 8,
          },
        ],
      },
    ],
  }),
  meta: { apiVersion: "1", requestId: "f9ad1565-b323-4eba-8572-54a6258d05d2" },
};

export function readApiSpecification() {
  const components = Object.fromEntries(
    Object.entries({
      ...readSchemas,
      showcasePools: showcasePoolsSchema,
      showcasePool: showcasePoolSchema,
      showcaseReplays: showcaseReplaysSchema,
    })
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
    const schema = readQuerySchema(operation.id, operation.query);
    const querySchema = z.toJSONSchema(schema);
    // Defaults and optionals accept an absent value; only a real requirement
    // is documented as required.
    const requiredQuery = new Set<string>(
      operation.query.filter(
        (key) => !schema.safeParse({ [key]: undefined }).success,
      ),
    );
    for (const key of operation.query)
      parameters.push({
        name: key,
        in: "query",
        required: requiredQuery.has(key),
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
  const streamingPath = "/api/v1/streaming/tournaments/{edition}/next";
  const shared = paths[
    "/api/v1/me/tournaments/{edition}/streaming/next"
  ] as Record<string, Record<string, unknown>>;
  paths[streamingPath] = Object.fromEntries(
    Object.entries(shared).map(([method, operation]) => [
      method,
      {
        ...operation,
        operationId: `streamingNext${method === "get" ? "" : method === "head" ? "Head" : "Preflight"}`,
        security: method === "options" ? [] : [{ StreamingBearer: [] }],
        "x-oclr-scopes": ["streaming:read"],
        "x-oclr-issues": [540],
        description:
          "Edition-bound Streamer access to the subject's next assigned published fixture, explicit published pool and stage. Does not require Developer. No other resources or business writes.",
      },
    ]),
  );
  const responses = shared.get.responses as Record<
    string,
    Record<string, unknown>
  >;
  const [editionParameter] = shared.get.parameters as unknown[];
  const idParameter = (name: string) => ({
    in: "path",
    name,
    required: true,
    schema: { type: "string", format: "uuid" },
  });
  const showcaseOperations = [
    {
      operationId: "showcasePools",
      path: "",
      description:
        "List the current locked and unpublished pool versions granted to this Streamer.",
    },
    {
      operationId: "showcasePool",
      path: "/{poolId}",
      versionRequired: false,
      description:
        "Read all saved entries of the assigned Showcase pool version in one snapshot.",
    },
    {
      operationId: "showcaseCover",
      path: "/{poolId}/covers/{entryId}",
      versionRequired: true,
      description:
        "Read an authenticated cover for an entry in the currently locked, approved pool.",
      contentTypes: ["image/jpeg", "image/png", "image/webp"],
    },
    {
      operationId: "showcaseReplays",
      path: "/{poolId}/replays",
      versionRequired: true,
      description:
        "List the preferred replay for each slot in the granted Showcase pool version. Slots without a preferred replay have an empty array.",
    },
    {
      operationId: "showcaseReplayFile",
      path: "/{poolId}/replays/{replayId}",
      versionRequired: true,
      description:
        "Download a slot's preferred original private .osr for the granted Showcase pool version. Unselected attachments are unavailable.",
      contentTypes: ["application/octet-stream"],
    },
  ];
  for (const {
    operationId,
    path,
    versionRequired,
    description,
    contentTypes,
  } of showcaseOperations) {
    const parameters = [editionParameter];
    for (const param of ["poolId", "entryId", "replayId"])
      if (path.includes(`{${param}}`)) parameters.push(idParameter(param));
    if (versionRequired !== undefined)
      parameters.push({
        in: "query",
        name: "version",
        required: versionRequired,
        schema: {
          type: "string",
          pattern: showcaseVersionQuery.toJSONSchema().pattern,
        },
        description:
          "Use the selected pool version. Refresh the list after a 404 or 409.",
      });
    const security = [{ StreamingBearer: [] }];
    const cover = operationId === "showcaseCover";
    const replayFile = operationId === "showcaseReplayFile";
    const replayList = operationId === "showcaseReplays";
    const issues = replayFile || replayList ? [1189] : [1115];
    paths[showcasePath + path] = {
      get: {
        operationId,
        description,
        "x-oclr-issues": issues,
        "x-oclr-scopes": ["streaming:read"],
        "x-oclr-read-only": true,
        "x-response-size-limit": replayFile
          ? REPLAY_MAX_BYTES
          : showcaseReadMaxBytes,
        security,
        parameters,
        responses: {
          ...responses,
          "403": {
            ...responses["403"],
            description: "Streamer or participant check failed.",
          },
          ...(cover
            ? {
                "502": {
                  ...responses["503"],
                  description: "Artwork unavailable",
                },
              }
            : {}),
          "200": {
            ...responses["200"],
            description,
            headers: {
              ...(responses["200"].headers as Record<string, unknown>),
              "Cache-Control": {
                schema: {
                  type: "string",
                  const: replayFile
                    ? "private, no-store, no-transform"
                    : "private, no-store",
                },
              },
              "CDN-Cache-Control": {
                schema: { type: "string", const: "no-store" },
              },
              ...(replayFile
                ? {
                    "Content-Disposition": {
                      description:
                        "Original replay filename as an attachment; CORS-exposed.",
                      schema: { type: "string" },
                    },
                    "Content-Length": {
                      schema: { type: "integer", maximum: REPLAY_MAX_BYTES },
                    },
                  }
                : {}),
            },
            content: contentTypes
              ? Object.fromEntries(
                  contentTypes.map((type) => [
                    type,
                    { schema: { type: "string", format: "binary" } },
                  ]),
                )
              : {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["data", "meta"],
                      additionalProperties: false,
                      properties: {
                        data: { $ref: `#/components/schemas/${operationId}` },
                        meta: { $ref: "#/components/schemas/ReadMeta" },
                      },
                    },
                    ...(replayList ? { example: showcaseReplaysExample } : {}),
                  },
                },
          },
        },
      },
      head: {
        ...shared.head,
        operationId: `${operationId}Head`,
        "x-oclr-issues": issues,
        security,
        parameters,
      },
      options: {
        ...shared.options,
        operationId: `${operationId}Preflight`,
        "x-oclr-issues": issues,
        parameters,
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "OCLR Read API",
      version: readContractVersion,
      description:
        "Versioned saved reads (#269–#272). Public projections remain public-only even with a token. Explicit invalid Authorization never falls back to anonymous/cookies. Saved-data reads do no provider work or business writes. Authenticated Showcase artwork can load an official image. Later collection pages require version and restart on 409.",
    },
    servers: [{ url: "/" }],
    paths,
    components: {
      securitySchemes: {
        StreamingBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "oclr_stream_opaque",
        },
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
