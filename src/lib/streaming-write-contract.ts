import { z } from "zod";
import { isDeveloperOrigin } from "./developer-api-model";
import { editionSlugSchema } from "./editions";
import {
  streamingTokenMetadataSchema,
  streamingTokenPattern,
} from "./streaming-api-model";
import {
  browserWriteError,
  type WriteApiOperation,
} from "./write-api-contract";

const browserTransport = {
  access: "browser",
  error: browserWriteError,
} as const;
const errors = {
  401: "An active browser session is required.",
  403: "Origin or authentication channel rejected.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};
const path = "/api/streaming/tokens";

export const createStreamingAccessWrite = {
  ...browserTransport,
  id: "createStreamingAccess",
  path,
  method: "POST",
  maxBodyBytes: 4096,
  request: z
    .object({
      editionSlug: editionSlugSchema,
      origin: z.string().max(200).refine(isDeveloperOrigin),
    })
    .strict(),
  summary: "Create edition-scoped, read-only streaming access",
  description:
    "Requires a current Streamer grant for the selected edition. The request body origin must be a configured canonical HTTP or HTTPS loopback origin. The issued credential has only streaming:read scope and its lease is bounded by the browser session. Each successful call creates a new token. After an uncertain response, refresh the token list before retrying.",
  successStatus: 201,
  successDescription:
    "The token is shown only on creation. The response is never cached.",
  response: z.object({
    backend: z.url(),
    access: streamingTokenMetadataSchema,
    token: z.string().regex(streamingTokenPattern),
  }),
  errors: {
    ...errors,
    403: "Origin, authentication channel, or edition Streamer grant rejected.",
    429: "Rate limit or active token quota reached.",
    503: "Site or streaming origin configuration is unavailable or invalid.",
  },
  consumers: [
    "src/components/streaming-access.tsx",
    "src/components/streaming-connect.tsx",
  ],
} as const satisfies WriteApiOperation;

export const revokeStreamingAccessWrite = {
  ...browserTransport,
  id: "revokeStreamingAccess",
  path: `${path}/{tokenId}`,
  method: "DELETE",
  parameters: { tokenId: z.uuid() },
  summary: "Revoke a streaming token owned by the signed-in user",
  description:
    "Requires an active browser session and token ownership. Repeated revocation returns the same metadata and creates no extra audit event.",
  successStatus: 200,
  successDescription: "Revoked access metadata.",
  response: streamingTokenMetadataSchema,
  errors: { ...errors, 404: "The owned token was not found." },
  consumers: ["src/components/streaming-access.tsx"],
} as const satisfies WriteApiOperation;

export type CreateStreamingAccessInput = z.input<
  typeof createStreamingAccessWrite.request
>;
export type StreamingAccessIssued = z.infer<
  typeof createStreamingAccessWrite.response
>;
