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
