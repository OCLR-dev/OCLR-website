import { z } from "zod";

const note = z.string().trim().min(1).max(6000);
const rank = z.number().int().min(1).max(128);
export const archiveTimeZone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Use a recognized time zone.");
export const archivePlacement = z
  .object({ start: rank, end: rank })
  .strict()
  .refine(
    (value) => value.start <= value.end,
    "Placement start must not exceed end.",
  );
export const archiveSeason = z
  .object({
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    timeZone: archiveTimeZone,
    precision: z.enum(["day", "instant"]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.startsAt ||
      !value.endsAt ||
      Date.parse(value.startsAt) < Date.parse(value.endsAt),
    "Season start must precede end.",
  )
  .refine(
    (value) => Boolean(value.startsAt || value.endsAt),
    "Record at least one known boundary.",
  );
export const archiveRound = z
  .object({
    phase: z.enum(["qualifier", "group", "swiss", "knockout", "final"]),
    index: z.number().int().min(1).max(128),
  })
  .strict();
// Some early seasons call a capped, draw-capable series BO8/BO10.
// Do not turn those into an odd best-of or manufacture a tiebreaker.
export const archiveMatchFormat = z.union([
  z
    .object({
      bestOf: z
        .number()
        .int()
        .min(1)
        .max(99)
        .refine((v) => v % 2 === 1),
    })
    .strict(),
  z
    .object({
      maxGames: z.number().int().min(1).max(99),
      winsRequired: z.number().int().min(1).max(99),
    })
    .strict()
    .refine(
      (v) => v.winsRequired > v.maxGames / 2 && v.winsRequired <= v.maxGames,
      "The winning target must exceed half of the maximum games.",
    ),
]);
export const archiveEvidenceUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  }, "Use an HTTPS evidence URL without credentials.");
export const archiveAdjudication = z
  .object({
    kind: z.enum(["technical", "forfeit", "cancelled", "not-played"]),
    note,
    evidenceUrl: archiveEvidenceUrl,
  })
  .strict();
export const archiveStandingMetadata = {
  placement: archivePlacement.optional(),
  tied: z.boolean().optional(),
  qualified: z.boolean().optional(),
  official: z.boolean().optional(),
  note: note.optional(),
  scope: z.enum(["group", "final"]).optional(),
};
