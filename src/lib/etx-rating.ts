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
  if (!osuIds.length) return new Map<number, EtxRating | null>();
  const rows = await db()
    .select({ osuId: etxRatingCache.osuId, rating: etxRatingCache.rating })
    .from(etxRatingCache)
    .where(
      and(
        inArray(etxRatingCache.osuId, [...new Set(osuIds)]),
        isNotNull(etxRatingCache.fetchedAt),
      ),
    );
  return new Map(rows.map(({ osuId, rating }) => [osuId, rating]));
}
