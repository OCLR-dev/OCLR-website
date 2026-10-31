import { z } from "zod";
export const availabilitySchema = z
  .array(
    z
      .object({
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
      })
      .strict()
      .refine(
        (v) => Date.parse(v.end) > Date.parse(v.start),
        "Invalid interval",
      ),
  )
  .max(40);
export type AvailabilityInterval = z.infer<typeof availabilitySchema>[number];
export type ScheduleBasis = {
  scheduledAt: string;
  timeZone: string;
  homeTeamId: string;
  awayTeamId: string;
  homeCaptainId: number;
  awayCaptainId: number;
};
export type ScheduleStatus =
  "waiting" | "pending" | "approved" | "rejected" | "withdrawn" | "expired";
export const activeSchedule = (state: string) =>
  state === "waiting" || state === "pending";
/** Count distinct respondents, never overlapping rows from one player twice. */
export function availabilitySummary(
  rows: { userId: number; intervals: AvailabilityInterval[] }[],
) {
  const points = [
    ...new Set(
      rows
        .flatMap((r) => r.intervals.flatMap((i) => [i.start, i.end]))
        .map(Date.parse),
    ),
  ].sort((a, b) => a - b);
  return points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1];
    const count = new Set(
      rows
        .filter((r) =>
          r.intervals.some(
            (i) => Date.parse(i.start) <= start && Date.parse(i.end) >= end,
          ),
        )
        .map((r) => r.userId),
    ).size;
    return count
      ? [
          {
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            count,
          },
        ]
      : [];
  });
}
export function scheduleStatus(
  status: ScheduleStatus,
  eligible: boolean,
  basis: ScheduleBasis,
  current: ScheduleBasis | null,
  proposedAt: string,
  now: number,
): ScheduleStatus {
  return activeSchedule(status) &&
    (!eligible ||
      !current ||
      (Object.keys(basis) as (keyof ScheduleBasis)[]).some(
        (key) => basis[key] !== current[key],
      ) ||
      Date.parse(proposedAt) <= now)
    ? "expired"
    : status;
}
