import { db } from "@/db";
import {
  editionState,
  mappoolEntries,
  mappoolEvents,
  mappoolReplays,
  mappools,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability, assertReadCapability } from "./auth/staff";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
import {
  REPLAY_ENTRY_LIMIT,
  REPLAY_MAX_BYTES,
  type ReplaySummary,
} from "./replay-model";
import { parseReplay } from "./replay-parser";
import { readReplay, removeReplayFile, storeReplay } from "./replay-storage";
type Reader = Pick<ReturnType<typeof db>, "select">;
function validId(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Replay target not found.");
}
async function target(
  actor: User,
  slug: string,
  entryId: string,
  reader: Reader = db(),
) {
  await assertReadCapability(actor, "view_replays", slug, reader);
  validId(entryId);
  const [row] = await reader
    .select({ pool: mappools, entry: mappoolEntries })
    .from(mappoolEntries)
    .innerJoin(mappools, eq(mappools.id, mappoolEntries.poolId))
    .where(and(eq(mappoolEntries.id, entryId), eq(mappools.editionSlug, slug)));
  if (!row) throw new HttpError(404, "Replay target not found.");
  return row;
}
function validateMatch(
  summary: ReplaySummary,
  metadata: typeof mappoolEntries.$inferSelect.metadata,
) {
  if (
    (metadata.checksum &&
      metadata.checksum.toLowerCase() !== summary.beatmapMd5) ||
    (metadata.mode && metadata.mode !== summary.mode)
  )
    throw new HttpError(
      409,
      "Replay does not match this beatmap checksum or ruleset. Choose the correct map.",
    );
}
function windowOpen(pool: typeof mappools.$inferSelect) {
  if (
    !pool.selectionLockedAt ||
    !pool.showcaseAt ||
    Date.now() >= pool.showcaseAt.getTime()
  )
    throw new HttpError(
      409,
      "Replay changes are allowed only after map selection is locked and before the Showcase deadline.",
    );
}
const command = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  })
  .strict();
async function databaseReplayList(actor: User, slug: string, entryId: string) {
  const { entry } = await target(actor, slug, entryId);
  const rows = await db()
    .select()
    .from(mappoolReplays)
    .where(eq(mappoolReplays.entryId, entryId))
    .orderBy(mappoolReplays.createdAt, mappoolReplays.id);
  return rows.map((row) => ({
    ...row,
    verification:
      entry.metadata.checksum &&
      entry.metadata.checksum.toLowerCase() === row.summary.beatmapMd5
        ? ("matched" as const)
        : ("unverified" as const),
  }));
}
export async function replayList(
  actor: User,
  slug: string,
  entryId: string,
): Promise<Awaited<ReturnType<typeof databaseReplayList>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseReplayList>>>(
      "replayList",
      { slug, entryId },
    );
  }
  return databaseReplayList(actor, slug, entryId);
}

export type ReplayItem = Awaited<ReturnType<typeof replayList>>[number];
export async function authorizeReplayUpload(
  actor: User,
  slug: string,
  entryId: string,
) {
  await assertCapability(actor, "manage_replays", slug);
  const { pool } = await target(actor, slug, entryId);
  windowOpen(pool);
}
export async function uploadMappoolReplay(
  actor: User,
  slug: string,
  entryId: string,
  input: unknown,
  filename: string,
  description: string,
  bytes: Buffer,
) {
  await authorizeReplayUpload(actor, slug, entryId);
  const parsed = command.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Confirm the current pool version before changing replays.",
    );
  if (
    !filename ||
    filename.length > 180 ||
    !/\.osr$/i.test(filename) ||
    /[\\/\p{Cc}\p{Cf}]/u.test(filename) ||
    description.length > 500 ||
    /[\p{Cc}\p{Cf}]/u.test(description)
  )
    throw new HttpError(
      400,
      "Choose an .osr filename up to 180 characters and a description up to 500 characters.",
    );
  if (bytes.length > REPLAY_MAX_BYTES)
    throw new HttpError(413, "Choose a stable .osr replay up to 8 MiB.");
  const summary = await parseReplay(bytes),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = randomUUID();
  let wrote = false;
  try {
    return await db().transaction(async (tx) => {
      // Same order as mappoolCommand. Capacity is global across editions/processes.
      await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug))
        .for("update");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(18501)`);
      await assertCapability(actor, "manage_replays", slug, tx);
      await assertOperationalEdition(slug, tx);
      const { pool, entry } = await target(actor, slug, entryId, tx);
      windowOpen(pool);
      validateMatch(summary, entry.metadata);
      const existing = await tx
        .select()
        .from(mappoolReplays)
        .where(eq(mappoolReplays.entryId, entryId));
      const duplicate = existing.find((r) => r.sha256 === sha256);
      if (duplicate) {
        await readReplay(duplicate.id, duplicate.size, duplicate.sha256);
        return { duplicate: true, id: duplicate.id, version: pool.version };
      }
      if (pool.version !== parsed.data.expectedVersion)
        throw new HttpError(
          409,
          "This pool changed. Refresh before confirming.",
        );
      if (existing.length >= REPLAY_ENTRY_LIMIT)
        throw new HttpError(
          409,
          "This map already has 10 replays. Remove one before uploading.",
        );
      await storeReplay(key, bytes);
      wrote = true;
      // Check the real clock after validation and file IO as well as before it.
      windowOpen(pool);
      const [row] = await tx
        .insert(mappoolReplays)
        .values({
          id: key,
          entryId,
          filename,
          description,
          sha256,
          size: bytes.length,
          summary,
          uploaderId: actor.osuId,
          uploaderName: actor.username,
        })
        .returning();
      await tx
        .update(mappools)
        .set({ version: pool.version + 1, updatedAt: new Date() })
        .where(eq(mappools.id, pool.id));
      await tx.insert(mappoolEvents).values({
        editionSlug: slug,
        poolId: pool.id,
        actorId: actor.osuId,
        action: "replay_upload",
        before: null,
        after: {
          replay: row,
          beatmapId: entry.beatmapId,
          category: entry.category,
          position: entry.position,
        },
      });
      return { duplicate: false, id: row.id, version: pool.version + 1 };
    });
  } catch (error) {
    if (wrote) {
      // A lost COMMIT acknowledgement is ambiguous: never delete a possibly referenced file.
      try {
        const live = await db()
          .select({ id: mappoolReplays.id })
          .from(mappoolReplays)
          .where(eq(mappoolReplays.id, key));
        if (!live.length) await removeReplayFile(key);
      } catch {
        /* Retain for offline cleanup when the database is unavailable. */
      }
    }
    throw error;
  }
}
export async function downloadMappoolReplay(
  actor: User,
  slug: string,
  entryId: string,
  replayId: string,
) {
  await target(actor, slug, entryId);
  validId(replayId);
  const [row] = await db()
    .select()
    .from(mappoolReplays)
    .where(
      and(eq(mappoolReplays.id, replayId), eq(mappoolReplays.entryId, entryId)),
    );
  if (!row) throw new HttpError(404, "Replay not found.");
  const bytes = await readReplay(row.id, row.size, row.sha256);
  await assertReadCapability(actor, "view_replays", slug);
  return { filename: row.filename, bytes };
}
export async function deleteMappoolReplay(
  actor: User,
  slug: string,
  entryId: string,
  replayId: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_replays", slug);
  validId(entryId);
  validId(replayId);
  const parsed = command.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Confirm the current pool version before changing replays.",
    );
  const removed = await db().transaction(async (tx) => {
    await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(18501)`);
    await assertCapability(actor, "manage_replays", slug, tx);
    await assertOperationalEdition(slug, tx);
    const { pool, entry } = await target(actor, slug, entryId, tx);
    windowOpen(pool);
    const [row] = await tx
      .select()
      .from(mappoolReplays)
      .where(
        and(
          eq(mappoolReplays.id, replayId),
          eq(mappoolReplays.entryId, entryId),
        ),
      );
    if (!row) return { removed: false, version: pool.version }; // Idempotent retry of a committed deletion.
    if (pool.version !== parsed.data.expectedVersion)
      throw new HttpError(409, "This pool changed. Refresh before confirming.");
    await tx.delete(mappoolReplays).where(eq(mappoolReplays.id, replayId));
    await tx
      .update(mappools)
      .set({ version: pool.version + 1, updatedAt: new Date() })
      .where(eq(mappools.id, pool.id));
    await tx.insert(mappoolEvents).values({
      editionSlug: slug,
      poolId: pool.id,
      actorId: actor.osuId,
      action: "replay_delete",
      before: { replay: row },
      after: { replayId, entryId, beatmapId: entry.beatmapId },
    });
    return { removed: true, version: pool.version + 1 };
  });
  if (removed.removed) await removeReplayFile(replayId).catch(() => {}); // Safe orphan, reclaimed by offline cleanup.
  return removed;
}
