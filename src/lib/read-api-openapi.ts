import { z } from "zod";
import { readOperations, readSchemas } from "./read-api-operations";
export function readApiSpecification() {
  const components = Object.fromEntries(
    Object.entries(readSchemas).map(([name, schema]) => {
      const { $schema, ...definition } = z.toJSONSchema(schema);
      void $schema;
      return [name, definition];
    }),
  );
  const paths: Record<string, unknown> = {};
  for (const operation of readOperations) {
    const parameters: unknown[] = [];
    for (const key of ["edition", "osuId"])
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
              : { type: "string", pattern: "^[1-9][0-9]*$" },
        });
    for (const key of operation.query)
      parameters.push({
        name: key,
        in: "query",
        required: false,
        description:
          key === "version"
            ? "Pass collectionVersion from page 1 on every subsequent page. A change returns 409; restart the collection."
            : undefined,
        schema:
          key === "mode"
            ? {
                type: "string",
                enum: ["osu", "taiko", "fruits", "mania"],
                default: "osu",
              }
            : key === "page" || key === "pageSize"
              ? {
                  type: "integer",
                  minimum: 1,
                  maximum: key === "pageSize" ? 100 : 10000,
                  default: key === "pageSize" ? 50 : 1,
                }
              : key === "version"
                ? { type: "string", pattern: "^[a-f0-9]{64}$" }
                : { type: "string", maxLength: 100 },
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
        description: "Read projection",
        content: { "application/json": { schema: successSchema } },
      },
    };
    for (const code of [400, 401, 403, 404, 409, 413, 429, 500, 503])
      responses[String(code)] = {
        description:
          "Machine-readable error; no-store and matching CORS headers for allowed origins",
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
        "x-oclr-scopes": [operation.scope],
        "x-response-size-limit":
          operation.id === "getApiIdentity" ? 262144 : 2097152,
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
      version: "1.0.0",
      description:
        "Stage 2 (#269). Public projections remain public-only even with a token. Explicit invalid Authorization never falls back to anonymous/cookies. Reads never fetch providers or mutate business data. Later collection pages require version and restart on 409.",
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
