import { and, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { etxRatingCache } from "@/db/schema";

export type EtxRating = {
  value: number;
  provisional: boolean;
  outdated: boolean;
};

/** Only look up IDs from the publication-checked directory. */
export async function readDirectoryEtxRatings(osuIds: number[]) {
  return new Map(
    [...(await readEtxRatingSnapshots(osuIds))].map(([osuId, { rating }]) => [
      osuId,
      rating,
    ]),
  );
}

/** Only look up IDs with publication-checked participation. */
export async function readEtxRatingSnapshots(osuIds: number[]) {
  if (!osuIds.length)
    return new Map<number, { rating: EtxRating | null; fetchedAt: Date }>();
  const rows = await db()
    .select({
      osuId: etxRatingCache.osuId,
      rating: etxRatingCache.rating,
      fetchedAt: etxRatingCache.fetchedAt,
    })
    .from(etxRatingCache)
    .where(
      and(
        inArray(etxRatingCache.osuId, [...new Set(osuIds)]),
        isNotNull(etxRatingCache.fetchedAt),
      ),
    );
  const snapshots = new Map<
    number,
    { rating: EtxRating | null; fetchedAt: Date }
  >();
  for (const { osuId, rating, fetchedAt } of rows) {
    if (fetchedAt) snapshots.set(osuId, { rating, fetchedAt });
  }
  return snapshots;
}
