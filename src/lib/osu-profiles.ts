import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { userProfileCache, users } from "@/db/schema";
import { osuApi } from "./osu-api";
import { HttpError } from "./http";
import { safeSavedOsuProfile } from "./read-api-contract";
import {
  normalizeOsuProfile,
  parseOsuProfile,
  type ProfileMode,
  type ProfileSnapshot,
} from "./osu-profile-model";
export const PROFILE_TTL_MS = 30 * 60 * 1000;
export const PROFILE_CACHE_LIMIT = 1000;
export type DirectoryStatistics = {
  globalRank: number | null;
  pp: number | null;
  fetchedAt: string;
  stale: boolean;
};
export type ExportStatistics = {
  globalRank: number | null;
  pp: number | null;
  fetchedAt: string;
  status: "fresh" | "stale";
};
/** Private export only: callers must first filter registrations by staff scope.
 * Read saved statistics in bounded batches, without refreshing provider data. */
export async function cachedExportStatistics(osuIds: number[]) {
  const ids = [...new Set(osuIds)];
  if (ids.length > 10000)
    throw new HttpError(
      413,
      "Narrow the export filters to at most 10,000 applications.",
    );
  for (const id of ids) parseOsuProfile(String(id), "osu");
  const statistics = new Map<number, ExportStatistics>();
  if (!ids.length || !process.env.DATABASE_URL) return statistics;
  const now = Date.now();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const rows = await db()
      .select({
        osuId: userProfileCache.osuId,
        globalRank: sql<unknown>`${userProfileCache.profile}->'statistics'->'globalRank'`,
        pp: sql<unknown>`${userProfileCache.profile}->'statistics'->'pp'`,
        fetchedAt: sql<unknown>`${userProfileCache.profile}->>'fetchedAt'`,
        errorStatus: userProfileCache.errorStatus,
      })
      .from(userProfileCache)
      .where(
        and(
          inArray(userProfileCache.osuId, ids.slice(offset, offset + 500)),
          eq(userProfileCache.mode, "osu"),
          sql`${userProfileCache.errorStatus} IS DISTINCT FROM 404`,
          sql`${userProfileCache.profile}->>'osuId' = ${userProfileCache.osuId}::text`,
          sql`${userProfileCache.profile}->>'ruleset' = 'osu'`,
        ),
      );
    for (const row of rows) {
      const fetched =
        typeof row.fetchedAt === "string" ? Date.parse(row.fetchedAt) : NaN;
      if (!Number.isFinite(fetched)) continue;
      statistics.set(row.osuId, {
        globalRank:
          typeof row.globalRank === "number" &&
          Number.isSafeInteger(row.globalRank) &&
          row.globalRank > 0
            ? row.globalRank
            : null,
        pp:
          typeof row.pp === "number" && Number.isFinite(row.pp) && row.pp >= 0
            ? row.pp
            : null,
        fetchedAt: new Date(fetched).toISOString(),
        status:
          row.errorStatus !== null || now - fetched >= PROFILE_TTL_MS
            ? "stale"
            : "fresh",
      });
    }
  }
  return statistics;
}
/** Only call after publication filtering. Read the complete directory in bounded batches. */
export async function cachedDirectoryStatistics(osuIds: number[]) {
  const ids = [...new Set(osuIds)];
  for (const id of ids) parseOsuProfile(String(id), "osu");
  const statistics = new Map<number, DirectoryStatistics>();
  if (!ids.length || !process.env.DATABASE_URL)
    return { statistics, refreshIds: [] as number[] };
  const rows: (typeof userProfileCache.$inferSelect)[] = [];
  for (let offset = 0; offset < ids.length; offset += 500) {
    rows.push(
      ...(await db()
        .select()
        .from(userProfileCache)
        .where(
          and(
            inArray(userProfileCache.osuId, ids.slice(offset, offset + 500)),
            eq(userProfileCache.mode, "osu"),
          ),
        )),
    );
  }
  const byId = new Map(rows.map((row) => [row.osuId, row]));
  const now = Date.now();
  for (const row of rows) {
    const profile = safeSavedOsuProfile(row.profile, row.osuId, "osu");
    if (!profile || row.errorStatus === 404) continue;
    statistics.set(row.osuId, {
      globalRank: profile.statistics.globalRank,
      pp: profile.statistics.pp,
      fetchedAt: profile.fetchedAt,
      stale:
        row.errorStatus !== null ||
        now - Date.parse(profile.fetchedAt) >= PROFILE_TTL_MS,
    });
  }
  // Oldest attempts first so repeated visits progressively fill the page.
  const refreshIds = ids
    .filter((id) => {
      const row = byId.get(id);
      return (
        (!row || row.retryAt.getTime() <= now) &&
        (!statistics.has(id) || statistics.get(id)!.stale)
      );
    })
    .sort(
      (a, b) =>
        (byId.get(a)?.attemptedAt.getTime() ?? 0) -
        (byId.get(b)?.attemptedAt.getTime() ?? 0),
    );
  return { statistics, refreshIds };
}
let directoryRefreshAfter = 0;
/** Post-response only: at most two sequential lookups per 10s per Node process.
 * Existing profile claims/backoff and the shared provider pacer still apply. */
export async function refreshDirectoryStatistics(osuIds: number[]) {
  if (!osuIds.length || Date.now() < directoryRefreshAfter) return;
  directoryRefreshAfter = Date.now() + 10000;
  for (const id of [...new Set(osuIds)].slice(0, 2)) {
    try {
      await getOsuUserProfile(id, "osu");
    } catch {
      // The profile service retains last-good data and records retry backoff.
    }
  }
}
const pending = new Map<string, Promise<ProfileSnapshot>>();
function saved(
  row: typeof userProfileCache.$inferSelect,
): ProfileSnapshot | null {
  return row.profile
    ? {
        profile: row.profile,
        stale:
          row.errorStatus !== null ||
          Date.now() - Date.parse(row.profile.fetchedAt) >= PROFILE_TTL_MS,
        notice: null,
      }
    : null;
}
/** Saved profile only, for private read-only diagnostics. No provider I/O or claims. */
export async function cachedOsuUserProfile(osuId: number, mode: ProfileMode) {
  const [row] = await db()
    .select()
    .from(userProfileCache)
    .where(
      and(eq(userProfileCache.osuId, osuId), eq(userProfileCache.mode, mode)),
    );
  if (!row || row.errorStatus === 404) return null;
  return saved(row);
}
function unavailable(status: number) {
  return new HttpError(
    status,
    status === 404
      ? "This osu! profile is unavailable or no longer public."
      : status === 429
        ? "Profile refresh is busy. Please retry in a few minutes."
        : "osu! profile information is temporarily unavailable. Please try again later.",
  );
}
async function load(
  osuId: number,
  mode: ProfileMode,
  refresh: boolean,
): Promise<ProfileSnapshot> {
  if (!process.env.DATABASE_URL) throw unavailable(503);
  const now = new Date();
  // Short global lock bounds the shared cache and claims work across Node processes.
  // Provider I/O happens outside the transaction. A token guards late responses.
  const claim = await db().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(713026)`);
    const [row] = await tx
      .select()
      .from(userProfileCache)
      .where(
        and(eq(userProfileCache.osuId, osuId), eq(userProfileCache.mode, mode)),
      );
    const snapshot = row ? saved(row) : null;
    if (snapshot && !snapshot.stale && !refresh && !row.errorStatus)
      return { snapshot };
    if (row && row.retryAt > now) {
      if (row.errorStatus === 404) throw unavailable(404);
      if (snapshot)
        return {
          snapshot: {
            ...snapshot,
            stale: snapshot.stale || row.errorStatus !== null,
            notice:
              "Saved snapshot. A refresh is pending or temporarily unavailable.",
          },
        };
      throw unavailable(row.errorStatus ?? 429);
    }
    const token = randomUUID();
    if (!row) {
      // Evict oldest attempts, including negative lookups. At most 1,000 keys.
      await tx.execute(sql`DELETE FROM user_profile_cache WHERE (osu_id, mode) IN (
        SELECT osu_id, mode FROM user_profile_cache ORDER BY attempted_at DESC OFFSET ${PROFILE_CACHE_LIMIT - 1}
      )`);
    }
    await tx
      .insert(userProfileCache)
      .values({
        osuId,
        mode,
        attemptedAt: now,
        retryAt: new Date(now.getTime() + 60000),
        refreshToken: token,
      })
      .onConflictDoUpdate({
        target: [userProfileCache.osuId, userProfileCache.mode],
        set: {
          attemptedAt: now,
          retryAt: new Date(now.getTime() + 60000),
          refreshToken: token,
        },
      });
    return { token, snapshot };
  });
  if (!claim.token) return claim.snapshot!;
  try {
    const profile = normalizeOsuProfile(
      await osuApi(`/users/${osuId}/${mode}?key=id`),
      osuId,
      mode,
    );
    const committed = await db().transaction(async (tx) => {
      const rows = await tx
        .update(userProfileCache)
        .set({ profile, errorStatus: null, refreshToken: null })
        .where(
          and(
            eq(userProfileCache.osuId, osuId),
            eq(userProfileCache.mode, mode),
            eq(userProfileCache.refreshToken, claim.token!),
          ),
        )
        .returning();
      if (!rows.length) return false;
      // Update only an existing mutable identity; never create users/participation.
      // A slower request for another mode cannot overwrite a newer username.
      await tx
        .update(users)
        .set({ username: profile.username, updatedAt: new Date() })
        .where(and(eq(users.osuId, osuId), sql`${users.updatedAt} <= ${now}`));
      return true;
    });
    if (!committed) throw unavailable(429);
    return { profile, stale: false, notice: null };
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    await db()
      .update(userProfileCache)
      .set({
        errorStatus: status,
        refreshToken: null,
        retryAt: new Date(Date.now() + 5 * 60000),
      })
      .where(
        and(
          eq(userProfileCache.osuId, osuId),
          eq(userProfileCache.mode, mode),
          eq(userProfileCache.refreshToken, claim.token),
        ),
      );
    if (claim.snapshot && status !== 404)
      return {
        ...claim.snapshot,
        stale: true,
        notice:
          "osu! could not refresh this profile. Showing the last successful snapshot.",
      };
    throw unavailable(status);
  }
}
/** Credentials stay server-side. Callers must enforce participant/staff visibility. */
export async function getOsuUserProfile(
  osuId: number,
  mode: ProfileMode = "osu",
  options: { refresh?: boolean } = {},
): Promise<ProfileSnapshot> {
  parseOsuProfile(String(osuId), mode);
  const key = `${osuId}:${mode}`;
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= 32) throw unavailable(429);
  const request = load(osuId, mode, options.refresh === true);
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}

// Short, bounded resolution cache. The authoritative ID profile still uses the
// shared database cache/claims/backoff above; no fuzzy search or alias guessing.
const usernameLookups = new Map<
  string,
  {
    expiresAt: number;
    request: Promise<number>;
  }
>();
let usernamePending = 0;
export async function getOsuProfileByUsername(input: string) {
  const username = input.trim();
  if (
    !username ||
    username.length > 100 ||
    /[\p{Cc}\p{Cs}]/u.test(username) ||
    [".", ".."].includes(username)
  )
    throw new HttpError(
      400,
      "Enter a current osu! username, preserving spaces and special characters.",
    );
  const key = username.toLowerCase();
  const now = Date.now();
  let entry = usernameLookups.get(key);
  if (!entry || entry.expiresAt <= now) {
    if (usernamePending >= 8)
      throw new HttpError(429, "osu! lookup is busy. Please retry shortly.");
    for (const [name, cached] of usernameLookups)
      if (cached.expiresAt <= now) usernameLookups.delete(name);
    if (usernameLookups.size >= 1000)
      usernameLookups.delete(usernameLookups.keys().next().value!);
    usernamePending++;
    const request = (async () => {
      try {
        // Current API uses @ to disambiguate numeric names; key=username is deprecated.
        const value = await osuApi(
          `/users/@${encodeURIComponent(username)}/osu`,
        );
        const id =
          typeof value === "object" && value !== null && "id" in value
            ? value.id
            : null;
        if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
          throw new HttpError(
            502,
            "osu! returned invalid profile data. The saved snapshot was preserved.",
          );
        const profile = normalizeOsuProfile(value, id, "osu");
        if (profile.username.toLowerCase() !== key)
          throw new HttpError(
            409,
            "The username does not match the current official name. Use the current username or numeric ID and verify again.",
          );
        return id;
      } finally {
        usernamePending--;
      }
    })();
    entry = { request, expiresAt: now + 60000 };
    usernameLookups.set(key, entry);
  }
  const osuId = await entry.request;
  let snapshot = await getOsuUserProfile(osuId, "osu");
  if (snapshot.profile.username.toLowerCase() !== key) {
    // The 30-minute ID cache may still contain a former name.
    // Reconcile through the shared refresh claims/backoff before rejecting it.
    snapshot = await getOsuUserProfile(osuId, "osu", { refresh: true });
    if (snapshot.stale || snapshot.notice) throw unavailable(503);
  }
  if (snapshot.profile.username.toLowerCase() !== key)
    throw new HttpError(
      409,
      "The username does not match the current official name. Use the current username or numeric ID and verify again.",
    );
  return snapshot;
}
