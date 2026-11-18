import { sql } from "drizzle-orm";
import { db } from "@/db";
import { liruDailyGacha } from "@/db/schema";
import type { AppTranslator } from "@/i18n/translate";
import type { LiruGachaCard } from "./liru-gacha-model";
import { liruGallery, type WikiGalleryFigure } from "./wiki-articles";

export type LiruCollectionEntry = {
  figure: WikiGalleryFigure;
  count: number;
};

const rarityOrder = { UR: 0, SSR: 1, SR: 2, R: 3 };

// The caller must resolve access to the player's OCLR profile first. Only
// aggregate card counts leave this query, never the dated draw receipts.
export async function readLiruCollection(
  osuId: number,
  tr: AppTranslator,
): Promise<LiruCollectionEntry[]> {
  const { rows } = await db().execute<LiruGachaCard & { count: number }>(sql`
    SELECT card.src, card.rarity, count(*)::integer AS count
    FROM ${liruDailyGacha}
    CROSS JOIN LATERAL jsonb_to_recordset(${liruDailyGacha.cards})
      AS card(src text, rarity text)
    WHERE ${liruDailyGacha.osuId} = ${osuId}
    GROUP BY card.src, card.rarity
  `);
  if (rows.length === 0) return [];
  const figures = new Map(liruGallery(tr).gallery.map((f) => [f.src, f]));
  return rows
    .flatMap(({ src, rarity, count }) => {
      const figure = figures.get(src);
      if (!figure || !Object.hasOwn(rarityOrder, rarity)) return [];
      return [{ figure: { ...figure, rarity }, count }];
    })
    .sort(
      (a, b) =>
        rarityOrder[a.figure.rarity] - rarityOrder[b.figure.rarity] ||
        a.figure.src.localeCompare(b.figure.src),
    );
}
