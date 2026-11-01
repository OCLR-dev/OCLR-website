import { z } from "zod";
import { availabilitySchema } from "./schedule-model";
import type { BeatmapMetadata } from "./mappool-model";

export const seasonIntervalLimit = 200;
export const seasonAvailabilitySchema = z
  .array(availabilitySchema.element)
  .max(seasonIntervalLimit);
export const practiceValueSchema = z
  .object({
    score: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    accuracy: z.number().finite().min(0).max(100).nullable(),
    rating: z.number().int().min(1).max(5).nullable(),
    comment: z.string().trim().max(2000),
  })
  .strict();
export type PracticeValue = z.infer<typeof practiceValueSchema>;
export const practiceCommandSchema = practiceValueSchema
  .extend({
    action: z.literal("save_practice"),
    entryId: z.uuid(),
    expectedContext: z.string().regex(/^[a-f0-9]{64}$/),
    expectedVersion: z.number().int().min(0),
    requestKey: z.uuid(),
  })
  .strict();
export const timetableCommandSchema = z
  .object({
    action: z.literal("save_availability"),
    intervals: seasonAvailabilitySchema,
    expectedVersion: z.number().int().min(0),
    requestKey: z.uuid(),
  })
  .strict();

/** A replaced chart or changed mod policy never silently reuses an earlier score. */
export function practiceContextValue(map: {
  beatmapId: number;
  category: string;
  metadata: BeatmapMetadata;
  fmMode: string | null;
  fmRestrictions: string;
}) {
  return JSON.stringify({
    beatmapId: map.beatmapId,
    category: map.category,
    checksum: map.metadata.checksum ?? null,
    configuration: map.metadata.attributes?.configuration ?? null,
    fmMode: map.fmMode,
    fmRestrictions: map.fmRestrictions,
  });
}
export function normalizeSeasonAvailability(
  intervals: z.infer<typeof seasonAvailabilitySchema>,
) {
  return intervals
    .map(({ start, end }) => ({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    }))
    .sort(
      (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    )
    .filter(
      (value, index, all) =>
        index === 0 ||
        value.start !== all[index - 1].start ||
        value.end !== all[index - 1].end,
    );
}
