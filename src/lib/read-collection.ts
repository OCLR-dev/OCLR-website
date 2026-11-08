import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getPool, readOnlyData, db } from "@/db";
import { DeveloperApiError } from "./developer-api";
import { collectionQuery } from "./read-api-queries";
import type { ReadPayload } from "./read-api-contract";

type Collection<T> = { items: readonly T[]; version: string; bytes: number };
type CacheEntry = Collection<unknown> & {
  snapshot: string;
  from: number;
  until: number;
};

const maxAgeMs = 15_000;
const maxEntries = 12;
const maxBytes = 4 * 1024 * 1024;
const caches = new WeakMap<
  ReturnType<typeof getPool>,
  Map<string, CacheEntry>
>();

export function collectionFilters(query: URLSearchParams) {
  const parsed = collectionQuery.safeParse(Object.fromEntries(query));
  if (!parsed.success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose valid API collection filters and page limits.",
    );
  return parsed.data;
}

function prepare<T>(items: readonly T[]): Collection<T> {
  if (items.length > 10_000)
    throw new DeveloperApiError(
      413,
      "RESOURCE_TOO_LARGE",
      "Narrow the collection filters to at most 10,000 records.",
    );
  const serialized = JSON.stringify(items);
  return {
    items,
    version: createHash("sha256").update(serialized).digest("hex"),
    bytes: Buffer.byteLength(serialized),
  };
}

function page<T>(
  { items, version: collectionVersion }: Collection<T>,
  { page, pageSize, version }: ReturnType<typeof collectionFilters>,
): ReadPayload<T[]> {
  if (page > 1 && !version)
    throw new DeveloperApiError(
      400,
      "COLLECTION_VERSION_REQUIRED",
      "Use the first page collection version to request later pages.",
    );
  if (version && version !== collectionVersion)
    throw new DeveloperApiError(
      409,
      "COLLECTION_CHANGED",
      "The collection changed. Restart from the first page.",
    );
  const totalPages = Math.ceil(items.length / pageSize);
  return {
    data: items.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      pagination: {
        page,
        pageSize,
        total: items.length,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        collectionVersion,
      },
    },
  };
}

export function collectionPage<T>(
  items: readonly T[],
  params: URLSearchParams,
) {
  const filters = collectionFilters(params);
  return page(prepare(items), filters);
}

/**
 * Call after the HTTP layer authenticates and validates the request. The key
 * must identify the projection, its filters and any private subject.
 * Match the primary's MVCC snapshot inside the same read-only transaction
 * used for projection. Time limits only restrict reuse; they never authorize
 * serving rows across a database write or an application time boundary.
 */
export async function savedCollectionPage<T>(
  key: string,
  filters: ReturnType<typeof collectionFilters>,
  load: (asOf: number) => Promise<T[]>,
  validUntil: (items: readonly T[], asOf: number) => number,
): Promise<ReadPayload<unknown[]>> {
  return readOnlyData(async () => {
    const {
      rows: [state],
    } = await db().execute<{ snapshot: string | null }>(
      sql`SELECT CASE WHEN NOT pg_is_in_recovery() THEN
        pg_postmaster_start_time()::text || '/' || pg_current_snapshot()::text
      END AS snapshot`,
    );
    const asOf = Date.now();
    const snapshot = state?.snapshot;
    if (!snapshot || snapshot.length > 8192)
      return page(prepare(await load(asOf)), filters);

    const pool = getPool();
    let cache = caches.get(pool);
    if (!cache) caches.set(pool, (cache = new Map()));
    for (const [id, entry] of cache)
      if (asOf < entry.from || asOf >= entry.until) cache.delete(id);
    const previous = cache.get(key);
    if (previous?.snapshot === snapshot) {
      cache.delete(key);
      cache.set(key, previous);
      return page(previous, filters);
    }
    // Keep the previous entry until a replacement is ready. Concurrent
    // requests can each read their own snapshot without borrowing rows from
    // one another, including when an earlier request finishes last.
    const collection = prepare(await load(asOf));
    const until = Math.min(asOf + maxAgeMs, validUntil(collection.items, asOf));
    const finished = Date.now();
    if (collection.bytes <= maxBytes && asOf <= finished && finished < until) {
      cache.delete(key);
      let retained = collection.bytes;
      for (const entry of cache.values()) retained += entry.bytes;
      for (const [id, entry] of cache) {
        if (cache.size < maxEntries && retained <= maxBytes) break;
        cache.delete(id);
        retained -= entry.bytes;
      }
      cache.set(key, { ...collection, snapshot, from: asOf, until });
    }
    return page(collection, filters);
  });
}
