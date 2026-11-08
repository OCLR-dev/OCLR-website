import { z } from "zod";

const team = z.strictObject({ id: z.string(), name: z.string() });
const nullableNumber = z.union([z.null(), z.number()]);
const nullableString = z.union([z.null(), z.string()]);
export const publicPlayerParticipationReadContract = z.array(
  z.strictObject({
    osuId: z.number(),
    username: z.string(),
    editionSlug: z.string(),
    editionName: z.string(),
    team: z.union([z.null(), team]),
    captain: z.boolean(),
    participation: z.union([
      z.literal("captain"),
      z.literal("coach"),
      z.literal("accepted"),
      z.literal("finalized_roster"),
      z.literal("historical"),
    ]),
    coachedTeams: z.array(team).optional(),
    role: z
      .union([
        z.literal("captain"),
        z.literal("player"),
        z.literal("coach"),
        z.literal("free_agent"),
      ])
      .optional(),
    sourceRole: z.literal("VICE").optional(),
    sourceReference: z.string().optional(),
    placing: nullableNumber.optional(),
    placingRange: z
      .union([
        z.null(),
        z.strictObject({
          official: z.boolean(),
          tied: z.boolean(),
          start: z.number(),
          end: z.number(),
        }),
      ])
      .optional(),
    source: z
      .strictObject({
        kind: z.union([
          z.literal("preview"),
          z.literal("database"),
          z.literal("historical_archive"),
          z.literal("saved_profile"),
        ]),
        revision: nullableNumber,
        updatedAt: nullableString,
        capturedOn: nullableString,
      })
      .optional(),
    tier: nullableNumber.optional(),
    statistics: z
      .strictObject({
        globalRank: nullableNumber,
        pp: nullableNumber,
        fetchedAt: nullableString,
        state: z.union([
          z.literal("fresh"),
          z.literal("unavailable"),
          z.literal("preview"),
          z.literal("stale"),
          z.literal("missing"),
          z.literal("not_recorded"),
        ]),
      })
      .optional(),
    previousUsernames: z.array(z.string()).optional(),
    tierLabel: nullableString.optional(),
    bio: nullableString.optional(),
  }),
);
