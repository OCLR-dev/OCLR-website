import snapshot from "@/data/archive-beatmaps.json";
import type { HistoricalArchive } from "./historical-archive";

type Pool = HistoricalArchive["pools"][number];
type MapEntry = Pool["maps"][number];
const fields = [
  "title",
  "mapper",
  "stars",
  "bpm",
  "drainSeconds",
  "cs",
  "ar",
  "od",
] as const;
type Field = (typeof fields)[number];
type Snapshot = (typeof snapshot.maps)[keyof typeof snapshot.maps];
export type ArchiveDisplayMap = MapEntry & {
  supplemented?: Field[];
  metadataSource?: string;
  metadataFetchedAt?: string;
};
export type ArchiveDisplayPool = Omit<Pool, "maps"> & {
  maps: ArchiveDisplayMap[];
};

// Spreadsheet formula errors are missing values, not authored song metadata.
export function missingArchiveText(value: string | null) {
  return (
    value === null ||
    /^(?:#N\/A|N\/A|#REF!|#VALUE!|#ERROR!|#NAME\?|#DIV\/0!)$/i.test(
      value.trim(),
    )
  );
}

/** Read a trailing `(...)` or `[...]` group, matching nested pairs so that a
 * difficulty such as `[oatm [AR9.4 Edit]]` is taken as a whole. */
function trailingGroup(value: string, open: string, close: string) {
  if (!value.endsWith(close)) return null;
  let depth = 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === close) depth += 1;
    else if (char === open) {
      depth -= 1;
      if (depth === 0)
        return {
          inner: value.slice(index + 1, -1).trim(),
          rest: value.slice(0, index).trim(),
        };
    }
  }
  return null;
}

/** Historical imports record one composite title per map:
 * `artist - song title [difficulty] (mapper)`. Difficulty names may contain
 * their own brackets and song names their own parentheses, so the groups are
 * read from the end instead of with a single flat pattern. Anything that still
 * does not match is left untouched for the caller to display verbatim. */
export function parseArchiveTitle(title: string | null) {
  if (!title) return null;
  let rest = title.trim();
  if (!rest) return null;
  let mapper: string | null = null;
  let difficulty: string | null = null;
  // The mapper only belongs to the record when it follows the difficulty.
  const credits = trailingGroup(rest, "(", ")");
  if (credits && credits.rest.endsWith("]")) {
    mapper = credits.inner || null;
    rest = credits.rest;
  }
  const bracket = trailingGroup(rest, "[", "]");
  if (bracket) {
    difficulty = bracket.inner || null;
    rest = bracket.rest;
  }
  const split = /^(.*?)\s+-\s+(.+)$/.exec(rest);
  if (split)
    return {
      artist: split[1].trim() || null,
      title: split[2].trim(),
      difficulty,
      mapper,
    };
  if (!difficulty && !mapper) return null;
  return { artist: null, title: rest, difficulty, mapper };
}

/** Read-only display enrichment. Never changes imported historical records or
 * treats current base attributes as historical/mod-adjusted measurements. */
export function archivePoolMetadata(
  pool: Pool,
  editionSlug: string,
): {
  pool: ArchiveDisplayPool;
  setIds: Record<number, number>;
} {
  const setIds: Record<number, number> = {};
  const enabled = ["s4", "s5", "s6"].includes(editionSlug);
  return {
    setIds,
    pool: {
      ...pool,
      maps: pool.maps.map((map): ArchiveDisplayMap => {
        const result: ArchiveDisplayMap = { ...map };
        const metadata =
          enabled && map.beatmapId
            ? (snapshot.maps as Record<string, Snapshot>)[map.beatmapId]
            : undefined;
        for (const field of fields) {
          const missing =
            field === "title" || field === "mapper"
              ? missingArchiveText(map[field])
              : map[field] === null;
          if (!missing) continue;
          if (field === "title" || field === "mapper") result[field] = null;
          if (!metadata) continue;
          // Field/value pairs have the same schema in the archive and snapshot.
          Object.assign(result, { [field]: metadata[field] });
          (result.supplemented ??= []).push(field);
        }
        if (metadata) {
          setIds[metadata.beatmapId] = metadata.setId;
          result.metadataSource = metadata.source;
          result.metadataFetchedAt = metadata.fetchedAt;
        }
        return result;
      }),
    },
  };
}
