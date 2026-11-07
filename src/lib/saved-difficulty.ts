import { db } from "@/db";
import { beatmapDifficultySnapshots } from "@/db/schema";
import { sql } from "drizzle-orm";
import { remoteMode } from "./data-source";
import {
  archiveDifficultySnapshots,
  catalogDifficulty,
} from "./difficulty-catalog";
import { previewConfigurations } from "./difficulty-display";
import { difficultySnapshotSchema } from "./difficulty-snapshot";
import type { HistoricalArchive } from "./historical-archive";
import type {
  BeatmapMetadata,
  DifficultyConfiguration,
  DifficultySnapshot,
} from "./mappool-model";

export async function loadSavedDifficulties(ids: readonly (number | null)[]) {
  const beatmapIds = [...new Set(ids.filter((id) => id !== null))];
  const snapshots = new Map<number, DifficultySnapshot>();
  if (!beatmapIds.length || remoteMode() || !process.env.DATABASE_URL)
    return snapshots;
  const rows = await db()
    .select({
      beatmapId: beatmapDifficultySnapshots.beatmapId,
      snapshot: beatmapDifficultySnapshots.snapshot,
    })
    .from(beatmapDifficultySnapshots)
    .where(
      sql`${beatmapDifficultySnapshots.beatmapId} = ANY(${sql.param(beatmapIds)}::bigint[])`,
    );
  for (const { beatmapId, snapshot } of rows) {
    const parsed = difficultySnapshotSchema.safeParse(snapshot);
    if (parsed.success && parsed.data.beatmapId === beatmapId)
      snapshots.set(beatmapId, parsed.data);
  }
  return snapshots;
}

/** Prefer the daemon snapshot, then choose a coherent saved compatibility result. */
export function selectSavedDifficulty(
  saved: ReadonlyMap<number, DifficultySnapshot>,
  beatmapId: number | null,
  configurations: readonly DifficultyConfiguration[],
  embedded?: DifficultySnapshot,
  checksum?: string | null,
  ruleset?: BeatmapMetadata["mode"],
) {
  if (beatmapId === null) return;
  const coverage = (s: DifficultySnapshot) =>
    configurations.filter((configuration) => s.variants[configuration]).length;
  const compatible = (
    s: DifficultySnapshot | undefined,
  ): s is DifficultySnapshot =>
    s !== undefined &&
    s.beatmapId === beatmapId &&
    (!checksum || s.checksum === checksum) &&
    (!ruleset || s.ruleset === ruleset);
  const current = saved.get(beatmapId);
  if (compatible(current)) return current;
  const validated = difficultySnapshotSchema.safeParse(embedded);
  return [validated.data, catalogDifficulty(beatmapId, checksum)]
    .filter(compatible)
    .sort(
      (a, b) =>
        coverage(b) - coverage(a) ||
        Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt),
    )[0];
}

export async function attachArchiveDifficulties(
  archive: HistoricalArchive,
): Promise<HistoricalArchive> {
  const saved = await loadSavedDifficulties(
    archive.pools.flatMap((pool) => pool.maps.map((map) => map.beatmapId)),
  );
  return archiveDifficultySnapshots(archive, (map) =>
    selectSavedDifficulty(
      saved,
      map.beatmapId,
      previewConfigurations(map.slot.replace(/\d+$/, "")),
      map.difficultySnapshot,
    ),
  );
}
