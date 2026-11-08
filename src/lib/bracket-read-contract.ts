import { z } from "zod";

const label = { id: z.string(), label: z.string() };
const nullableString = z.union([z.null(), z.string()]);
const score = z.union([z.null(), z.number()]);
const slot = z.strictObject({
  avatarKey: nullableString.optional(),
  teamId: nullableString,
  label: z.string(),
  sourceMatchId: nullableString,
  kind: z.union([
    z.literal("winner"),
    z.literal("loser"),
    z.literal("team"),
    z.literal("tba"),
    z.literal("bye"),
  ]),
  groupSeed: z.string().optional(),
});
const match = z.strictObject({
  ...label,
  status: z.union([z.literal("pending"), z.literal("completed")]),
  note: nullableString,
  scores: z.tuple([score, score]),
  winnerSlot: z.union([z.null(), z.literal(0), z.literal(1)]),
  detailsUrl: z.string().optional(),
  slots: z.tuple([slot, slot]),
});

export const publicBracketReadContract = z.union([
  z.null(),
  z.strictObject({
    editionSlug: z.string(),
    updatedAt: z.string(),
    source: z.strictObject({ label: z.string(), url: nullableString }),
    published: z.boolean(),
    formatLabel: z.string(),
    groups: z.array(
      z.strictObject({
        ...label,
        layout: z.literal("grid").optional(),
        showAdvancement: z
          .union([z.literal(false), z.literal(true)])
          .optional(),
        rounds: z.array(z.strictObject({ ...label, matches: z.array(match) })),
      }),
    ),
  }),
]);
