import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { liruDailyGacha } from "@/db/schema";
import { english } from "@/i18n/translate";
import { HttpError } from "./http-error";
import {
  liruDrawSize,
  liruGachaTimeZone,
  liruRarityRates,
  type LiruGachaAction,
  type LiruGachaCard,
  type LiruGachaStatus,
} from "./liru-gacha-model";
import { liruGallery, type WikiGalleryFigure } from "./wiki-articles";

const formatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: liruGachaTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function liruGachaDay(date = new Date()) {
  return formatter.format(date);
}

export function rollLiruRarity(roll: number, guaranteed: boolean) {
  const { UR, SSR, SR } = liruRarityRates;
  if (roll < UR) return "UR";
  if (roll < UR + SSR) return "SSR";
  return roll < UR + SSR + SR || guaranteed ? "SR" : "R";
}

const galleryPool = liruGallery(english).gallery ?? [];
type Rarity = WikiGalleryFigure["rarity"];
const byRarity = Object.fromEntries(
  (Object.keys(liruRarityRates) as Rarity[]).map((rarity) => [
    rarity,
    galleryPool.filter((figure) => figure.rarity === rarity),
  ]),
) as Record<Rarity, WikiGalleryFigure[]>;

function drawCards(): LiruGachaCard[] {
  return Array.from({ length: liruDrawSize }, (_, index) => {
    const rarity = rollLiruRarity(randomInt(100), index === liruDrawSize - 1);
    const pool = byRarity[rarity];
    const card = pool[randomInt(pool.length)];
    return { src: card.src, rarity };
  });
}

function dailyRow(osuId: number, day: string) {
  return and(eq(liruDailyGacha.osuId, osuId), eq(liruDailyGacha.day, day));
}

export async function getLiruGachaStatus(
  osuId: number,
): Promise<LiruGachaStatus> {
  const day = liruGachaDay();
  const [row] = await db()
    .select({ cards: liruDailyGacha.cards })
    .from(liruDailyGacha)
    .where(dailyRow(osuId, day));
  return { day, checkedIn: !!row, cards: row?.cards ?? null };
}

export async function updateLiruGacha(
  osuId: number,
  input: LiruGachaAction,
): Promise<LiruGachaStatus> {
  const day = liruGachaDay();
  if (input.day !== day)
    throw new HttpError(409, "The draw day has changed. Please try again.");

  return db().transaction(async (tx) => {
    if (input.action === "check-in") {
      await tx
        .insert(liruDailyGacha)
        .values({ osuId, day })
        .onConflictDoNothing();
    }

    // Hold the receipt row until its result is saved. Parallel draws and
    // retries read the same cards and never roll again.
    const where = dailyRow(osuId, day);
    const [row] = await tx
      .select({ cards: liruDailyGacha.cards })
      .from(liruDailyGacha)
      .where(where)
      .for("update");
    if (!row) throw new HttpError(409, "Check in before drawing cards.");
    if (row.cards || input.action === "check-in")
      return { day, checkedIn: true, cards: row.cards };

    const cards = drawCards();
    await tx
      .update(liruDailyGacha)
      .set({ cards, drawnAt: new Date() })
      .where(where);
    return { day, checkedIn: true, cards };
  });
}
