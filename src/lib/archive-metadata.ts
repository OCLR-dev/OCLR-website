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
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    timeZone: archiveTimeZone,
  })
  .strict()
  .refine(
    (value) => Date.parse(value.startsAt) < Date.parse(value.endsAt),
    "Season start must precede end.",
  );
export const archiveRound = z
  .object({
    phase: z.enum(["qualifier", "group", "swiss", "knockout", "final"]),
    index: z.number().int().min(1).max(128),
  })
  .strict();
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
