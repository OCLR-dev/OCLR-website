import { z } from "zod";
import { REPLAY_BEATMAP_MAX_BYTES } from "./replay-model";
import { replayWriteCommand } from "./replay-write-contract";
import type { WriteApiOperation } from "./write-api-contract";

export const beatmapCacheMirrorIds = [
  "saved",
  "beatconnect",
  "sayobot",
  "catboy",
] as const;
const mirrorId = z.enum(beatmapCacheMirrorIds);
export const beatmapCacheStatus = z.strictObject({
  version: z.number().int().nonnegative(),
  mirrors: z.array(z.strictObject({ id: mirrorId, name: z.string() })),
  package: z
    .strictObject({
      source: z.enum(["mirror", "upload"]),
      size: z.number().int().positive().max(REPLAY_BEATMAP_MAX_BYTES),
      cachedAt: z.iso.datetime(),
    })
    .nullable(),
});

export const beatmapCacheWrite = {
  id: "changeMappoolBeatmapCache",
  path: "/api/admin/tournaments/{edition}/mappools/entries/{entryId}/beatmap-cache",
  method: "POST",
  parameters: { entryId: z.uuid() },
  access: "browser",
  requestMediaType: "multipart/form-data",
  maxBodyBytes: REPLAY_BEATMAP_MAX_BYTES + 16384,
  request: z.discriminatedUnion("action", [
    replayWriteCommand.extend({ action: z.literal("sync"), mirror: mirrorId }),
    replayWriteCommand.extend({
      action: z.literal("upload"),
      file: z.file().max(REPLAY_BEATMAP_MAX_BYTES),
    }),
    replayWriteCommand.extend({ action: z.literal("remove") }),
  ]),
  summary: "Manage a mappool entry's private beatmap package",
  description:
    "Requires current edition-scoped manage_mappools access and an operational edition. Send expectedVersion as a decimal integer and confirmed as the literal true. Sync identifies an approved saved or built-in mirror by ID. Upload sends one .osz. Changes are versioned and audited. The package is only served through the private replay playback route.",
  successStatus: 200,
  successDescription:
    "The current pool version, available mirror choices and saved cache status.",
  response: beatmapCacheStatus,
  errors: {
    400: "Invalid multipart fields or confirmation.",
    401: "An authenticated browser session is required.",
    403: "Origin, browser session, or edition mappool management permission rejected.",
    404: "No matching edition and map entry.",
    409: "The pool version, selected mirror, or operational state changed.",
    413: "The package or multipart request exceeds its byte limit.",
    415: "Expected multipart/form-data.",
    422: "The package, archive, difficulty, or mirror destination could not be validated.",
    429: "Beatmap package processing capacity is temporarily exhausted.",
    500: "Unexpected failure.",
    502: "The mirror failed to return the archive.",
    503: "Private storage or archive validation is unavailable.",
    504: "The download or upload was interrupted.",
    507: "The beatmap cache reached its storage limit.",
  },
  consumers: ["src/components/mappool-beatmap-cache.tsx"],
} as const satisfies WriteApiOperation;

export type BeatmapCacheStatus = z.infer<typeof beatmapCacheStatus>;
export type BeatmapCacheCommand = z.infer<typeof beatmapCacheWrite.request>;
