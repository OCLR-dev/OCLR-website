import { db, readOnlyData } from "@/db";
import { userProfileCache } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { draftBoardTiers, draftRoundPositions } from "./award-tiers";
import { getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { releasedDraftData } from "./draft-reads";
import type { BroadcastBoard, DraftIdentity } from "./draft-types";
import { frontendResource } from "./frontend-resource";
import { getOsuUserProfile, PROFILE_TTL_MS } from "./osu-profiles";
import { readListedPlayerRatings } from "./listed-player-ratings";
import { readCachedOtrRatings } from "./otr-rating-cache";
import { importedRatingsEdition } from "./player-rating-import-contract";
import { publicPlayerStillListed } from "./players";
import { profileOtrSchema, profileSipTotal } from "./profile-ratings-model";
import { sipSkillsets } from "./sip-rating-model";

async function readFeaturedRatings(
  osuId: number,
  slug: string,
  includeCsv: boolean,
): Promise<BroadcastBoard["picks"][number]["ratings"]> {
  return readOnlyData(async () => {
    if (!(await publicPlayerStillListed(osuId, slug))) return undefined;
    const ratings = await readListedPlayerRatings([osuId], includeCsv);
    const cachedOtr = await readCachedOtrRatings([osuId]);
    const saved = ratings.get(osuId)!;
    const otr = profileOtrSchema.safeParse(cachedOtr.get(osuId));
    const skills = saved.sip.api?.snapshot?.skillsets;
    return {
      otr: otr.success ? otr.data.value : null,
      sip: profileSipTotal({ ...saved, otr: null }),
      etx: saved.etx?.value ?? null,
      etxMods: saved.etx?.mods ?? null,
      sipSkills: Object.fromEntries(
        sipSkillsets.flatMap((skill) => {
          const value = skills?.[skill]?.sr;
          return value !== undefined && value >= 0 ? [[skill, value]] : [];
        }),
      ),
    };
  });
}

/** Enrich published identities from saved data. Only the featured player's
 * basic osu! profile may refresh after the response. Ratings stay cache-only. */
async function databasePublicBroadcastDraft(
  slug: string,
  defer?: (work: () => Promise<void>) => void,
): Promise<BroadcastBoard | null> {
  const edition = await getPublicEdition(slug);
  if (!edition || !process.env.DATABASE_URL) return null;
  const released = await releasedDraftData(slug, true);
  if (!released) return null;
  const { snapshot, turnSequence } = released;
  const tiers = draftBoardTiers(snapshot, turnSequence);
  const positions = draftRoundPositions(turnSequence);
  const activeRound =
    snapshot.activeTeam &&
    snapshot.activeTeam.id === turnSequence[snapshot.turnIndex]
      ? positions.get(snapshot.turnIndex)
      : undefined;
  const latest = snapshot.picks.at(-1);
  const featured = latest?.player.osuId;
  const ratings =
    featured === undefined
      ? undefined
      : await readFeaturedRatings(
          featured,
          slug,
          slug === importedRatingsEdition && !edition.archive,
        ).catch(() => undefined);
  const board: BroadcastBoard = {
    ...snapshot,
    ...(activeRound ? { activeRound } : {}),
    picks: snapshot.picks.map((pick) => {
      const tier = tiers.get(pick.player.osuId);
      const roundPosition = tier ? positions.get(pick.turnIndex) : undefined;
      return {
        ...pick,
        ...(tier ? { tier } : {}),
        ...(roundPosition ? { roundPosition } : {}),
        ...(pick.id === latest?.id && ratings ? { ratings } : {}),
      };
    }),
  };
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
): Promise<BroadcastBoard | null> {
  if (remoteMode()) {
    return frontendResource<BroadcastBoard | null>("publicBroadcastDraft", {
      slug,
    });
  }
  return databasePublicBroadcastDraft(slug, defer);
}
