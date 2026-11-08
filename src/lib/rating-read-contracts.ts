import { z } from "zod";
import { playerClassificationReadContract } from "./player-leaderboard-model";
import { YUMU_POLICY } from "./yumu-rating";

const nullableNumber = z.union([z.null(), z.number()]);
const playerRating = {
  userId: z.number(),
  appearances: z.number(),
  totalMu: z.number(),
  averageMu: z.number(),
  mq: z.number(),
  era: z.number(),
  dra: z.number(),
  mra: z.number(),
  rws: z.number(),
  rank: z.number(),
  eraIndex: nullableNumber,
  draIndex: nullableNumber,
  rwsIndex: nullableNumber,
};
const classification = z.union([z.null(), playerClassificationReadContract]);
const rating = z.strictObject({
  classificationPolicy: z.string(),
  players: z.array(
    z.strictObject({
      classification,
      username: z.string(),
      ...playerRating,
    }),
  ),
  evidence: z.array(
    z.strictObject({
      ezScoreMultiplier: z.number().optional(),
      statisticsScorePolicy: z.string().optional(),
      gameId: z.number(),
      fixtureId: z.string(),
      revision: z.number(),
      fingerprint: z.string(),
    }),
  ),
  fingerprint: z.string(),
  policy: z.literal(YUMU_POLICY),
  gameCount: z.number(),
  scoreCount: z.number(),
  playerCount: z.number(),
  issues: z.array(z.string()),
});

export const ratingReadContracts = {
  publicAwards: z.union([
    z.null(),
    z.array(
      z.strictObject({
        week: z.number(),
        revision: z.number(),
        publishedAt: z.string(),
        stale: z.boolean(),
        startsAt: z.string(),
        endsAt: z.string(),
        timeZone: z.string(),
        policy: z.string(),
        candidates: z.array(
          z.strictObject({
            username: z.string(),
            userId: z.number(),
            tier: nullableNumber,
            appearances: z.number(),
            performance: z.number(),
            previousAppearances: z.number(),
            previousPerformance: nullableNumber,
            improvement: nullableNumber,
            rating: z.strictObject(playerRating).optional(),
            ratingClass: classification.optional(),
            ratingPlayerCount: z.number().optional(),
          }),
        ),
        mvp: z.array(z.number()),
        mip: z.array(z.number()),
        rookie: z.array(z.number()),
      }),
    ),
  ]),
  matchRatingWorkspace: rating,
  publicMatchRating: z.union([z.null(), rating]),
  publicRoundRatings: z.array(
    z.strictObject({
      roundId: z.string(),
      roundName: z.string(),
      stage: z.union([
        z.literal("group"),
        z.literal("knockout"),
        z.literal("exhibition"),
      ]),
      groupKey: z.string(),
      groupName: z.string(),
      publishedFixtures: z.number(),
      ratedFixtures: z.number(),
      complete: z.boolean(),
      report: rating,
    }),
  ),
} as const;
