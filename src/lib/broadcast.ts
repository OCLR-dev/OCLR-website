import { db } from "@/db";
import { userProfileCache } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { remoteMode } from "./data-source";
import { publicDraft } from "./draft";
import type { DraftBoard, DraftIdentity } from "./draft-types";
import { frontendResource } from "./frontend-resource";
import { getOsuUserProfile, PROFILE_TTL_MS } from "./osu-profiles";

/** Enrich only already-published identities. One cache read; only the featured
 * player may refresh after the response. No provider fan-out on roster polls. */
async function databasePublicBroadcastDraft(
  slug: string,
  defer?: (work: () => Promise<void>) => void,
): Promise<DraftBoard | null> {
  const board = await publicDraft(slug);
  if (!board) return null;
  const identities = [
    ...board.picks.map((p) => p.player),
    ...board.rosters.flatMap((r) => [r.team.captain, ...r.players]),
  ];
  const ids = [...new Set(identities.map((p) => p.osuId))];
  if (!ids.length) return board;
  try {
    const rows = await db()
      .select()
      .from(userProfileCache)
      .where(
        and(
          eq(userProfileCache.mode, "osu"),
          inArray(userProfileCache.osuId, ids),
        ),
      );
    const cached = new Map(rows.map((r) => [r.osuId, r]));
    const now = Date.now();
    const featured = board.picks.at(-1)?.player.osuId;
    const row = featured ? cached.get(featured) : undefined;
    if (
      featured &&
      (!row || row.retryAt.getTime() <= now) &&
      (!row?.profile ||
        !Number.isFinite(Date.parse(row.profile.fetchedAt)) ||
        now - Date.parse(row.profile.fetchedAt) < 0 ||
        now - Date.parse(row.profile.fetchedAt) >= PROFILE_TTL_MS ||
        row.errorStatus)
    ) {
      defer?.(async () => {
        // Existing cross-process claims, TTL, bounded cache and provider backoff.
        try {
          await getOsuUserProfile(featured, "osu");
        } catch {
          /* Board remains available. */
        }
      });
    }
    function identity(p: DraftIdentity): DraftIdentity {
      const row = cached.get(p.osuId);
      const profile = row?.errorStatus === 404 ? null : row?.profile;
      const fresh = Boolean(
        profile &&
        profile.ruleset === "osu" &&
        !row?.errorStatus &&
        Number.isFinite(Date.parse(profile.fetchedAt)) &&
        now - Date.parse(profile.fetchedAt) >= 0 &&
        now - Date.parse(profile.fetchedAt) < PROFILE_TTL_MS,
      );
      return {
        osuId: p.osuId,
        username: p.username,
        profile: {
          avatarUrl: profile?.avatarUrl?.startsWith("https://a.ppy.sh/")
            ? profile.avatarUrl
            : null,
          pp: fresh ? profile!.statistics.pp : null,
          globalRank:
            fresh &&
            profile!.statistics.globalRank != null &&
            profile!.statistics.globalRank > 0
              ? profile!.statistics.globalRank
              : null,
          status: fresh
            ? "fresh"
            : !profile && !row?.errorStatus
              ? "loading"
              : "unavailable",
          fetchedAt: profile?.fetchedAt ?? null,
        },
      };
    }
    return {
      ...board,
      picks: board.picks.map((p) => ({ ...p, player: identity(p.player) })),
      rosters: board.rosters.map((r) => ({
        ...r,
        players: r.players.map(identity),
      })),
    };
  } catch {
    // Cache enrichment is optional and must never hide an authoritative board.
    return board;
  }
}
export async function publicBroadcastDraft(
  slug: string,
  defer?: (work: () => Promise<void>) => void,
): Promise<Awaited<ReturnType<typeof databasePublicBroadcastDraft>>> {
  if (remoteMode()) {
    return frontendResource<
      Awaited<ReturnType<typeof databasePublicBroadcastDraft>>
    >("publicBroadcastDraft", { slug });
  }
  return databasePublicBroadcastDraft(slug, defer);
}
