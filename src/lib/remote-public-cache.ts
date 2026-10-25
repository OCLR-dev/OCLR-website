/** Explicit development snapshots, never the framework's shared fetch/auth cache. */
export const publicCacheLifetime = 5 * 60_000;
const maxEntries = 128;
const maxBytes = 4 * 1024 * 1024;
const operations = new Set([
  "getPublicSite",
  "listPublicTournaments",
  "getPublicTournament",
  "listPublicPlayers",
  "getPublicPlayer",
  "publicEnrollment",
  "publicStaff",
  "publicNewsModel",
  "publicContributors",
  "publicArchiveStatistics",
  "publicPlayerParticipation",
]);
export function cachePublicOperation(operation: {
  id: string;
  public: boolean;
  binary?: boolean;
}) {
  return operation.public && !operation.binary && operations.has(operation.id);
}
export class RemotePublicCache {
  private entries = new Map<
    string,
    { json: string; bytes: number; until: number }
  >();
  private pending = new Map<string, Promise<unknown>>();
  private bytes = 0;
  private generation = 0;
  clear() {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
    this.bytes = 0;
  }
  async read<T>(key: string, load: () => Promise<T>): Promise<T> {
    for (const [id, entry] of this.entries) {
      if (entry.until <= Date.now()) {
        this.entries.delete(id);
        this.bytes -= entry.bytes;
      }
    }
    const hit = this.entries.get(key);
    if (hit) return JSON.parse(hit.json) as T;
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing) as T;
    const generation = this.generation;
    // Bound both retained responses and concurrent bookkeeping.
    if (this.pending.size >= maxEntries) return load();
    const work = Promise.resolve().then(load);
    this.pending.set(key, work);
    try {
      const value = await work;
      const json = JSON.stringify(value);
      const bytes = Buffer.byteLength(json);
      if (generation === this.generation && bytes <= maxBytes) {
        while (
          this.entries.size >= maxEntries ||
          this.bytes + bytes > maxBytes
        ) {
          const oldest = this.entries.keys().next().value!;
          this.bytes -= this.entries.get(oldest)!.bytes;
          this.entries.delete(oldest);
        }
        this.entries.set(key, {
          json,
          bytes,
          until: Date.now() + publicCacheLifetime,
        });
        this.bytes += bytes;
      }
      return structuredClone(value);
    } finally {
      if (this.pending.get(key) === work) this.pending.delete(key);
    }
  }
}
