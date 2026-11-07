import { db, getPool } from "@/db";
import {
  beatmapDifficultySnapshots,
  editionState,
  mappoolEntries,
  mappools,
} from "@/db/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { remoteMode } from "./data-source";
import { previewConfigurations } from "./difficulty-display";
import { difficultySnapshotSchema } from "./difficulty-snapshot";
import { HttpError } from "./http";
import type { DifficultyConfiguration } from "./mappool-model";
import { fetchBeatmap, prepareDifficultySnapshot } from "./osu-beatmaps";
import { inReadChannel } from "./read-channel";

const batchSize = 12;
const day = 24 * 60 * 60 * 1000;
const freshFor = 7 * day;

async function pendingDifficulties(
  database: Pick<ReturnType<typeof db>, "select" | "execute">,
) {
  const published = sql`${editionState.configuration}->>'published' = 'true'`;
  const entries = await database
    .select({
      beatmapId: mappoolEntries.beatmapId,
      category: mappoolEntries.category,
      metadata: mappoolEntries.metadata,
    })
    .from(mappoolEntries)
    .innerJoin(mappools, eq(mappools.id, mappoolEntries.poolId))
    .innerJoin(editionState, eq(editionState.slug, mappools.editionSlug))
    .where(and(published, isNotNull(mappools.publishedAt)))
    .orderBy(desc(mappools.publishedAt), mappoolEntries.id);
  // The saved archive is the authority even during relational backfill. Extract
  // only slot and BID in SQL instead of transferring or decoding whole archives.
  const archived = await database.execute<{
    beatmapId: unknown;
    slot: string | null;
  }>(sql`
    SELECT map.value->'beatmapId' AS "beatmapId", map.value->>'slot' AS slot
    FROM ${editionState}
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(${editionState.configuration} #> '{archive,pools}') = 'array'
        THEN ${editionState.configuration} #> '{archive,pools}' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS pool(value, position)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(pool.value->'maps') = 'array'
        THEN pool.value->'maps' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS map(value, position)
    WHERE ${published}
    ORDER BY ${editionState.configurationUpdatedAt} DESC, ${editionState.slug}, pool.position, map.position
  `);
  const targets = new Map<number, Set<DifficultyConfiguration>>();
  function add(beatmapId: unknown, configurations: DifficultyConfiguration[]) {
    if (
      typeof beatmapId !== "number" ||
      !Number.isSafeInteger(beatmapId) ||
      beatmapId <= 0
    )
      return;
    const requested =
      targets.get(beatmapId) ?? new Set<DifficultyConfiguration>();
    for (const configuration of configurations) requested.add(configuration);
    targets.set(beatmapId, requested);
  }
  for (const entry of entries)
    add(
      entry.beatmapId,
      previewConfigurations(
        entry.category,
        entry.metadata.attributes?.configuration,
      ),
    );
  for (const map of archived.rows)
    add(
      map.beatmapId,
      previewConfigurations(map.slot?.replace(/\d+$/, "") ?? ""),
    );
  if (!targets.size) return { pending: [], tracked: 0, deferred: 0 };
  const rows = await database
    .select()
    .from(beatmapDifficultySnapshots)
    .where(
      sql`${beatmapDifficultySnapshots.beatmapId} = ANY(${sql.param([...targets.keys()])}::bigint[])`,
    );
  const saved = new Map(rows.map((row) => [row.beatmapId, row]));
  const now = Date.now();
  let deferred = 0;
  const pending: {
    beatmapId: number;
    configurations: DifficultyConfiguration[];
  }[] = [];
  for (const [beatmapId, configurations] of targets) {
    const row = saved.get(beatmapId);
    const parsed = difficultySnapshotSchema.safeParse(row?.snapshot);
    if (
      parsed.success &&
      parsed.data.beatmapId === beatmapId &&
      Date.parse(parsed.data.fetchedAt) > now - freshFor &&
      [...configurations].every((mod) => parsed.data.variants[mod])
    )
      continue;
    if (row?.retryAt && row.retryAt.getTime() > now) deferred++;
    else pending.push({ beatmapId, configurations: [...configurations] });
  }
  return { pending, tracked: targets.size, deferred };
}

/** Independent worker entry point. Public reads never call this function. */
export async function refreshBeatmapDifficulties(apply = false) {
  if (remoteMode() || inReadChannel())
    throw new HttpError(
      403,
      "Difficulty synchronization requires an operator database.",
    );
  if (!apply) {
    const { pending, tracked, deferred } = await pendingDifficulties(db());
    return {
      status: "preview",
      pending: pending.length,
      tracked,
      deferred,
      saved: 0,
      failed: 0,
    };
  }
  // Use a dedicated connection so a process exit releases the session lock.
  // Each complete map commits independently, without a transaction spanning HTTP calls.
  const client = await getPool().connect();
  client.on("error", () => {
    console.error("Difficulty synchronization lost its database connection.");
  });
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(1329810514, 851) AS locked",
    );
    if (!lock.rows[0].locked) return { status: "busy", saved: 0, failed: 0 };
    const database = drizzle(client);
    const { pending, tracked, deferred } = await pendingDifficulties(database);
    let saved = 0;
    let failed = 0;
    for (const { beatmapId, configurations } of pending.slice(0, batchSize)) {
      let snapshot;
      try {
        snapshot = difficultySnapshotSchema.parse(
          await prepareDifficultySnapshot(
            await fetchBeatmap(beatmapId),
            configurations,
          ),
        );
      } catch (error) {
        const status = error instanceof HttpError ? error.status : undefined;
        if (status === 503) throw error;
        const retryAt = new Date(
          Date.now() + (status === 404 ? day : 15 * 60 * 1000),
        );
        await database
          .insert(beatmapDifficultySnapshots)
          .values({ beatmapId, retryAt })
          .onConflictDoUpdate({
            target: beatmapDifficultySnapshots.beatmapId,
            set: { retryAt },
          });
        failed++;
        if (status === 429) break;
        continue;
      }
      await database
        .insert(beatmapDifficultySnapshots)
        .values({ beatmapId, snapshot, retryAt: null })
        .onConflictDoUpdate({
          target: beatmapDifficultySnapshots.beatmapId,
          set: { snapshot, retryAt: null },
        });
      saved++;
    }
    return {
      status: pending.length ? "processed" : deferred ? "deferred" : "current",
      pending: pending.length - saved - failed,
      tracked,
      deferred: deferred + failed,
      saved,
      failed,
    };
  } finally {
    client.release(true);
  }
}
