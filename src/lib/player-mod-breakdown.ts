import {
  categories,
  slotCategory,
  type MappoolCategory,
} from "./mappool-model";
import type { PlayerMapPerformance } from "./player-map-performance";

/** No Fail and Classic are score settings rather than tournament mod choices. */
const excludedMods = new Set(["NF", "CL"]);

export type ModUsage = {
  mod: string;
  count: number;
};

export type SlotUsage = {
  slot: string;
  category: MappoolCategory | null;
  plays: number;
};

export type PoolUsage = {
  category: MappoolCategory;
  maps: number;
  ratedMaps: number;
  averageEffectiveRating: number | null;
};

export type PlayerModBreakdown = {
  mods: ModUsage[];
  totalMods: number;
  slots: SlotUsage[];
  topSlots: SlotUsage[];
  pools: PoolUsage[];
  topRatings: PoolUsage[];
};

const categoryOrder = (category: MappoolCategory) =>
  categories.indexOf(category);

const slotPosition = (slot: string) => {
  const match = slot.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
};

const slotOrder = (slot: SlotUsage) =>
  (slot.category ? categoryOrder(slot.category) : categories.length) * 100 +
  slotPosition(slot.slot);

const mean = (values: number[]) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

/**
 * Counts the mods a player actually used, excluding NF and CL. A map with no
 * remaining mod counts as No Mod, so NM maps stay visible in the breakdown.
 * Appearance rows group scored plays by their mappool slot, while rating rows
 * group them by the slot's pool category.
 */
export function playerModBreakdown(
  record: PlayerMapPerformance,
): PlayerModBreakdown {
  const rows = record.editions.flatMap((edition) => edition.maps);
  const modCounts = new Map<string, number>();
  const slotPlays = new Map<string, SlotUsage>();
  const poolMaps = new Map<MappoolCategory, number>();
  const poolRatings = new Map<MappoolCategory, number[]>();
  for (const row of rows) {
    const mods = [
      ...new Set(
        row.mods
          .map((mod) => mod.trim().toUpperCase())
          .filter((mod) => mod && !excludedMods.has(mod)),
      ),
    ];
    for (const mod of mods.length ? mods : ["NM"])
      modCounts.set(mod, (modCounts.get(mod) ?? 0) + 1);
    const slot = row.slot?.trim();
    if (slot && slot !== "—") {
      const entry = slotPlays.get(slot);
      slotPlays.set(slot, {
        slot,
        category: row.category ?? slotCategory(slot),
        plays: (entry?.plays ?? 0) + 1,
      });
    }
    // Group by the mappool slot's category (the mod pool the map was drafted
    // into), not by the mods the player happened to use on the score.
    const category = row.category ?? slotCategory(row.slot);
    if (!category) continue;
    poolMaps.set(category, (poolMaps.get(category) ?? 0) + 1);
    if (row.effectiveRating !== null && Number.isFinite(row.effectiveRating))
      poolRatings.set(category, [
        ...(poolRatings.get(category) ?? []),
        row.effectiveRating,
      ]);
  }
  const pools = [...poolMaps].map(([category, maps]) => {
    const ratings = poolRatings.get(category) ?? [];
    return {
      category,
      maps,
      ratedMaps: ratings.length,
      averageEffectiveRating: mean(ratings),
    };
  });
  const mods = [...modCounts]
    .map(([mod, count]) => ({ mod, count }))
    .sort((a, b) => b.count - a.count || a.mod.localeCompare(b.mod));
  const slots = [...slotPlays.values()].sort(
    (a, b) => b.plays - a.plays || slotOrder(a) - slotOrder(b),
  );
  return {
    mods,
    totalMods: mods.reduce((total, mod) => total + mod.count, 0),
    slots,
    topSlots: slots.slice(0, 5),
    pools: pools.sort(
      (a, b) =>
        b.maps - a.maps || categoryOrder(a.category) - categoryOrder(b.category),
    ),
    topRatings: pools
      .filter((pool) => pool.averageEffectiveRating !== null)
      .sort(
        (a, b) =>
          b.averageEffectiveRating! - a.averageEffectiveRating! ||
          b.ratedMaps - a.ratedMaps ||
          categoryOrder(a.category) - categoryOrder(b.category),
      )
      .slice(0, 5),
  };
}
