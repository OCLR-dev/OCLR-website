import { z } from "zod";
import { REPLAY_MAX_BYTES } from "./replay-model";
import {
  browserWriteError,
  type WriteApiOperation,
} from "./write-api-contract";

export const replayWriteCommand = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  })
  .strict();
export const replayDescription = z
  .string()
  .max(500)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value))
  .describe("Plain text without control or format characters.");
const path =
  "/api/admin/tournaments/{edition}/mappools/entries/{entryId}/replays";
const transport = {
  access: "browser",
  error: browserWriteError,
  successStatus: 200,
  consumers: ["src/components/mappool-replays.tsx"],
} as const;
const errors = {
  401: "An authenticated browser session is required.",
  403: "Origin, authentication channel, or edition replay permission rejected.",
  404: "The tournament or replay target entry is unavailable.",
  409: "The pool version or operational state has changed.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};
const version = z.number().int().nonnegative();
const entryId = z.uuid();

export const uploadReplayWrite = {
  ...transport,
  id: "uploadMappoolReplay",
  path,
  method: "POST",
  parameters: { entryId },
  requestMediaType: "multipart/form-data",
  maxBodyBytes: REPLAY_MAX_BYTES + 16384,
  request: replayWriteCommand
    .extend({
      file: z
        .file()
        .max(REPLAY_MAX_BYTES)
        .describe("One stable .osr file up to 8 MiB."),
      description: replayDescription,
    })
    .strict(),
  summary: "Attach a stable replay to a mappool entry",
  description:
    "Requires the edition's replay management permission. Send exactly one part per field, including an empty description if needed. Send expectedVersion as a decimal integer and confirmed as the literal true. The file name must end in .osr, have at most 180 characters, and contain no path separators, control characters, or format characters. A retry with identical bytes returns the existing replay ID, even if the original pool version is stale.",
  successDescription:
    "The attachment ID, current pool version, and duplicate flag.",
  response: z.object({ duplicate: z.boolean(), id: z.uuid(), version }),
  errors: {
    ...errors,
    400: "Missing or invalid multipart fields, confirmation, filename, or replay contents.",
    409: "The pool changed, the edition is archived, the replay does not match the map, or the entry is full.",
    413: "The replay file or complete multipart body exceeds its byte limit.",
    415: "Expected multipart/form-data and a supported stable replay version.",
    429: "Replay validation is busy.",
    503: "Site configuration or replay storage is unavailable.",
    507: "Replay storage capacity reached.",
  },
} as const satisfies WriteApiOperation;

export const deleteReplayWrite = {
  ...transport,
  id: "deleteMappoolReplay",
  path: `${path}/{replayId}`,
  method: "DELETE",
  parameters: { entryId, replayId: entryId },
  maxBodyBytes: 32768,
  request: replayWriteCommand,
  summary: "Delete a mappool replay attachment",
  description:
    "Requires the edition's replay management permission. Confirm the current pool version. A repeated delete returns removed:false and the current pool version, with no extra audit event.",
  successDescription:
    "Whether an attachment was removed and the current pool version.",
  response: z.object({ removed: z.boolean(), version }),
  errors,
} as const satisfies WriteApiOperation;

export type ReplayUploadReceipt = z.infer<typeof uploadReplayWrite.response>;
export type ReplayDeleteReceipt = z.infer<typeof deleteReplayWrite.response>;
export type ReplayWriteCommand = z.input<typeof replayWriteCommand>;
