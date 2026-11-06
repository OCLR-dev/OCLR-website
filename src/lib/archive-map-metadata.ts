import snapshot from "@/data/archive-beatmaps.json";
import supplements from "@/data/archive-map-supplements.json";
import fileSupplements from "@/data/archive-file-supplements.json";
import downloads from "@/data/archive-map-downloads.json";
import backgrounds from "@/data/archive-background-supplements.json";
import type { HistoricalArchive } from "./historical-archive";
import type { DifficultySnapshot } from "./mappool-model";

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
type DisplayField = Field | "artist" | "difficulty";
type Snapshot = (typeof snapshot.maps)[keyof typeof snapshot.maps] & {
  artist?: string;
  difficulty?: string;
};
export type ArchiveDisplayMap = MapEntry & {
  difficultySnapshot?: DifficultySnapshot;
  artist?: string | null;
  difficulty?: string | null;
  supplemented?: DisplayField[];
  metadataSource?: string;
  metadataFetchedAt?: string;
  archivalSource?: string;
  archivalSupplemented?: Field[];
  preferOriginal?: boolean;
};
export type ArchiveDisplayPool = Omit<Pool, "maps"> & {
  maps: ArchiveDisplayMap[];
};

// Spreadsheet formula errors are missing values, not authored song metadata.
export function missingArchiveText(value: string | null) {
  return (
    value === null ||
    value.trim() === "" ||
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
  missingBeatmapIds: number[];
} {
  const setIds: Record<number, number> = {};
  const enabled = ["s1", "s2", "s3", "s4", "s5", "s6"].includes(editionSlug);
  const confirmed =
    editionSlug === "s5"
      ? supplements.s5
      : editionSlug === "s10"
        ? supplements.s10
        : [];
  const maps = pool.maps;
  return {
    setIds,
    missingBeatmapIds: enabled
      ? maps.flatMap((map) =>
          map.beatmapId && snapshot.unavailable.includes(map.beatmapId)
            ? [map.beatmapId]
            : [],
        )
      : [],
    pool: {
      ...pool,
      maps: maps.map((map): ArchiveDisplayMap => {
        const result: ArchiveDisplayMap = { ...map };
        const background = backgrounds.find(
          (entry) =>
            entry.editionSlug === editionSlug &&
            entry.poolId === pool.id &&
            entry.slot === map.slot &&
            entry.beatmapId === map.beatmapId,
        );
        if (background) result.backgroundSetId ??= background.backgroundSetId;
        const download = downloads.find(
          (entry) =>
            entry.editionSlug === editionSlug &&
            entry.poolId === pool.id &&
            entry.slot === map.slot &&
            entry.beatmapId === map.beatmapId,
        );
        if (download) result.downloadMirror ??= download.downloadMirror;
        const recovered =
          editionSlug === "s6"
            ? fileSupplements.s6.find(
                (entry) =>
                  entry.poolId === pool.id &&
                  entry.slot === map.slot &&
                  entry.beatmapId === map.beatmapId,
              )
            : undefined;
        if (recovered) {
          result.beatmapSetId ??= recovered.beatmapSetId;
          result.coverPath ??= recovered.coverPath;
          result.archivalSource = recovered.source;
        }
        if (result.beatmapId && result.beatmapSetId)
          setIds[result.beatmapId] = result.beatmapSetId;
        // Existing saved/remote archives predate the import-package supplement.
        // Apply only the confirmed edition/pool/slot/BID, without mutating it.
        const correction = confirmed.find(
          (entry) =>
            entry.poolId === pool.id &&
            entry.slot === map.slot &&
            entry.beatmapId === map.beatmapId,
        );
        if (correction) {
          result.originalId ??= correction.originalId;
          result.preferOriginal = result.originalId === correction.originalId;
          result.archivalSource = correction.source;
        }
        const archivedAttributes: Partial<Pick<MapEntry, Field>> = {
          ...correction?.attributes,
          ...recovered?.attributes,
        };
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
          const archivedValue = archivedAttributes[field];
          if (archivedValue !== undefined) {
            Object.assign(result, { [field]: archivedValue });
            (result.archivalSupplemented ??= []).push(field);
            continue;
          }
          if (!metadata) continue;
          // Field/value pairs have the same schema in the archive and snapshot.
          Object.assign(result, { [field]: metadata[field] });
          (result.supplemented ??= []).push(field);
        }
        if (metadata) {
          // Early archives often store a plain song title. Preserve it while
          // exposing artist/difficulty separately in every view and search.
          const authored = parseArchiveTitle(result.title);
          const official = parseArchiveTitle(metadata.title);
          for (const field of ["artist", "difficulty"] as const) {
            if (result[field] || authored?.[field]) continue;
            const value = metadata[field] ?? official?.[field];
            if (value) {
              result[field] = value;
              (result.supplemented ??= []).push(field);
            }
          }
          setIds[metadata.beatmapId] = metadata.setId;
          result.metadataSource = metadata.source;
          result.metadataFetchedAt = metadata.fetchedAt;
        }
        const originalMetadata =
          (enabled || correction) && result.originalId
            ? (snapshot.maps as Record<string, Snapshot>)[result.originalId]
            : undefined;
        if (originalMetadata)
          setIds[originalMetadata.beatmapId] = originalMetadata.setId;
        return result;
      }),
    },
  };
}
