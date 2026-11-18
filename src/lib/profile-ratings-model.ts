import { z } from "zod";
import { etxModsSchema } from "./etx-rating-model";
import { sipSnapshotSchema } from "./sip-rating-model";

const time = z.iso.datetime({ offset: true });
export const profileOtrSchema = z.object({
  value: z.number().finite(),
  fetchedAt: time,
  profileUrl: z.string().max(1024).url().startsWith("https://"),
});
export const profileSipApiSchema = z
  .strictObject({
    value: z.number().finite().nullable(),
    fetchedAt: time,
    snapshot: sipSnapshotSchema.nullable(),
  })
  .refine(({ value, snapshot }) =>
    snapshot === null
      ? value !== null // verified total from a pre-breakdown cache row, not a 404
      : value === (snapshot.rating?.value ?? null),
  );
export const profileCsvTotalSchema = z.strictObject({
  value: z.number().finite(),
  importedAt: time.nullable(),
});
// importedAt is when OCLR saved the API response or imported the CSV row.
export const profileEtxSchema = profileCsvTotalSchema.extend({
  value: z.number().finite().nonnegative(),
  provisional: z.boolean(),
  outdated: z.boolean(),
  mods: etxModsSchema.nullable(),
});
export const profileRatingsSchema = z.strictObject({
  otr: profileOtrSchema.nullable(),
  sip: z.strictObject({
    api: profileSipApiSchema.nullable(),
    csv: profileCsvTotalSchema.nullable(),
  }),
  etx: profileEtxSchema.nullable(),
});
export type ProfileRatings = z.infer<typeof profileRatingsSchema>;

export function profileSipTotal(ratings?: ProfileRatings | null) {
  return ratings?.sip.api?.value ?? ratings?.sip.csv?.value ?? null;
}
