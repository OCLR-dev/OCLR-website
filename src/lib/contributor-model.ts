import { z } from "zod";

export const CONTRIBUTION_DESCRIPTION_LIMIT = 500;
export const contributionDescriptionSchema = z
  .string()
  .trim()
  .max(CONTRIBUTION_DESCRIPTION_LIMIT)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  );

export const contributorSchema = z
  .object({
    id: z.uuid(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
    osuId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    published: z.boolean(),
    description: contributionDescriptionSchema.optional(),
  })
  .strict();
export const contributorListSchema = z
  .array(contributorSchema)
  .max(100)
  .superRefine((items, context) => {
    if (
      new Set(items.map((item) => item.id)).size !== items.length ||
      new Set(items.map((item) => item.osuId)).size !== items.length
    )
      context.addIssue({
        code: "custom",
        message: "Contributor identities must be unique.",
      });
  });
export type Contributor = z.infer<typeof contributorSchema>;
