import { z } from "zod";

export const liruGachaPath = "/api/wiki/liru-gallery/gacha";
export const liruGachaTimeZone = "+08:00";
export const liruDrawSize = 10;
export const liruRarityRates = { UR: 4, SSR: 6, SR: 20, R: 70 } as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const card = z.strictObject({
  src: z.string(),
  rarity: z.enum(["UR", "SSR", "SR", "R"]),
});

export const liruGachaStatusSchema = z.strictObject({
  day,
  checkedIn: z.boolean(),
  cards: z.array(card).length(liruDrawSize).nullable(),
});

export const liruGachaActionSchema = z.strictObject({
  day,
  action: z.enum(["check-in", "draw"]),
});

export type LiruGachaCard = z.infer<typeof card>;
export type LiruGachaStatus = z.infer<typeof liruGachaStatusSchema>;
export type LiruGachaAction = z.infer<typeof liruGachaActionSchema>;
