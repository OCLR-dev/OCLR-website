import { db } from "@/db";
import {
  editionState,
  mappoolBeatmapCache,
  mappoolEntries,
  mappoolEvents,
  mappools,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability, assertUserWriteChannel } from "./auth/staff";
import { inspectBeatmapPackage } from "./beatmap-cache-archive";
import type {
  BeatmapCacheCommand,
  BeatmapCacheStatus,
} from "./beatmap-cache-contract";
import {
  cacheMirrorOptions,
  downloadBeatmapMirror,
} from "./beatmap-cache-mirror";
import {
  readCachedBeatmapPackage,
  removeCachedBeatmapPackage,
  storeBeatmapPackage,
} from "./beatmap-cache-storage";
import { HttpError } from "./http-error";

type Reader = Pick<ReturnType<typeof db>, "select">;
const entryIdSchema = z.uuid();

async function cacheTarget(
  actor: User,
  slug: string,
  entryId: string,
  reader?: Reader,
) {
  assertUserWriteChannel();
  await assertCapability(actor, "manage_mappools", slug, reader);
  if (!entryIdSchema.safeParse(entryId).success)
    throw new HttpError(404, "Replay target not found.");
  const [row] = await (reader ?? db())
    .select({
      pool: mappools,
      entry: mappoolEntries,
      cached: mappoolBeatmapCache,
    })
    .from(mappoolEntries)
    .innerJoin(mappools, eq(mappools.id, mappoolEntries.poolId))
    .leftJoin(mappoolBeatmapCache, eq(mappoolBeatmapCache.entryId, entryId))
    .where(and(eq(mappoolEntries.id, entryId), eq(mappools.editionSlug, slug)));
  if (!row) throw new HttpError(404, "Replay target not found.");
  return row;
}

type CacheTarget = Awaited<ReturnType<typeof cacheTarget>>;

function mirrorChoices(entry: CacheTarget["entry"]) {
  return cacheMirrorOptions(entry.metadata.setId, entry.downloadMirror);
}

function cacheStatus({ entry, pool, cached }: CacheTarget): BeatmapCacheStatus {
  return {
    version: pool.version,
    mirrors: mirrorChoices(entry).map(({ id, name }) => ({ id, name })),
    package: cached
      ? {
          source: cached.source,
          size: cached.size,
          cachedAt: cached.cachedAt.toISOString(),
        }
      : null,
  };
}

export async function mappoolBeatmapCacheStatus(
  actor: User,
  slug: string,
  entryId: string,
) {
  return cacheStatus(await cacheTarget(actor, slug, entryId));
}

function checkPoolVersion(expected: number, actual: number) {
  if (expected !== actual)
    throw new HttpError(409, "This pool changed. Refresh before confirming.");
}

let processing = 0;

export async function changeMappoolBeatmapCache(
  actor: User,
  slug: string,
  entryId: string,
  readCommand: () => Promise<BeatmapCacheCommand>,
  signal: AbortSignal,
) {
  const before = await cacheTarget(actor, slug, entryId);
  await assertOperationalEdition(slug, db());
  if (processing >= 2)
    throw new HttpError(
      429,
      "Beatmap package processing is busy. Retry shortly.",
    );
  processing++;
  try {
    const command = await readCommand();
    checkPoolVersion(command.expectedVersion, before.pool.version);
    let bytes: Buffer | undefined;
    let record: typeof mappoolBeatmapCache.$inferInsert | undefined;
    if (command.action !== "remove") {
      if (command.action === "sync") {
        const mirrors = mirrorChoices(before.entry);
        const mirror = mirrors.find(
          ({ id }) => id === command.mirror,
        );
        if (!mirror)
          throw new HttpError(
            409,
            "This direct beatmap mirror is no longer available.",
          );
        bytes = await downloadBeatmapMirror(
          mirror.url,
          signal,
          mirrors
            .filter(({ id }) => id !== mirror.id && id !== "saved")
            .map(({ url }) => url),
        );
      } else {
        if (!/\.osz$/i.test(command.file.name))
          throw new HttpError(422, "Choose an .osz beatmap package.");
        bytes = Buffer.from(await command.file.arrayBuffer());
      }
      const beatmapMd5 = await inspectBeatmapPackage(
        bytes,
        before.entry.beatmapId,
        before.entry.metadata.checksum,
        signal,
      );
      record = {
        entryId,
        fileKey: randomUUID(),
        beatmapMd5,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
        source: command.action === "sync" ? "mirror" : "upload",
        cachedAt: new Date(),
      };
    }
    if (signal.aborted)
      throw new HttpError(
        504,
        "The beatmap package operation was interrupted.",
      );

    const { status, obsolete } = await db().transaction(async (tx) => {
      await tx
        .select({ slug: editionState.slug })
        .from(editionState)
        .where(eq(editionState.slug, slug))
        .for("update");
      await assertOperationalEdition(slug, tx);
      const current = await cacheTarget(actor, slug, entryId, tx);
      if (command.action === "remove" && !current.cached)
        return { status: cacheStatus(current), obsolete: undefined };
      checkPoolVersion(command.expectedVersion, current.pool.version);
      if (signal.aborted)
        throw new HttpError(
          504,
          "The beatmap package operation was interrupted.",
        );
      let cached = null;
      if (record && bytes) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(122400)`);
        if (signal.aborted)
          throw new HttpError(
            504,
            "The beatmap package operation was interrupted.",
          );
        await storeBeatmapPackage(record.fileKey, bytes);
        [cached] = await tx
          .insert(mappoolBeatmapCache)
          .values(record)
          .onConflictDoUpdate({
            target: mappoolBeatmapCache.entryId,
            set: record,
          })
          .returning();
      } else {
        await tx
          .delete(mappoolBeatmapCache)
          .where(eq(mappoolBeatmapCache.entryId, entryId));
      }
      const [pool] = await tx
        .update(mappools)
        .set({ version: current.pool.version + 1 })
        .where(eq(mappools.id, current.pool.id))
        .returning();
      await tx.insert(mappoolEvents).values({
        editionSlug: slug,
        poolId: pool.id,
        actorId: actor.osuId,
        action: `beatmap_cache_${command.action}`,
        before: {
          entryId,
          beatmapId: current.entry.beatmapId,
          cache: current.cached,
        },
        after: { entryId, beatmapId: current.entry.beatmapId, cache: cached },
      });
      return {
        status: cacheStatus({ pool, entry: current.entry, cached }),
        obsolete: current.cached?.fileKey,
      };
    });
    // Free prior bytes only after commit. If the commit or unlink fails,
    // offline cleanup reclaims unreferenced UUIDs without touching a live key.
    if (obsolete) await removeCachedBeatmapPackage(obsolete).catch(() => {});
    return status;
  } finally {
    processing--;
  }
}

/** The caller has already checked the edition, entry and replay membership. */
export async function cachedBeatmapForReplay(
  entryId: string,
  replayMd5: string,
) {
  const [cached] = await db()
    .select()
    .from(mappoolBeatmapCache)
    .where(eq(mappoolBeatmapCache.entryId, entryId));
  if (!cached) return null;
  if (cached.beatmapMd5 !== replayMd5)
    throw new HttpError(
      409,
      "The beatmap package has no difficulty matching this replay.",
    );
  return readCachedBeatmapPackage(cached.fileKey, cached.size, cached.sha256);
}
