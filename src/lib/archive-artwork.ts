import { HttpError } from "./http";
import { fetchBeatmaps } from "./osu-beatmaps";

// Artwork is current official metadata, separate from immutable archival statistics.
// Cache successes for a day and failures briefly; concurrent requests share work.
const cache = new Map<
  number,
  { setId: number | null; missing: boolean; until: number }
>();
const pending = new Map<number, Promise<number | null>>();
export async function archiveArtworkLookup(ids: (number | null)[]) {
  const unique = [...new Set(ids.filter((id): id is number => id !== null))];
  const missing = unique.filter(
    (id) => !pending.has(id) && (cache.get(id)?.until ?? 0) <= Date.now(),
  );
  for (let offset = 0; offset < missing.length; offset += 50) {
    const batch = missing.slice(offset, offset + 50);
    const request = fetchBeatmaps(batch).catch(() => new Map());
    for (const id of batch) {
      const lookup = request
        .then((rows) => {
          const row = rows.get(id);
          const setId = row && "metadata" in row ? row.metadata.setId : null;
          cache.delete(id);
          if (cache.size >= 1024) cache.delete(cache.keys().next().value!);
          cache.set(id, {
            setId,
            missing: row instanceof HttpError && row.status === 404,
            until: Date.now() + (setId ? 86400000 : 60000),
          });
          return setId;
        })
        .finally(() => pending.delete(id));
      pending.set(id, lookup);
    }
    await request;
  }
  const setIds = Object.fromEntries(
    await Promise.all(
      unique.map(async (id) => [
        id,
        (await pending.get(id)) ?? cache.get(id)?.setId ?? null,
      ]),
    ),
  );
  return {
    setIds,
    missingBeatmapIds: unique.filter((id) => cache.get(id)?.missing === true),
  };
}

export async function archiveArtworkSetIds(ids: (number | null)[]) {
  return (await archiveArtworkLookup(ids)).setIds;
}
