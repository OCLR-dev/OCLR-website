import { z } from "zod";
export const scoringRulesSchema = z
  .object({
    version: z.string().trim().min(1).max(80),
    mode: z.enum(["osu", "taiko", "fruits", "mania"]),
    teamType: z.enum(["team-vs", "head-to-head"]),
    scoringType: z.enum(["score", "scorev2"]),
    aggregation: z.enum(["sum", "average"]),
    playersPerTeam: z.number().int().min(1).max(16),
    exPlayersPerTeam: z.number().int().min(1).max(16).nullable().optional(),
    series: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("first_to"),
          wins: z.number().int().min(1).max(99),
        })
        .strict(),
      z
        .object({
          type: z.literal("fixed_maps"),
          count: z.number().int().min(1).max(99),
          allowDraw: z.boolean(),
        })
        .strict(),
    ]),
    allowSubstitutions: z.boolean(),
    allowShortHanded: z.boolean(),
    failedScorePolicy: z.enum(["include", "zero"]),
    tiedMapPolicy: z.enum(["require_replay", "count_as_draw"]),
  })
  .strict();
export type ScoringRules = z.infer<typeof scoringRulesSchema>;
export const standingsRulesSchema = z
  .object({
    version: z.string().trim().min(1).max(80),
    winPoints: z.number().int().min(-100).max(100),
    lossPoints: z.number().int().min(-100).max(100),
    drawPoints: z.number().int().min(-100).max(100).nullable(),
    tiebreakers: z
      .array(z.enum(["points", "wins", "map_difference", "maps_won"]))
      .min(1)
      .max(4)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export type StandingsRules = z.infer<typeof standingsRulesSchema>;
export function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const groupKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .max(60);
export const maxStageGroups = 4;
export const maxTeamsPerStageGroup = 128;
export const groupConfigurationInputSchema = z
  .object({
    version: z.string().trim().min(1).max(80).optional(),
    groups: z
      .array(
        z
          .object({
            key: groupKeySchema.optional(),
            name: z.string().trim().min(1).max(80),
            teamIds: z
              .array(z.uuid())
              .max(maxTeamsPerStageGroup)
              .refine((ids) => new Set(ids).size === ids.length),
          })
          .strict(),
      )
      .min(1)
      .max(maxStageGroups),
  })
  .strict()
  .refine(
    (c) =>
      new Set(c.groups.flatMap((g) => (g.key ? [g.key] : []))).size ===
        c.groups.filter((g) => g.key).length &&
      new Set(c.groups.flatMap((g) => g.teamIds)).size ===
        c.groups.flatMap((g) => g.teamIds).length,
  );
// Saved configurations remain readable, including historical configurations above the write limit.
export const groupConfigurationSchema =
  groupConfigurationInputSchema.safeExtend({
    version: z.string().trim().min(1).max(80),
    groups: z
      .array(
        groupConfigurationInputSchema.shape.groups.element.extend({
          key: groupKeySchema,
        }),
      )
      .min(1)
      .max(64),
  });
export type GroupConfiguration = z.infer<typeof groupConfigurationSchema>;
