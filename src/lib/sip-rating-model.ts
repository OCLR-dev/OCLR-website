import { z } from "zod";

export const sipSkillsets = [
  "Aim",
  "Tapping",
  "Low AR",
  "High AR",
  "High BPM",
  "Precision",
  "Technical",
] as const;

const label = z.string().trim().min(1).max(64);
const share = z.number().min(0).max(1);
// Project the provider's fields, not its response object or identity metadata.
export const sipRatingSchema = z.object({
  name: label,
  value: z.number().finite(),
  sr: z.number().finite(),
  globalRank: z.int().nonnegative(),
  countryRank: z.int().nonnegative(),
  pp: z.int(),
  accuracy: share,
  combo: share,
});
export type SipRating = z.infer<typeof sipRatingSchema>;

const categories = z
  .record(
    z
      .string()
      .min(1)
      .max(64)
      .refine(
        (key) =>
          key === key.trim() &&
          !["__proto__", "prototype", "constructor"].includes(key),
      ),
    sipRatingSchema,
  )
  .refine((entries) => Object.keys(entries).length <= 32);
export const sipSnapshotSchema = z.object({
  rating: sipRatingSchema.nullable(),
  modifications: categories.nullable(),
  skillsets: categories.nullable(),
});
export type SipSnapshot = z.infer<typeof sipSnapshotSchema>;
