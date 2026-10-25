import { z } from "zod";
import { editionSchema } from "./editions";
import { appearances } from "./preferences";
import { profileMode } from "./osu-profile-model";

const text = z.string();
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const metric = z.number().finite().nonnegative().nullable();
const timestamp = z.iso.datetime({ offset: true });
export const dataSourceSchema = z
  .object({
    kind: z.enum([
      "database",
      "historical_archive",
      "preview",
      "saved_profile",
    ]),
    revision: z.number().int().nonnegative().nullable(),
    updatedAt: timestamp.nullable(),
    capturedOn: z.iso.date().nullable(),
  })
  .strict();
export type ReadDataSource = z.infer<typeof dataSourceSchema>;
export const registrationStateSchema = z.enum([
  "not_configured",
  "unannounced",
  "upcoming",
  "open",
  "closed",
  "paused",
  "unavailable",
]);
const registrationSchema = z
  .object({
    opensAt: timestamp,
    closesAt: timestamp,
    withdrawUntil: timestamp.nullable(),
    state: registrationStateSchema,
  })
  .strict()
  .nullable();
export const publicTournamentSummarySchema = z
  .object({
    source: dataSourceSchema,
    slug: editionSchema.shape.slug,
    name: editionSchema.shape.name,
    season: editionSchema.shape.season,
    summary: editionSchema.shape.summary,
    status: editionSchema.shape.status,
    timeZone: editionSchema.shape.timeZone,
    branding: editionSchema.shape.branding,
    defaultAppearance: z.enum(appearances).nullable(),
    registration: registrationSchema,
  })
  .strict();
export type PublicTournamentSummary = z.infer<
  typeof publicTournamentSummarySchema
>;
const figure = z
  .object({ src: text, alt: text, width: id, height: id })
  .strict();
const rulebook = z
  .object({
    title: text,
    version: text.nullable(),
    documentUrl: text,
    cover: figure.optional(),
    sections: z.array(
      z
        .object({
          heading: text,
          body: text,
          figures: z.array(figure.extend({ after: text })).optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .nullable();
export const historicalOverviewSchema = z
  .object({
    kind: z.literal("historical_archive"),
    counts: z
      .object({
        teams: z.number().int(),
        players: z.number().int(),
        results: z.number().int(),
        pools: z.number().int(),
        maps: z.number().int(),
      })
      .strict(),
    keyVisual: z
      .object({ src: text, width: id, height: id })
      .strict()
      .nullable(),
    rulebook,
  })
  .strict();
const member = z.object({ osuId: id, username: text }).strict();
const liveOverviewSchema = z
  .object({
    kind: z.literal("database"),
    teams: z.array(
      z
        .object({
          id: z.uuid(),
          name: text,
          captainId: id,
          captainName: text,
          members: z.array(member).nullable(),
        })
        .strict(),
    ),
    pools: z.array(
      z
        .object({
          id: z.uuid(),
          roundName: text,
          entries: z.array(
            z.object({ category: text, title: text, href: text }).strict(),
          ),
        })
        .strict(),
    ),
    organization: z.array(
      z
        .object({
          role: text,
          members: z.array(z.object({ name: text, href: text }).strict()),
        })
        .strict(),
    ),
    draft: z
      .object({
        state: z.enum([
          "setup",
          "ready",
          "live",
          "paused",
          "completed",
          "finalized",
          "aborted",
        ]),
      })
      .strict()
      .nullable(),
    hasFixtures: z.boolean(),
    nextFixture: z
      .object({
        id: z.uuid(),
        roundName: text,
        scheduledAt: timestamp.nullable(),
      })
      .strict()
      .nullable(),
    unavailable: z.array(
      z.enum(["teams", "pools", "staff", "draft", "competition"]),
    ),
  })
  .strict();
const informationDocument = z
  .object({
    name: text,
    intro: text,
    banner: text.nullable(),
    timeZone: text,
    schedule: z.array(z.object({ event: text, date: text }).strict()),
    prizes: z.array(z.object({ placing: text, reward: text }).strict()),
    organization: z.array(
      z
        .object({
          role: text,
          members: z.array(
            z.object({ name: text, href: text.optional() }).strict(),
          ),
        })
        .strict(),
    ),
    links: z.array(z.object({ label: text, href: text }).strict()),
    teams: z.array(
      z
        .object({
          name: text,
          captain: text,
          members: z.array(text),
          href: text.optional(),
        })
        .strict(),
    ),
    pools: z.array(
      z
        .object({
          name: text,
          href: text.optional(),
          groups: z.array(
            z
              .object({
                category: text,
                maps: z.array(
                  z.object({ title: text, href: text.optional() }).strict(),
                ),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    rules: z.array(
      z.object({ heading: text, paragraphs: z.array(text) }).strict(),
    ),
  })
  .strict();
export const publicTournamentSchema = publicTournamentSummarySchema
  .extend({
    rules: editionSchema.shape.rules,
    eligibility: editionSchema.shape.eligibility,
    automaticEligibility: editionSchema.shape.automaticEligibility
      .unwrap()
      .nullable(),
    rankGraceRange: editionSchema.shape.rankGraceRange.unwrap().nullable(),
    schedule: editionSchema.shape.schedule,
    overview: z.discriminatedUnion("kind", [
      historicalOverviewSchema,
      liveOverviewSchema,
      z
        .object({ kind: z.literal("preview"), document: informationDocument })
        .strict(),
    ]),
  })
  .strict();
export type PublicTournament = z.infer<typeof publicTournamentSchema>;
export const privateTournamentSummarySchema = publicTournamentSummarySchema
  .extend({ published: z.boolean(), registrationPaused: z.boolean() })
  .strict();
const { archive: _archive, ...configurationShape } = editionSchema.shape;
void _archive;
const configuration = z.object(configurationShape).strict();
export const privateTournamentSchema = z
  .object({
    source: dataSourceSchema,
    configuration,
    registrationPaused: z.boolean(),
    archive: z
      .object({
        sourceUrl: text,
        capturedOn: z.iso.date(),
        counts: historicalOverviewSchema.shape.counts,
      })
      .strict()
      .nullable(),
  })
  .strict();
export const siteSchema = z
  .object({
    name: z.literal("osu! Chinese League Rookie (OCLR)"),
    defaultAppearance: z.enum(appearances),
    defaultLocale: z.literal("zh-Hans"),
    locales: z.array(z.enum(["zh-Hans", "zh-Hant", "en"])),
    privacyContact: z
      .object({ osuId: id, url: text, label: text })
      .strict()
      .nullable(),
  })
  .strict();
const nullableText = text.nullable().default(null);
const nullableMetric = metric.default(null);
const nullableInteger = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable()
  .default(null);
/** A whitelist of normalized saved fields, never provider/OAuth/cache internals. */
export const savedOsuProfileSchema = z
  .object({
    osuId: id,
    username: text,
    canonicalUrl: text,
    ruleset: profileMode,
    fetchedAt: timestamp,
    source: z.literal("osu! API v2"),
    avatarUrl: nullableText,
    coverUrl: nullableText,
    countryCode: nullableText,
    countryName: nullableText,
    defaultRuleset: profileMode.nullable().default(null),
    joinedAt: nullableText,
    lastSeenAt: nullableText,
    previousUsernames: z.array(text).default([]),
    active: z.boolean().nullable().default(null),
    bot: z.boolean().nullable().default(null),
    badges: z
      .array(
        z
          .object({
            description: text,
            awardedAt: timestamp,
            url: text.nullable(),
          })
          .strip(),
      )
      .nullable()
      .default(null),
    statistics: z
      .object({
        globalRank: nullableInteger,
        countryRank: nullableInteger,
        pp: nullableMetric,
        accuracy: nullableMetric,
        playCount: nullableInteger,
        playTimeSeconds: nullableInteger,
        rankedScore: nullableText,
        totalScore: nullableText,
        maximumCombo: nullableInteger,
        level: z
          .object({ current: nullableInteger, progress: nullableMetric })
          .strip()
          .nullable()
          .default(null),
        grades: z
          .record(text, z.number().int().nonnegative().nullable())
          .nullable()
          .default(null),
      })
      .strip(),
  })
  .strip();
export const savedProfileSchema = z
  .object({
    source: dataSourceSchema,
    state: z.enum(["fresh", "stale"]),
    profile: savedOsuProfileSchema,
  })
  .strict();
export type SavedProfile = z.infer<typeof savedProfileSchema>;
export const publicPlayerSchema = z
  .object({
    source: dataSourceSchema,
    osuId: id,
    username: text,
    editionSlug: editionSchema.shape.slug,
    editionName: text,
    team: z.object({ id: text, name: text }).strict().nullable(),
    captain: z.boolean(),
    role: z.enum(["captain", "player", "coach", "free_agent"]),
    participation: z.enum([
      "accepted",
      "captain",
      "finalized_roster",
      "coach",
      "historical",
    ]),
    coachedTeams: z.array(z.object({ id: text, name: text }).strict()),
    tier: z.number().int().min(0).max(32).nullable(),
    tierLabel: text.nullable(),
    bio: text.nullable(),
    statistics: z
      .object({
        globalRank: z.number().int().positive().nullable(),
        pp: metric,
        fetchedAt: timestamp.nullable(),
        state: z.enum([
          "fresh",
          "stale",
          "missing",
          "not_recorded",
          "preview",
          "unavailable",
        ]),
      })
      .strict(),
  })
  .strict();
export type PublicPlayer = z.infer<typeof publicPlayerSchema>;
const bwsSchema = z
  .object({
    mode: profileMode,
    status: z.enum(["ready", "stale", "pending", "unranked"]),
    value: metric,
    rawPp: metric,
    adjustedPp: metric,
    ppStatus: z.enum(["ready", "stale", "pending", "unavailable"]),
    stale: z.boolean(),
    badgeCount: z.number().int().nonnegative().nullable(),
    globalRank: metric,
    reviewedAt: timestamp.nullable(),
    fetchedAt: timestamp,
  })
  .strict();
export const publicPlayerProfileSchema = z
  .object({
    player: publicPlayerSchema,
    requestedMode: profileMode,
    snapshot: savedProfileSchema.nullable(),
    bws: bwsSchema.nullable(),
  })
  .strict();
export const paginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    nextPage: z.number().int().positive().nullable(),
    collectionVersion: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type ReadPagination = z.infer<typeof paginationSchema>;
export type ReadPayload<T> = {
  data: T;
  meta?: { pagination?: ReadPagination };
};

export type PublicPlayerProfile = z.infer<typeof publicPlayerProfileSchema>;
export type PrivateTournament = z.infer<typeof privateTournamentSchema>;
export type PrivateTournamentSummary = z.infer<
  typeof privateTournamentSummarySchema
>;
export type PublicSite = z.infer<typeof siteSchema>;
export type ReadApiResponse<T> = {
  data: T;
  meta: { apiVersion: "1"; requestId: string; pagination?: ReadPagination };
};
export type ReadApiFailure = {
  error: { code: string; message: string; requestId: string };
};

/** Validate the cache key and whitelist normalized fields before any public use. */
export function safeSavedOsuProfile(
  input: unknown,
  osuId: number,
  mode: z.infer<typeof profileMode>,
) {
  const parsed = savedOsuProfileSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.osuId !== osuId ||
    parsed.data.ruleset !== mode
  )
    return null;
  return {
    ...parsed.data,
    statistics: {
      ...parsed.data.statistics,
      globalRank:
        parsed.data.statistics.globalRank &&
        parsed.data.statistics.globalRank > 0
          ? parsed.data.statistics.globalRank
          : null,
    },
  };
}
