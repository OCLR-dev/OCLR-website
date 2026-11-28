import { db } from "@/db";
import {
  mappoolBeatmapCache,
  mappoolEntries,
  mappoolReplays,
  mappools,
} from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { HttpError } from "./http-error";
import { readCachedBeatmapPackage } from "./beatmap-cache-storage";
import {
  readReplayPlaybackAsset,
  type ReplayPlaybackAsset,
} from "./replay-playback-storage";
import { readReplay } from "./replay-storage";

async function publicReplayRows(
  slug: string,
  poolId?: string,
  target?: { entryId: string; replayId: string },
) {
  if (remoteMode() || !(await getPublicEdition(slug))) return [];
  return db()
    .select({
      entryId: mappoolEntries.id,
      replayId: mappoolReplays.id,
      replaySize: mappoolReplays.size,
      replayHash: mappoolReplays.sha256,
      beatmapMd5: mappoolBeatmapCache.beatmapMd5,
      cacheKey: mappoolBeatmapCache.fileKey,
      cacheSize: mappoolBeatmapCache.size,
      cacheHash: mappoolBeatmapCache.sha256,
    })
    .from(mappoolReplays)
    .innerJoin(mappoolEntries, eq(mappoolEntries.id, mappoolReplays.entryId))
    .innerJoin(mappools, eq(mappools.id, mappoolEntries.poolId))
    .innerJoin(
      mappoolBeatmapCache,
      eq(mappoolBeatmapCache.entryId, mappoolEntries.id),
    )
    .where(
      and(
        eq(mappools.editionSlug, slug),
        isNotNull(mappools.publishedAt),
        eq(mappoolReplays.publicPlayback, true),
        eq(mappoolReplays.preferred, true),
        sql`${mappoolReplays.summary}->>'mode' = 'osu'`,
        sql`${mappoolBeatmapCache.beatmapMd5} = ${mappoolReplays.summary}->>'beatmapMd5'`,
        poolId ? eq(mappools.id, poolId) : undefined,
        target ? eq(mappoolEntries.id, target.entryId) : undefined,
        target ? eq(mappoolReplays.id, target.replayId) : undefined,
      ),
    );
}

export type PublicMappoolReplay = { replayId: string; beatmapMd5: string };
export type PublicMappoolReplays = Partial<Record<string, PublicMappoolReplay>>;

export async function publicMappoolReplays(
  slug: string,
  poolId?: string,
): Promise<PublicMappoolReplays> {
  const rows = await publicReplayRows(slug, poolId);
  return Object.fromEntries(
    rows.map(({ entryId, replayId, beatmapMd5 }) => [
      entryId,
      { replayId, beatmapMd5 },
    ]),
  );
}

export async function loadPublicMappoolReplay(
  slug: string,
  poolId: string,
  entryId: string,
  replayId: string,
  asset: "replay.osr" | ReplayPlaybackAsset,
) {
  const missing = () =>
    new HttpError(404, "The replay playback asset is missing.");
  if (
    ![poolId, entryId, replayId].every((id) => z.uuid().safeParse(id).success)
  )
    throw missing();
  const target = { entryId, replayId };
  const [row] = await publicReplayRows(slug, poolId, target);
  if (!row) throw missing();
  const bytes = await (asset === "replay.osr"
    ? readReplay(replayId, row.replaySize, row.replayHash)
    : asset === "beatmap.osz"
      ? readCachedBeatmapPackage(row.cacheKey, row.cacheSize, row.cacheHash)
      : readReplayPlaybackAsset(entryId, row.beatmapMd5, asset));
  // Check publication and the authorized cache again after storage I/O.
  const [current] = await publicReplayRows(slug, poolId, target);
  if (!current || current.cacheKey !== row.cacheKey) throw missing();
  return bytes;
}
