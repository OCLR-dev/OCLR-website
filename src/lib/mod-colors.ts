/**
 * Official osu! mod colours.
 *
 * Mirrors the shared mod table used by the newbie documentation
 * (`newbie-doc/.vuepress/constants/mod.js`). Only active rows are copied here;
 * mods that are commented out in that source stay out of this table.
 */
import { contrastInk } from "./color-contrast";

export type ModColor = {
  readonly name: string;
  /** Badge background. */
  readonly bg: string;
  /** Badge text colour. */
  readonly color: string;
};

export const modColors = {
  // Standard / general mods
  NF: { name: "No Fail", bg: "#0068B7", color: "#FFFFFF" },
  EZ: { name: "Easy", bg: "#22AC38", color: "#FFFFFF" },
  TD: { name: "Touch Device", bg: "#7ECEF4", color: "#000000" },
  HD: { name: "Hidden", bg: "#F8B551", color: "#FFFFFF" },
  HR: { name: "Hard Rock", bg: "#D32F2F", color: "#FFFFFF" },
  SD: { name: "Sudden Death", bg: "#FF9800", color: "#FFFFFF" },
  DT: { name: "Double Time", bg: "#00A0E9", color: "#FFFFFF" },
  RX: { name: "Relax", bg: "#BFC31F", color: "#FFFFFF" },
  HT: { name: "Half Time", bg: "#BDBDBD", color: "#000000" },
  NC: { name: "Nightcore", bg: "#9922EE", color: "#FFFFFF" },
  FL: { name: "Flashlight", bg: "#000000", color: "#FFFFFF" },
  AT: { name: "Autoplay", bg: "#00B7EE", color: "#FFFFFF" },
  SO: { name: "Spun Out", bg: "#B28850", color: "#FFFFFF" },
  AP: { name: "Auto Pilot", bg: "#B3D465", color: "#FFFFFF" },
  PF: { name: "Perfect", bg: "#FFF100", color: "#000000" },

  // Other lazer mods
  DC: { name: "Daycore", bg: "#DADADA", color: "#000000" },
  BL: { name: "Blinds", bg: "#EB6100", color: "#FFFFFF" },
  ST: { name: "Strict Tracking", bg: "#D32F2F", color: "#FFFFFF" },
  TP: { name: "Target Practice", bg: "#920783", color: "#FFFFFF" },
  DA: { name: "Difficulty Adjust", bg: "#601986", color: "#FFFFFF" },
  CL: { name: "Classic", bg: "#920783", color: "#FFFFFF" },
  RD: { name: "Random", bg: "#009944", color: "#FFFFFF" },
  MR: { name: "Mirror", bg: "#007130", color: "#FFFFFF" },
  CN: { name: "Cinema", bg: "#00B7EE", color: "#FFFFFF" },
  V2: { name: "Score V2", bg: "#000000", color: "#FFFFFF" },
  SV2: { name: "Score V2", bg: "#000000", color: "#FFFFFF" },
  SW: { name: "Swap", bg: "#7B0046", color: "#FFFFFF" },
  FI: { name: "Fade In", bg: "#F8B551", color: "#000000" },
  CO: { name: "Cover", bg: "#F8B551", color: "#000000" },
  DS: { name: "Dual Stages", bg: "#9E005E", color: "#FFFFFF" },
  IN: { name: "Invert", bg: "#5F5BA8", color: "#FFFFFF" },
  HO: { name: "Hold Off", bg: "#8781BE", color: "#FFFFFF" },

  // Key mods
  "1K": { name: "1 Key", bg: "#616161", color: "#FFFFFF" },
  "2K": { name: "2 Keys", bg: "#616161", color: "#FFFFFF" },
  "3K": { name: "3 Keys", bg: "#616161", color: "#FFFFFF" },
  "4K": { name: "4 Keys", bg: "#616161", color: "#FFFFFF" },
  "5K": { name: "5 Keys", bg: "#616161", color: "#FFFFFF" },
  "6K": { name: "6 Keys", bg: "#616161", color: "#FFFFFF" },
  "7K": { name: "7 Keys", bg: "#616161", color: "#FFFFFF" },
  "8K": { name: "8 Keys", bg: "#616161", color: "#FFFFFF" },
  "9K": { name: "9 Keys", bg: "#616161", color: "#FFFFFF" },
  "10K": { name: "10 Keys", bg: "#616161", color: "#FFFFFF" },

  // Tournament / special
  NM: { name: "No Mod", bg: "#22AC38", color: "#FFFFFF" },
  RC: { name: "Rice", bg: "#22AC38", color: "#FFFFFF" },
  LN: { name: "Lone Note", bg: "#F8B551", color: "#FFFFFF" },
  FE: { name: "Free Mod", bg: "#B57BFF", color: "#FFFFFF" },
  FR: { name: "Free Mod", bg: "#B57BFF", color: "#FFFFFF" },
  FM: { name: "Force Mod", bg: "#9922EE", color: "#FFFFFF" },
  HB: { name: "Hybrid", bg: "#00A0E9", color: "#FFFFFF" },
  SV: { name: "Speed Variation", bg: "#9922EE", color: "#FFFFFF" },
  TB: { name: "Tiebreaker", bg: "#000000", color: "#FFFFFF" },

  ACE: { name: "Ace", bg: "#FFF100", color: "#000000" },
  AC: { name: "Accuracy", bg: "#FF9800", color: "#000000" },
  ACC: { name: "Accuracy", bg: "#FF9800", color: "#000000" },
  EX: { name: "Extra", bg: "#FF9800", color: "#000000" },
  SP: { name: "Special", bg: "#9E040D", color: "#FFFFFF" },
  JB: { name: "Jiba", bg: "#9E040D", color: "#FFFFFF" },

  SV1: { name: "ScoreV1", bg: "#000000", color: "#FFFFFF" },
  V1: { name: "ScoreV1", bg: "#000000", color: "#FFFFFF" },

  EP: { name: "Easy Plus", bg: "#22AC38", color: "#FFFFFF" },
  NP: { name: "Normal Plus", bg: "#22AC38", color: "#FFFFFF" },

  NS: { name: "Normal Short", bg: "#BDBDBD", color: "#000000" },
  NL: { name: "Normal Long", bg: "#616161", color: "#000000" },
  HS: { name: "Hard Short", bg: "#D32F2F", color: "#FFFFFF" },
  HL: { name: "Hard Long", bg: "#9E040D", color: "#FFFFFF" },
  HP: { name: "Hard Plus", bg: "#9922EE", color: "#FFFFFF" },
  RU: { name: "Rush", bg: "#FF9800", color: "#000000" },

  DEFAULT: { name: "Unknown", bg: "#555555", color: "#FFFFFF" },
} as const satisfies Record<string, ModColor>;

const byKey = modColors as Record<string, ModColor>;

/**
 * Colours for a bare mod key (`HD`, `FM`, `10K`). Unknown keys keep their name
 * but fall back to the neutral default, matching the reference table.
 */
export function getModInfo(modKey: string | null | undefined): ModColor {
  const key = modKey?.toString().toUpperCase().trim();
  const mod = key
    ? (byKey[key] ?? { ...modColors.DEFAULT, name: key })
    : modColors.DEFAULT;
  return { ...mod, color: contrastInk(mod.bg) };
}

/**
 * Colours for a mappool slot label. Slots append their position to the mod
 * (`NM2` → `NM`, `HD10` → `HD`), while `TB` has no number at all.
 */
export function slotModInfo(slot: string | null | undefined): ModColor {
  return getModInfo(slot?.replace(/\d+$/, ""));
}
