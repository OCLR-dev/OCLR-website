import { z } from "zod";

export const REPLAY_MAX_BYTES = 8 * 1024 * 1024;
export const REPLAY_BEATMAP_MAX_BYTES = 64 * 1024 * 1024;
export const REPLAY_ARCHIVE_MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
export const REPLAY_ARCHIVE_MAX_ENTRIES = 2048;
export const REPLAY_SKIN_MAX_BYTES = 32 * 1024 * 1024;
export const REPLAY_ENTRY_LIMIT = 10;
export const REPLAY_STORAGE_MAX_BYTES = 1024 * 1024 * 1024;
export const REPLAY_STORAGE_MAX_FILES = 10000;
const replayPerformanceSchema = z.strictObject({
  score: z.number().int().nonnegative(),
  maxCombo: z.number().int().min(0).max(0xffff).optional(),
  accuracy: z.number().min(0).max(1).nullable(),
  grade: z.enum(["SS", "SSH", "S", "SH", "A", "B", "C", "D"]).nullable(),
  fullCombo: z.boolean(),
});
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
  performance: replayPerformanceSchema.optional(),
});
export type ReplaySummary = z.infer<typeof replaySummarySchema>;
export type ReplayPerformance = z.infer<typeof replayPerformanceSchema>;
