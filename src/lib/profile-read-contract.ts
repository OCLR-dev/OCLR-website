import { z } from "zod";

const modes = [
  z.literal("osu"),
  z.literal("taiko"),
  z.literal("fruits"),
  z.literal("mania"),
] as const;
const nullableString = z.union([z.null(), z.string()]);
const nullableNumber = z.union([z.null(), z.number()]);
const nullableBoolean = z.union([z.null(), z.literal(false), z.literal(true)]);
const profile = z.strictObject({
  osuId: z.number(),
  username: z.string(),
  canonicalUrl: z.string(),
  avatarUrl: nullableString,
  coverUrl: nullableString,
  countryCode: nullableString,
  countryName: nullableString,
  defaultRuleset: z.union([z.null(), ...modes]),
  joinedAt: nullableString,
  lastSeenAt: nullableString,
  previousUsernames: z.array(z.string()),
  active: nullableBoolean,
  bot: nullableBoolean,
  ruleset: z.union(modes),
  fetchedAt: z.string(),
  source: z.literal("osu! API v2"),
  badges: z.union([
    z.null(),
    z.array(
      z.strictObject({
        description: z.string(),
        awardedAt: z.string(),
        url: nullableString,
        imageUrl: nullableString,
        image2xUrl: nullableString,
      }),
    ),
  ]),
  rankHistory: z.union([
    z.null(),
    z.strictObject({
      mode: z.union(modes),
      data: z.array(z.number()),
      dayOffsets: z.array(z.number()).optional(),
    }),
  ]),
  statistics: z.strictObject({
    globalRank: nullableNumber,
    globalRankPercent: nullableNumber,
    countryRank: nullableNumber,
    pp: nullableNumber,
    accuracy: nullableNumber,
    playCount: nullableNumber,
    playTimeSeconds: nullableNumber,
    rankedScore: nullableString,
    totalScore: nullableString,
    maximumCombo: nullableNumber,
    totalHits: nullableNumber,
    level: z.union([
      z.null(),
      z.strictObject({ current: nullableNumber, progress: nullableNumber }),
    ]),
    grades: z.union([z.null(), z.record(z.string(), nullableNumber)]),
  }),
});
export const savedProfileReadContract = z.union([
  z.null(),
  z.strictObject({ profile, stale: z.boolean(), notice: nullableString }),
]);
