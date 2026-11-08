import { z } from "zod";

export const REPLAY_MAX_BYTES = 8 * 1024 * 1024;
export const REPLAY_ENTRY_LIMIT = 10;
export const REPLAY_STORAGE_MAX_BYTES = 1024 * 1024 * 1024;
export const REPLAY_STORAGE_MAX_FILES = 10000;
export const replaySummarySchema = z.strictObject({
  format: z.literal("stable"),
  version: z.number(),
  beatmapMd5: z.string(),
  playerName: z.string(),
  mode: z.union([
    z.literal("osu"),
    z.literal("taiko"),
    z.literal("fruits"),
    z.literal("mania"),
  ]),
  mods: z.number(),
});
export type ReplaySummary = z.infer<typeof replaySummarySchema>;
