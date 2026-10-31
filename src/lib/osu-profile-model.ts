import { z } from "zod";
import { HttpError } from "./http";
export const profileModes = ["osu", "taiko", "fruits", "mania"] as const;
export const profileMode = z.enum(profileModes);
export type ProfileMode = z.infer<typeof profileMode>;
export const modeNames: Record<ProfileMode, string> = {
  osu: "osu!",
  taiko: "osu!taiko",
  fruits: "osu!catch",
  mania: "osu!mania",
};
export function parseOsuProfile(input: string, selectedMode?: string) {
  let id = input.trim();
  let mode = selectedMode ?? "osu";
  if (!/^[1-9]\d*$/.test(id)) {
    // Reject noncanonical syntax before URL can normalize encoded/dot segments.
    const match =
      /^https:\/\/osu\.ppy\.sh\/users\/([1-9]\d*)(?:\/(osu|taiko|fruits|mania))?\/?$/.exec(
        id,
      );
    if (!match)
      throw new HttpError(
        400,
        "Enter a numeric osu! ID or canonical HTTPS osu! profile URL.",
      );
    id = match[1];
    if (match[2]) {
      if (selectedMode && selectedMode !== match[2])
        throw new HttpError(400, "The URL and selected ruleset do not match.");
      mode = match[2];
    }
  }
  const osuId = Number(id);
  if (
    !Number.isSafeInteger(osuId) ||
    osuId <= 0 ||
    !profileMode.safeParse(mode).success
  )
    throw new HttpError(400, "Choose a valid osu! ID and supported ruleset.");
  return {
    osuId,
    mode: mode as ProfileMode,
    canonicalUrl: `https://osu.ppy.sh/users/${osuId}/${mode}`,
  };
}
const number = z.number().finite().nonnegative();
const integer = number.int().max(Number.MAX_SAFE_INTEGER);
const optionalNumber = number.nullish().catch(null);
const optionalInteger = integer.nullish().catch(null);
const text = z.string().trim().min(1).max(200).nullish().catch(null);
const date = z.iso.datetime({ offset: true }).nullish().catch(null);
const badge = z.object({
  description: z.string().trim().min(1).max(500),
  awarded_at: z.iso.datetime({ offset: true }),
  url: z.string().max(2048).optional(),
  image_url: z.string().max(2048).optional(),
  "image@2x_url": z.string().max(2048).optional(),
});
function publicBadgeLink(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function profileBadges(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const badges = z.array(badge).safeParse(value);
  if (!badges.success) return null;
  return badges.data.map((b) => ({
    description: b.description,
    awardedAt: b.awarded_at,
    url: publicBadgeLink(b.url),
    // Badge ribbons are provider artwork; only the osu! asset host is trusted.
    imageUrl: imageUrl(b.image_url, "assets.ppy.sh"),
    image2xUrl: imageUrl(b["image@2x_url"], "assets.ppy.sh"),
  }));
}
// JSON numbers beyond MAX_SAFE_INTEGER have already lost precision. Omit those;
// retain exact digit strings when the provider supplies them as strings.
const score = z
  .union([integer.transform(String), z.string().regex(/^(?:0|[1-9]\d{0,39})$/)])
  .nullish()
  .catch(null);
const stats = z
  .object({
    mode: profileMode.nullish().catch(null),
    global_rank: optionalInteger,
    // Share of the ranked population above this player (0..1); osu! computes it
    // so the site does not have to guess a tier from the rank alone.
    global_rank_percent: number.min(0).max(1).nullish().catch(null),
    country_rank: optionalInteger,
    pp: optionalNumber,
    hit_accuracy: number.max(100).nullish().catch(null),
    play_count: optionalInteger,
    play_time: optionalInteger,
    ranked_score: score,
    total_score: score,
    maximum_combo: optionalInteger,
    total_hits: optionalInteger,
    level: z
      .object({
        current: optionalInteger,
        progress: number.max(100).nullish().catch(null),
      })
      .nullish()
      .catch(null),
    grade_counts: z
      .object({
        ssh: optionalInteger,
        ss: optionalInteger,
        sh: optionalInteger,
        s: optionalInteger,
        a: optionalInteger,
      })
      .nullish()
      .catch(null),
  })
  .nullish();
// Daily global rank history, oldest first. Unranked days arrive as null and are
// compacted: the chart only needs the sequence of known ranks.
const rankHistory = z
  .object({
    mode: profileMode.nullish().catch(null),
    data: z
      .array(integer.positive().nullish().catch(null))
      .max(1000)
      .nullish()
      .catch(null),
  })
  .nullish()
  .catch(null);
const responseSchema = z.object({
  id: integer.positive(),
  username: z.string().trim().min(1).max(100),
  avatar_url: z.string().max(2048).nullish().catch(null),
  cover: z
    .object({ url: z.string().max(2048).nullish().catch(null) })
    .nullish()
    .catch(null),
  country_code: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullish()
    .catch(null),
  country: z
    .object({
      code: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .nullish()
        .catch(null),
      name: text,
    })
    .nullish()
    .catch(null),
  playmode: profileMode.nullish().catch(null),
  join_date: date,
  last_visit: date,
  previous_usernames: z
    .array(z.string().max(100))
    .max(100)
    .nullish()
    .catch(null),
  is_active: z.boolean().nullish().catch(null),
  is_deleted: z.boolean().nullish().catch(null),
  is_bot: z.boolean().nullish().catch(null),
  is_restricted: z.boolean().nullish().catch(null),
  statistics: stats,
  rank_history: rankHistory,
  badges: z.unknown().optional(),
});
function imageUrl(value: string | null | undefined, host: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === host &&
      !url.port &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function normalizeOsuProfile(
  value: unknown,
  osuId: number,
  mode: ProfileMode,
  fetchedAt = new Date().toISOString(),
) {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== osuId)
    throw new HttpError(
      502,
      "osu! returned invalid profile data. The saved snapshot was preserved.",
    );
  const p = parsed.data;
  if (p.is_deleted || p.is_restricted)
    throw new HttpError(404, "This osu! profile is unavailable.");
  if (p.statistics?.mode && p.statistics.mode !== mode)
    throw new HttpError(
      502,
      "osu! returned a different ruleset. The saved snapshot was preserved.",
    );
  const s = p.statistics;
  const rankData =
    p.rank_history && (!p.rank_history.mode || p.rank_history.mode === mode)
      ? (p.rank_history.data ?? []).filter(
          (rank): rank is number => typeof rank === "number" && rank > 0,
        )
      : [];
  return {
    osuId,
    username: p.username,
    canonicalUrl: `https://osu.ppy.sh/users/${osuId}/${mode}`,
    avatarUrl: imageUrl(p.avatar_url, "a.ppy.sh"),
    coverUrl: imageUrl(p.cover?.url, "assets.ppy.sh"),
    countryCode: p.country_code ?? p.country?.code ?? null,
    countryName: p.country?.name ?? null,
    defaultRuleset: p.playmode ?? null,
    joinedAt: p.join_date ?? null,
    lastSeenAt: p.last_visit ?? null,
    previousUsernames: p.previous_usernames ?? [],
    active: p.is_active ?? null,
    bot: p.is_bot ?? null,
    ruleset: mode,
    fetchedAt,
    source: "osu! API v2" as const,
    // Missing/partial inventories are unknown, never a fabricated zero count.
    badges: profileBadges(p.badges),
    // Only the requested ruleset's history is meaningful for this profile.
    rankHistory: rankData.length ? { mode, data: rankData } : null,
    statistics: {
      globalRank: s?.global_rank ?? null,
      globalRankPercent: s?.global_rank_percent ?? null,
      countryRank: s?.country_rank ?? null,
      pp: s?.pp ?? null,
      accuracy: s?.hit_accuracy ?? null,
      playCount: s?.play_count ?? null,
      playTimeSeconds: s?.play_time ?? null,
      rankedScore: s?.ranked_score ?? null,
      totalScore: s?.total_score ?? null,
      maximumCombo: s?.maximum_combo ?? null,
      totalHits: s?.total_hits ?? null,
      level: s?.level
        ? {
            current: s.level.current ?? null,
            progress: s.level.progress ?? null,
          }
        : null,
      grades: s?.grade_counts
        ? Object.fromEntries(
            Object.entries(s.grade_counts).map(([key, v]) => [key, v ?? null]),
          )
        : null,
    },
  };
}
export type OsuUserProfile = ReturnType<typeof normalizeOsuProfile>;
export type ProfileBadge = NonNullable<OsuUserProfile["badges"]>[number];
export type ProfileSnapshot = {
  profile: OsuUserProfile;
  stale: boolean;
  notice: string | null;
};
