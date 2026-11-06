import { z } from "zod";
import { historicalArchiveSchema } from "./historical-archive";

// Public, already release-validated projection. Provenance/provider/draft data
// never enters this schema. The relational codec retains absent/null/order.
const strings = z.array(z.string());
const map = z
  .object({
    round: z.string(),
    slot: z.string(),
    mapId: z.number().nullable(),
    title: z.string(),
  })
  .strict();
export const archiveStatisticsSummarySchema = z
  .object({
    slug: z.string(),
    archiveKey: z.string(),
    ezScoreMultiplier: z.number().optional(),
    statisticsScorePolicy: z.string().optional(),
    players: z.array(
      z
        .object({
          osuId: z.number().int(),
          username: z.string(),
          teamId: z.string().nullable(),
          role: historicalArchiveSchema.shape.players.element.shape.role,
          tier: z.number().nullable(),
        })
        .strict(),
    ),
    teams: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    stages: strings,
    fixtures: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          stage: z.string(),
          covered: z.boolean(),
          technicalAdjudication: z.boolean(),
          score: z.tuple([z.number(), z.number()]).nullable(),
        })
        .strict(),
    ),
    poolFixtures: z
      .array(
        z
          .object({
            id: z.string(),
            round: z.string(),
            teams: strings,
            teamIds: strings.optional(),
            maps: z.array(map).nullable(),
            picks: strings.nullable(),
            bans: z.array(
              z
                .object({
                  team: z.string(),
                  teamId: z.string().optional(),
                  maps: strings.nullable(),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .optional(),
    publishedAt: z.string().nullable(),
    mpTotal: z.number().int(),
    mpCovered: z.number().int(),
  })
  .strict();
