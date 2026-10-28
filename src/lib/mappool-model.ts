export const categories = ["NM", "HD", "DT", "HR", "FM", "TB"] as const;
export type MappoolCategory = (typeof categories)[number];
// osu! mod names are fixed game terminology in every interface locale.
export const categoryNames = {
  NM: "No Mod",
  HD: "Hidden",
  DT: "Double Time",
  HR: "Hard Rock",
  FM: "FM",
  TB: "Tie Breaker",
} as const;
// Ruleset labels are interface text, not authored tournament content.
export const beatmapModeNames = {
  osu: "osu!standard",
  taiko: "osu!taiko",
  fruits: "osu!catch",
  mania: "osu!mania",
} as const;
export const fmModeNames = {
  free_mod: "Free Mod",
  force_mod: "Force Mod",
} as const;
export function fmPolicyName(mode: string | null | undefined) {
  return mode === "free_mod"
    ? fmModeNames.free_mod
    : mode === "force_mod"
      ? fmModeNames.force_mod
      : null;
}
export function slotLabel(category: string, position: number) {
  return category === "TB" && position === 1 ? "TB" : `${category}${position}`;
}
export function formatBeatmapNumber(
  value: number | null | undefined,
  digits?: number,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  return digits === undefined
    ? String(Number(value.toFixed(2)))
    : value.toFixed(digits);
}
export function formatBeatmapDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// Shared browser/server parsing: only fixed official difficulty URLs, never arbitrary fetch targets.
export function parseBeatmapId(input: string): number | null {
  const value = input.trim();
  if (value.length > 250) return null;
  const match = /^[1-9]\d*$/.test(value)
    ? [value, value]
    : (/^https:\/\/osu\.ppy\.sh\/(?:beatmaps|b)\/([1-9]\d*)\/?$/.exec(value) ??
      /^https:\/\/osu\.ppy\.sh\/beatmapsets\/[1-9]\d*\/?#(?:osu|taiko|fruits|mania)\/([1-9]\d*)$/.exec(
        value,
      ));
  const id = Number(match?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export type BeatmapMetadata = {
  setId: number;
  title: string;
  artist: string;
  difficulty: string;
  mapper: string;
  stars: number;
  bpm: number;
  duration: number;
  checksum?: string | null;
  mode?: "osu" | "taiko" | "fruits" | "mania";
  ar?: number | null;
  od?: number | null;
  cs?: number | null;
  hp?: number | null;
  attributes?: BeatmapAttributes;
};
export type BeatmapSnapshot = {
  beatmapId: number;
  metadata: BeatmapMetadata;
  fetchedAt: string;
  fingerprint: string;
};

export type BulkRow = {
  line: number;
  category: (typeof categories)[number] | null;
  position: number | null;
  beatmapId: number | null;
  error: string | null;
  warning: string | null;
};
type SavedSlot = {
  category: MappoolCategory;
  position: number;
  beatmapId: number;
};
/** Resolve slots before any provider requests. Plain rows append, skipping reserved explicit slots. */
export function parseMappoolRows(
  text: string,
  category?: MappoolCategory,
  existing: SavedSlot[] = [],
): BulkRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((value, index) => ({ value: value.trim(), line: index + 1 }))
    .filter((row) => row.value);
  if (!lines.length || lines.length > 50 || text.length > 16000)
    throw new Error("Enter between 1 and 50 map rows.");
  const parsed = lines.map(({ value, line }): BulkRow => {
    const explicit = /\s/.test(value);
    const match = /^(NM|HD|DT|HR|FM|TB)([1-9]\d{0,2})?\s+(\S+)$/.exec(value);
    const mod = explicit
      ? ((match?.[1] as MappoolCategory) ?? null)
      : (category ?? null);
    const position =
      explicit && match ? Number(match[2] ?? (mod === "TB" ? 1 : NaN)) : null;
    const beatmapId = parseBeatmapId(explicit ? (match?.[3] ?? "") : value);
    const error =
      explicit && (!mod || !position)
        ? "Invalid slot. Use NM1–NM999 (or TB), followed by one BID or difficulty URL."
        : !mod
          ? "Choose a destination category for plain BIDs or URLs."
          : !beatmapId
            ? "Invalid beatmap ID or official difficulty URL. Include the difficulty in beatmapset URLs."
            : null;
    return { line, category: mod, position, beatmapId, error, warning: null };
  });
  const reserved = new Set(
    parsed
      .filter((r) => r.category && r.position)
      .map((r) => `${r.category}:${r.position}`),
  );
  let next =
    Math.max(
      0,
      ...existing.filter((e) => e.category === category).map((e) => e.position),
    ) + 1;
  const slots = new Set<string>(),
    entries = new Set<string>(),
    maps = new Set<number>();
  return parsed.map((row) => {
    const { line, category, beatmapId } = row;
    let { position, error } = row;
    if (category && position === null) {
      while (reserved.has(`${category}:${next}`)) next++;
      position = next++;
      if (position > 999)
        error =
          "No append slots remain within 1–999. Reorder this category or choose another.";
    }
    const slot = `${category}:${position}`,
      entry = `${category}:${beatmapId}`;
    if (!error && slots.has(slot)) error = "Duplicate slot in this batch.";
    if (!error && entries.has(entry))
      error = "Duplicate beatmap in the same category.";
    if (
      !error &&
      existing.some((e) => e.category === category && e.position === position)
    )
      error = "Slot already exists; edit it separately.";
    if (
      !error &&
      existing.some((e) => e.category === category && e.beatmapId === beatmapId)
    )
      error = "Beatmap already exists in this category.";
    const warning =
      beatmapId && maps.has(beatmapId)
        ? "Beatmap reused; verify the intended mod categories."
        : null;
    slots.add(slot);
    entries.add(entry);
    if (beatmapId) maps.add(beatmapId);
    return { line, category, position, beatmapId, error, warning };
  });
}

/** Insert into the final category order, retaining stable records and normalizing its slots. */
export function moveMappoolEntries<T extends SavedSlot & { id: string }>(
  entries: T[],
  entryIds: string[],
  category: MappoolCategory,
  position: number,
) {
  const selected = entryIds.map((id) => entries.find((e) => e.id === id));
  if (
    !entryIds.length ||
    new Set(entryIds).size !== entryIds.length ||
    selected.some((e) => !e)
  )
    throw new Error("Select each saved map exactly once.");
  const remaining = entries
    .filter((e) => e.category === category && !entryIds.includes(e.id))
    .sort((a, b) => a.position - b.position);
  if (
    !Number.isInteger(position) ||
    position < 1 ||
    position > remaining.length + 1
  )
    throw new Error(
      `Choose an insertion position from 1 to ${remaining.length + 1}.`,
    );
  const result = [...remaining];
  result.splice(position - 1, 0, ...(selected as T[]));
  if (result.length > 999)
    throw new Error("A category cannot exceed 999 slots.");
  if (new Set(result.map((e) => e.beatmapId)).size !== result.length)
    throw new Error(
      "A selected beatmap already exists in the destination category.",
    );
  return result.map((e, i) => ({ ...e, category, position: i + 1 }));
}

// Explicit standard mod combinations. FM/TB never select one automatically.
export const difficultyConfigurations = [
  "NM",
  "HD",
  "HR",
  "DT",
  "HDHR",
  "HDDT",
  "HRDT",
  "HDHRDT",
  "EZ",
  "HT",
] as const;
export type DifficultyConfiguration = (typeof difficultyConfigurations)[number];
export const difficultyMods: Record<DifficultyConfiguration, string[]> = {
  NM: [],
  HD: ["HD"],
  HR: ["HR"],
  DT: ["DT"],
  HDHR: ["HD", "HR"],
  HDDT: ["HD", "DT"],
  HRDT: ["HR", "DT"],
  HDHRDT: ["HD", "HR", "DT"],
  EZ: ["EZ"],
  HT: ["HT"],
};
export type BeatmapAttributes = {
  configuration: DifficultyConfiguration;
  mods: string[];
  ruleset: NonNullable<BeatmapMetadata["mode"]>;
  stars: number;
  maxCombo: number | null;
  values: Record<string, number>;
  fetchedAt: string;
};
