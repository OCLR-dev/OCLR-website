import {
  difficultyMods,
  difficultyConfigurations,
  type BeatmapAttributes,
  type BeatmapMetadata,
  type DifficultyConfiguration,
  type DifficultySnapshot,
  type DifficultyValues,
} from "./mappool-model";

export type DifficultyChoice = {
  adjusted: boolean;
  fm: "" | "HD" | "HR" | "EZ";
};
export type DifficultyDisplay = {
  values: DifficultyValues;
  status: "base" | "recorded" | "adjusted" | "missing" | "variable";
  configuration: DifficultyConfiguration | null;
  rate: number;
  fetchedAt?: string;
  ruleset?: BeatmapMetadata["mode"];
  attributes?: BeatmapAttributes;
  fallback?: "base" | "recorded";
};
export const emptyDifficulty: DifficultyValues = {
  stars: null,
  bpm: null,
  duration: null,
  ar: null,
  od: null,
  cs: null,
  hp: null,
};
export function baseDifficulty(m: Partial<DifficultyValues>): DifficultyValues {
  const result = { ...emptyDifficulty };
  for (const key of Object.keys(result) as (keyof DifficultyValues)[]) {
    const value = m[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0)
      result[key] = value;
  }
  return result;
}
export function previewConfigurations(
  category: string,
  configured?: DifficultyConfiguration | null,
): DifficultyConfiguration[] {
  if (category === "FM") return ["HD", "HR", "EZ"];
  if (category === "NM") return [];
  if (configured && difficultyConfigurations.includes(configured))
    return [configured];
  return category === "HD" || category === "HR" || category === "DT"
    ? [category]
    : [];
}
export function difficultyRate(configuration: DifficultyConfiguration) {
  return difficultyMods[configuration].includes("DT")
    ? 1.5
    : configuration === "HT"
      ? 0.75
      : 1;
}
/** Standard-settings osu! timing, following ppy/osu's ModHardRock/ModEasy,
 * OsuHitObject.PREEMPT_RANGE and OsuHitWindows (including stable rounding).
 * SR always comes from the official attributes response, never this transform. */
function effectiveParameters(
  base: DifficultyValues,
  configuration: DifficultyConfiguration,
  ruleset: BeatmapMetadata["mode"],
): DifficultyValues {
  const result: DifficultyValues = { ...base, stars: null };
  const rate = difficultyRate(configuration);
  result.bpm = base.bpm === null ? null : base.bpm * rate;
  result.duration = base.duration === null ? null : base.duration / rate;
  if (ruleset !== "osu")
    return { ...result, ar: null, od: null, cs: null, hp: null };
  const mods = difficultyMods[configuration];
  const hr = mods.includes("HR"),
    ez = mods.includes("EZ");
  const adjust = (value: number | null, cs = false) =>
    value === null
      ? null
      : hr
        ? Math.min(
            Math.fround(Math.fround(value) * Math.fround(cs ? 1.3 : 1.4)),
            10,
          )
        : ez
          ? Math.fround(Math.fround(value) * 0.5)
          : value;
  result.cs = adjust(base.cs, true);
  result.hp = adjust(base.hp);
  const ar = adjust(base.ar),
    od = adjust(base.od);
  // With no clock change, retain the setting itself, including fractional OD.
  result.ar = ar;
  result.od = od;
  if (rate !== 1) {
    if (ar !== null) {
      const preempt =
        Math.trunc(ar < 5 ? 1800 - 120 * ar : 1950 - 150 * ar) / rate;
      result.ar =
        preempt > 1200 ? (1800 - preempt) / 120 : (1950 - preempt) / 150;
    }
    if (od !== null)
      result.od = (79.5 - (Math.floor(80 - 6 * od) - 0.5) / rate) / 6;
  }
  return result;
}
export function effectiveDifficulty(
  base: DifficultyValues,
  attributes: BeatmapAttributes,
): DifficultyValues {
  return {
    ...effectiveParameters(base, attributes.configuration, attributes.ruleset),
    stars: attributes.stars,
  };
}
function matches(
  a: BeatmapAttributes | undefined,
  config: DifficultyConfiguration,
  ruleset: BeatmapMetadata["mode"],
) {
  return (
    a &&
    a.configuration === config &&
    a.ruleset === ruleset &&
    Number.isFinite(a.stars) &&
    a.stars >= 0 &&
    Number.isFinite(Date.parse(a.fetchedAt)) &&
    JSON.stringify(a.mods) === JSON.stringify(difficultyMods[config])
  );
}
export function displayDifficulty(
  input: {
    beatmapId?: number | null;
    category: string;
    base: DifficultyValues;
    ruleset?: BeatmapMetadata["mode"];
    attributes?: BeatmapAttributes;
    snapshot?: DifficultySnapshot;
    historical?: boolean;
    checksum?: string | null;
  },
  choice: DifficultyChoice,
): DifficultyDisplay {
  const saved = input.snapshot;
  const snapshot =
    saved &&
    saved.beatmapId === input.beatmapId &&
    (!input.ruleset || saved.ruleset === input.ruleset) &&
    (!input.checksum || saved.checksum === input.checksum) &&
    saved.variants &&
    typeof saved.variants === "object" &&
    saved.base &&
    typeof saved.base === "object" &&
    Number.isFinite(Date.parse(saved.fetchedAt))
      ? saved
      : undefined;
  const base = snapshot ? baseDifficulty(snapshot.base) : input.base;
  const ruleset = snapshot?.ruleset ?? input.ruleset;
  const common = { rate: 1, ruleset, fetchedAt: snapshot?.fetchedAt };
  const fallback = input.historical && !snapshot ? "recorded" : "base";
  if (!choice.adjusted || input.category === "NM")
    return {
      ...common,
      values: base,
      status: fallback,
      configuration: "NM",
    };
  const configuration =
    input.category === "FM"
      ? ["HD", "HR", "EZ"].includes(choice.fm)
        ? choice.fm
        : null
      : (previewConfigurations(
          input.category,
          input.attributes?.configuration,
        )[0] ?? null);
  if (!configuration)
    return {
      ...common,
      values: base,
      status: "variable",
      configuration: null,
      fallback,
    };
  const candidate = snapshot
    ? snapshot.variants[configuration]
    : input.attributes;
  const attributes = matches(candidate, configuration, ruleset)
    ? candidate
    : undefined;
  // Historical measurements can already include Mods. Keep them visibly
  // recorded until a verified base exists; never feed them into a conversion.
  if (input.historical && !snapshot)
    return {
      ...common,
      values: base,
      status: "missing",
      fallback: "recorded",
      configuration,
      rate: difficultyRate(configuration),
    };
  // Official SR and standard parameter conversions are independent: a missing
  // attributes response must not erase BPM, length or known difficulty settings.
  if (!attributes)
    return {
      ...common,
      values: effectiveParameters(base, configuration, ruleset),
      status: "missing",
      configuration,
      rate: difficultyRate(configuration),
    };
  return {
    attributes,
    values: effectiveDifficulty(base, attributes),
    status: "adjusted",
    configuration,
    rate: difficultyRate(configuration),
    ruleset,
    fetchedAt: attributes.fetchedAt,
  };
}
