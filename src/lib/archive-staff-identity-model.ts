import { z } from "zod";
import {
  historicalArchiveSchema,
  type HistoricalArchive,
} from "./historical-archive";

export const archiveStaffLookupInput = z
  .object({
    staffIndex: z.number().int().min(0).max(199),
    username: z.string().trim().min(1).max(100),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const archiveStaffConfirmation = archiveStaffLookupInput
  .extend({
    osuId: z.number().int().positive().max(2147483647),
    source: z.string().trim().min(1).max(160),
    identityConfirmed: z.literal(true),
  })
  .strict();

export function confirmArchiveStaffIdentity(
  archive: HistoricalArchive,
  input: z.infer<typeof archiveStaffConfirmation>,
): HistoricalArchive {
  const c = archiveStaffConfirmation.parse(input);
  const person = archive.staff[c.staffIndex];
  if (!person || person.osuId !== null)
    throw new Error("Staff identity is already resolved or missing.");
  if (
    [...archive.staff, ...archive.players].some(
      (p) =>
        p.username === person.username &&
        p.osuId !== null &&
        p.osuId !== c.osuId,
    )
  )
    throw new Error("Historical name has conflicting confirmed IDs.");
  return historicalArchiveSchema.parse({
    ...archive,
    staff: archive.staff.map((p, i) =>
      i === c.staffIndex ? { ...p, osuId: c.osuId } : p,
    ),
  });
}
