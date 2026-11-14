import maxCombos from "@/data/beatmap-max-combos.json";

/**
 * Versioned parameters for the star-rating + guidance-offset fit. Bump the
 * policy string whenever a number below changes, so saved or cached output can
 * be traced back to the model that produced it.
 */
export const FITTED_DIFFICULTY_POLICY = "sr-guidance-rank-v1";
/** How much of the fitted percentile comes from guidance instead of stars. */
export const FITTED_GUIDANCE_WEIGHT = 0.3;
/** Pseudo-plays that pull a map's guidance back toward its star expectation. */
export const FITTED_SHRINK_PLAYS = 20;
/** Offsets larger than this are treated as noise and clamped. */
export const FITTED_MAX_OFFSET = 0.6;
/** Maps with fewer countable plays do not move away from their star rating. */
export const FITTED_MIN_PLAYS = 3;
/** Below this many sampled maps the guidance ranking is not trusted at all. */
export const FITTED_MIN_MAPS = 10;

const GUIDANCE_COMBO_WEIGHT = 700_000;
const GUIDANCE_ACCURACY_WEIGHT = 300_000;
const GUIDANCE_ACCURACY_POWER = 8;
const GUIDANCE_MIN_ACCURACY = 0.001;
const GUIDANCE_MIN_COMBO = 10;

const MOD_BONUS: Record<string, number> = {
  HD: 1.04,
  DT: 1.23,
  NC: 1.23,
  HR: 1.09,
  EZ: 0.75,
  FL: 1.2,
};

const POOL_MODS = new Set(Object.keys(MOD_BONUS));

const comboTable = maxCombos.combos as Record<string, number>;

/** One counted score, reduced to what the guidance score needs. */
export type FittedPlay = {
  gameId: number;
  slot: string;
  accuracy: number | null;
  combo: number | null;
  mods: readonly string[];
  editionSlug: string;
};

export type FittedMapDifficulty = {
  /** Star rating after the offset, rounded to two decimals. */
  fittedStars: number;
  /** Signed correction applied to the stored star rating. */
  offset: number;
  /** Countable plays that contributed to the guidance score. */
  samples: number;
};

type MapInput = { beatmapId: number; stars: number | null };

function slotCategory(slot: string) {
  return slot.trim().toUpperCase().replace(/\d+$/, "");
}

function modBonus(mods: readonly string[]) {
  let bonus = 1;
  for (const mod of mods) bonus *= MOD_BONUS[mod] ?? 1;
  return bonus;
}

/**
 * The pool mods of a map. Fixed-mod slots use their own mod; Free Mod and Tie
 * Breaker fall back to the most common difficulty-mod combination seen on the
 * map, which mirrors how the player leaderboard scores those slots.
 */
function poolMods(slot: string, plays: readonly FittedPlay[]) {
  const category = slotCategory(slot);
  if (category === "HD" || category === "HR" || category === "DT")
    return [category];
  const counts = new Map<string, number>();
  for (const play of plays) {
    const mods = [
      ...new Set(
        play.mods
          .map((mod) => mod.trim().toUpperCase())
          .filter((mod) => POOL_MODS.has(mod)),
      ),
    ].sort();
    if (!mods.length) continue;
    const key = mods.join("+");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts].sort((left, right) => right[1] - left[1])[0];
  return best ? best[0].split("+") : [];
}

function normalizeAccuracy(accuracy: number | null) {
  if (accuracy === null || !Number.isFinite(accuracy)) return null;
  const value = accuracy > 1 && accuracy <= 100 ? accuracy / 100 : accuracy;
  return value >= GUIDANCE_MIN_ACCURACY && value <= 1 ? value : null;
}

function guidanceScore(
  play: FittedPlay,
  maxCombo: number,
  bonus: number,
): number | null {
  const accuracy = normalizeAccuracy(play.accuracy);
  if (accuracy === null) return null;
  if (play.combo === null || !Number.isFinite(play.combo)) return null;
  if (play.combo < GUIDANCE_MIN_COMBO) return null;
  const combo = Math.min(play.combo, maxCombo);
  const value =
    (GUIDANCE_COMBO_WEIGHT * (combo / maxCombo) +
      GUIDANCE_ACCURACY_WEIGHT * accuracy ** GUIDANCE_ACCURACY_POWER) *
    bonus;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Share of values at or below each entry, with ties sharing their midrank. */
function rankPercentiles(entries: { key: number; value: number }[]) {
  const positions = new Map<number, number>();
  const sorted = [...entries].sort(
    (left, right) => left.value - right.value || left.key - right.key,
  );
  for (let start = 0; start < sorted.length; ) {
    let end = start;
    while (
      end + 1 < sorted.length &&
      sorted[end + 1].value === sorted[start].value
    )
      end++;
    const position =
      sorted.length === 1 ? 0.5 : (start + end) / 2 / (sorted.length - 1);
    for (let index = start; index <= end; index++)
      positions.set(sorted[index].key, position);
    start = end + 1;
  }
  return positions;
}

/** Percentile of the star distribution, interpolated between neighbours. */
function quantile(sorted: number[], position: number) {
  if (!sorted.length) return null;
  const clamped = Math.min(Math.max(position, 0), 1);
  const index = clamped * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function linearFit(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    covariance += (point.x - meanX) * (point.y - meanY);
    variance += (point.x - meanX) ** 2;
  }
  if (variance <= 0) return null;
  const slope = covariance / variance;
  return { slope, intercept: meanY - slope * meanX };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Fit every map with a star rating against the guidance scores earned on it.
 * The star ranking and the guidance ranking are blended per map, then read
 * back off the pool's own star distribution to produce a corrected rating.
 */
export function fitBeatmapDifficulty(
  maps: readonly MapInput[],
  plays: ReadonlyMap<number, readonly FittedPlay[]>,
): Map<number, FittedMapDifficulty> {
  const output = new Map<number, FittedMapDifficulty>();
  const starValues = maps
    .map((map) => map.stars)
    .filter((stars): stars is number => stars !== null && Number.isFinite(stars))
    .sort((left, right) => left - right);
  if (!starValues.length) return output;

  const starsByMap = new Map<number, number>();
  for (const map of maps) {
    if (map.stars !== null && Number.isFinite(map.stars))
      starsByMap.set(map.beatmapId, map.stars);
  }

  // Guidance per map, before the edition-level score normalisation.
  const rawByMap = new Map<number, { value: number; editionSlug: string }[]>();
  const editionValues = new Map<string, number[]>();
  for (const [beatmapId, list] of plays) {
    const maxCombo = comboTable[String(beatmapId)];
    if (!maxCombo || !Number.isSafeInteger(maxCombo) || maxCombo <= 0)
      continue;
    if (!list.length) continue;
    const slot = list.find((play) => play.slot.trim())?.slot ?? "";
    const bonus = modBonus(poolMods(slot, list));
    for (const play of list) {
      const value = guidanceScore(play, maxCombo, bonus);
      if (value === null) continue;
      const bucket = rawByMap.get(beatmapId) ?? [];
      bucket.push({ value, editionSlug: play.editionSlug });
      rawByMap.set(beatmapId, bucket);
      const edition = editionValues.get(play.editionSlug) ?? [];
      edition.push(value);
      editionValues.set(play.editionSlug, edition);
    }
  }

  // Editions differ in field strength and in how generous their pools are; use
  // the edition median as the field-strength proxy for this version.
  const editionScale = new Map<string, number>();
  for (const [slug, values] of editionValues) {
    if (values.length < 5) continue;
    const center = median(values);
    if (center && center > 0) editionScale.set(slug, center);
  }

  // Every counted play is one guidance observation; the edition median already
  // removes the shared field-strength component.
  const logs = new Map<number, { log: number; count: number }>();
  for (const [beatmapId, raw] of rawByMap) {
    if (raw.length < FITTED_MIN_PLAYS) continue;
    let sum = 0;
    for (const sample of raw) {
      const scale = editionScale.get(sample.editionSlug) ?? 1;
      sum += Math.log(sample.value / scale);
    }
    logs.set(beatmapId, { log: sum / raw.length, count: raw.length });
  }

  const points = [...logs].flatMap(([beatmapId, entry]) => {
    const stars = starsByMap.get(beatmapId);
    return stars === undefined ? [] : [{ x: stars, y: entry.log }];
  });
  const regression = points.length >= FITTED_MIN_MAPS ? linearFit(points) : null;

  // Shrink each map toward the guidance its star rating predicts.
  const adjusted = new Map<number, number>();
  for (const [beatmapId, entry] of logs) {
    let value = entry.log;
    if (regression) {
      const stars = starsByMap.get(beatmapId);
      if (stars !== undefined) {
        const expected = regression.intercept + regression.slope * stars;
        value =
          (entry.count * entry.log + FITTED_SHRINK_PLAYS * expected) /
          (entry.count + FITTED_SHRINK_PLAYS);
      }
    }
    adjusted.set(beatmapId, value);
  }
  if (adjusted.size < FITTED_MIN_MAPS) return output;

  const starPercentile = rankPercentiles(
    maps.flatMap((map) => {
      const stars = starsByMap.get(map.beatmapId);
      return stars === undefined ? [] : [{ key: map.beatmapId, value: stars }];
    }),
  );
  const guidancePercentile = rankPercentiles(
    [...adjusted].map(([beatmapId, value]) => ({ key: beatmapId, value })),
  );

  for (const beatmapId of adjusted.keys()) {
    const stars = starsByMap.get(beatmapId);
    if (stars === undefined) continue;
    const starPosition = starPercentile.get(beatmapId);
    const guidancePosition = guidancePercentile.get(beatmapId);
    if (starPosition === undefined || guidancePosition === undefined) continue;
    // Higher guidance means the map played easier than its stars suggest.
    const blended =
      (1 - FITTED_GUIDANCE_WEIGHT) * starPosition +
      FITTED_GUIDANCE_WEIGHT * (1 - guidancePosition);
    const target = quantile(starValues, blended);
    if (target === null) continue;
    const raw = target - stars;
    const clamped = Math.max(
      -FITTED_MAX_OFFSET,
      Math.min(FITTED_MAX_OFFSET, raw),
    );
    const offset = Math.abs(clamped) < 0.005 ? 0 : round2(clamped);
    output.set(beatmapId, {
      fittedStars: round2(stars + offset),
      offset,
      samples: logs.get(beatmapId)?.count ?? 0,
    });
  }

  return output;
}
