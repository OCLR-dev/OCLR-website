import reviewed from "@/data/difficulty-previews.json" with { type: "json" };
import { readFileSync, statSync } from "node:fs";
import { difficultySnapshotSchema } from "./difficulty-snapshot";
import type { DifficultySnapshot } from "./mappool-model";
import type { HistoricalArchive } from "./historical-archive";
export { difficultySnapshotSchema } from "./difficulty-snapshot";

let cached:
  | { path: string; mtime: number; size: number; maps: Record<string, unknown> }
  | undefined;
function catalogMaps(): Record<string, unknown> {
  const path = process.env.OCLR_DIFFICULTY_CATALOG_FILE;
  if (!path) return reviewed.maps;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 20_000_000) return {};
    if (
      cached?.path === path &&
      cached.mtime === stat.mtimeMs &&
      cached.size === stat.size
    )
      return cached.maps;
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (
      data.version !== 1 ||
      !data.maps ||
      typeof data.maps !== "object" ||
      Array.isArray(data.maps) ||
      Object.keys(data.maps).length > 10_000
    )
      return {};
    cached = { path, mtime: stat.mtimeMs, size: stat.size, maps: data.maps };
    return data.maps;
  } catch {
    // A missing or invalid operator cache is absence, never a provider request.
    return {};
  }
}
/** Public numeric snapshots only. No DB, provider request or tournament write. */
export function catalogDifficulty(
  beatmapId: number | null | undefined,
  checksum?: string | null,
): DifficultySnapshot | undefined {
  if (!beatmapId) return;
  const parsed = difficultySnapshotSchema.safeParse(
    catalogMaps()[String(beatmapId)],
  );
  if (
    !parsed.success ||
    parsed.data.beatmapId !== beatmapId ||
    (checksum && parsed.data.checksum !== checksum)
  )
    return;
  return parsed.data;
}
export function archiveDifficultySnapshots(
  archive: HistoricalArchive,
  resolve: (
    map: HistoricalArchive["pools"][number]["maps"][number],
  ) => DifficultySnapshot | undefined = (map) =>
    catalogDifficulty(map.beatmapId),
): HistoricalArchive {
  return {
    ...archive,
    pools: archive.pools.map((pool) => ({
      ...pool,
      maps: pool.maps.map((map) => {
        const snapshot = resolve(map);
        return snapshot ? { ...map, difficultySnapshot: snapshot } : map;
      }),
    })),
  };
}
