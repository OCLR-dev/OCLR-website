import { z } from "zod";

export const streamingApiScopes = ["streaming:read"] as const;
export type StreamingApiScope = (typeof streamingApiScopes)[number];
const timestamp = z.iso.datetime();
export const streamingTokenMetadataSchema = z.object({
  id: z.uuid(),
  editionSlug: z.string(),
  origin: z.string(),
  scopes: z.array(z.enum(streamingApiScopes)),
  createdAt: timestamp,
  lastUsedAt: timestamp,
  expiresAt: timestamp,
  revokedAt: timestamp.nullable(),
});
export type StreamingTokenMetadata = z.infer<
  typeof streamingTokenMetadataSchema
>;
export const streamingTokenPrefix = "oclr_stream_";
export const streamingTokenPattern = /^oclr_stream_[A-Za-z0-9_-]{43}$/;
export function validStreamingToken(value: string) {
  return streamingTokenPattern.test(value);
}
