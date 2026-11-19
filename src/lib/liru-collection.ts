import { and, eq, exists, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { liruDailyGacha, liruGalleryMessages } from "@/db/schema";
import type { AppTranslator } from "@/i18n/translate";
import { HttpError } from "./http-error";
import { knownPlayerIdentity } from "./player-identity";
import { publicPlayerStillListed } from "./players";
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

/** Every returned author has both a public profile and cards that profile can show. */
export async function publicLiruCollectionAuthors(
  figures: WikiGalleryFigure[],
) {
  if (!process.env.DATABASE_URL || !figures.length) return [];
  const database = db();
  const authors = await database
    .selectDistinct({ osuId: liruDailyGacha.osuId })
    .from(liruDailyGacha)
    .where(
      and(
        exists(
          database
            .select({ id: liruGalleryMessages.id })
            .from(liruGalleryMessages)
            .where(eq(liruGalleryMessages.authorId, liruDailyGacha.osuId)),
        ),
        sql`EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${liruDailyGacha.cards}) AS card(src text, rarity text)
          WHERE ${inArray(
            sql<string>`card.src`,
            figures.map((figure) => figure.src),
          )}
            AND ${inArray(sql<string>`card.rarity`, Object.keys(rarityOrder))}
        )`,
      ),
    );
  const visible = await Promise.all(
    authors.map(async ({ osuId }) => {
      if (await publicPlayerStillListed(osuId)) return osuId;
      try {
        // Published archive staff or name evidence can establish a profile
        // even when the author does not appear in the player directory.
        await knownPlayerIdentity(osuId, []);
        return osuId;
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) return null;
        throw error;
      }
    }),
  );
  return visible.filter((osuId) => osuId !== null);
}
