import { z } from "zod";
import { availabilitySchema } from "./schedule-model";
import type { BeatmapMetadata } from "./mappool-model";

export const seasonIntervalLimit = 200;
export const availabilityStates = [
  "available",
  "unsure",
  "unavailable",
] as const;
export type AvailabilityState = (typeof availabilityStates)[number];
const seasonIntervalSchema = availabilitySchema.element.safeExtend({
  status: z.enum(availabilityStates).optional(),
});
export type SeasonAvailabilityInterval = z.infer<typeof seasonIntervalSchema>;
export const seasonAvailabilitySchema = z
  .array(seasonIntervalSchema)
  .max(seasonIntervalLimit)
  .refine(
    (intervals) =>
      !intervals.some((a, index) =>
        intervals
          .slice(index + 1)
          .some(
            (b) =>
              (a.status ?? "available") !== (b.status ?? "available") &&
              Date.parse(a.start) < Date.parse(b.end) &&
              Date.parse(b.start) < Date.parse(a.end),
          ),
      ),
    "Conflicting availability states",
  );
export const practiceValueSchema = z
  .object({
    score: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    rating: z.number().int().min(1).max(5).nullable(),
    comment: z.string().trim().max(2000),
  })
  .strict();
export type PracticeValue = z.infer<typeof practiceValueSchema>;
const practiceTarget = {
  entryId: z.uuid(),
  expectedContext: z.string().regex(/^[a-f0-9]{64}$/),
  expectedVersion: z.number().int().min(0),
  requestKey: z.uuid(),
};
export const practiceCommandSchema = z.discriminatedUnion("action", [
  practiceValueSchema
    .extend({
      ...practiceTarget,
      action: z.literal("save_practice"),
    })
    .strict(),
  z
    .object({ ...practiceTarget, action: z.literal("delete_practice") })
    .strict(),
]);
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
): SeasonAvailabilityInterval[] {
  return intervals
    .map(({ start, end, status }) => ({
      ...(status && status !== "available" ? { status } : {}),
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
        value.end !== all[index - 1].end ||
        value.status !== all[index - 1].status,
    );
}
