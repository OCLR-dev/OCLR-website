import { z } from "zod";
import {
  developerApiScopes,
  developerOriginPort,
  developerTokenPattern,
  maxDeveloperPorts,
  type DeveloperTokenMetadata,
} from "./developer-api-model";
import type { WriteApiOperation } from "./write-api-contract";

const path = "/api/developer/tokens";
const consumer = "src/components/developer-access.tsx";
const port = z.number().int().min(1).max(65535);
const scopeList = z.array(z.enum(developerApiScopes)).min(1).max(4);
const requestedScopes = scopeList
  .refine((scopes) => new Set(scopes).size === scopes.length)
  .meta({ uniqueItems: true });
const tokenMetadata = z.object({
  id: z.uuid(),
  origin: z.string(),
  ports: z.array(port).max(maxDeveloperPorts),
  scopes: scopeList,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
}) satisfies z.ZodType<DeveloperTokenMetadata>;
const errors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, or current Developer grant rejected.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};

export const createDeveloperTokenWrite = {
  id: "createDeveloperToken",
  path,
  method: "POST",
  access: "browser",
  maxBodyBytes: 4096,
  request: z.union([
    z.strictObject({
      ports: z
        .array(port)
        .min(1)
        .max(maxDeveloperPorts)
        .refine((ports) => new Set(ports).size === ports.length)
        .meta({ uniqueItems: true }),
      scopes: requestedScopes,
    }),
    z.strictObject({
      origin: z
        .string()
        .max(200)
        .refine((origin) => developerOriginPort(origin) !== null)
        .describe("Legacy canonical HTTP or HTTPS loopback origin."),
      scopes: requestedScopes,
    }),
  ]),
  summary: "Create read-only Developer access",
  description:
    "Requires a current global Developer grant and an active browser session. Choose unique local ports within the server policy or send one legacy canonical loopback origin. Each successful call creates a new token, limited to the requested read scopes and expiring within one hour or at parent session expiry, whichever comes first. Refresh the token list before retrying an uncertain response.",
  successStatus: 201,
  successDescription:
    "The token is shown only on creation. The response is never cached.",
  response: z.object({
    backend: z.url(),
    access: tokenMetadata,
    token: z.string().length(52).regex(developerTokenPattern),
  }),
  errors: {
    ...errors,
    403: "Origin, authentication channel, configured port policy, or current Developer grant rejected.",
    429: "Issuance rate limit or active token quota reached.",
    503: "Site origin or Developer port configuration is unavailable or invalid.",
  },
  consumers: [consumer],
} as const satisfies WriteApiOperation;

export const revokeDeveloperTokenWrite = {
  id: "revokeDeveloperToken",
  path: `${path}/{tokenId}`,
  method: "DELETE",
  access: "browser",
  parameters: { tokenId: z.uuid() },
  summary: "Revoke Developer access owned by the signed-in user",
  description:
    "Requires an active browser session, a current global Developer grant and token ownership. The token immediately stops authorizing saved reads. Repeated revocation returns the same metadata without a second audit event.",
  successStatus: 200,
  successDescription: "Revoked access metadata. The response is never cached.",
  response: tokenMetadata,
  errors: { ...errors, 404: "The owned token was not found." },
  consumers: [consumer],
} as const satisfies WriteApiOperation;

export type CreateDeveloperTokenInput = z.input<
  typeof createDeveloperTokenWrite.request
>;
export type DeveloperTokenIssued = z.output<
  typeof createDeveloperTokenWrite.response
>;
