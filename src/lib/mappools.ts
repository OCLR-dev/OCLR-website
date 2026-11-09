import { db } from "@/db";
import {
  editionState,
  fixtures,
  mappoolEntries,
  mappoolEvents,
  mappoolReplays,
  mappools,
  resultRevisions,
  refereeRoundPolicies,
  tournamentRounds,
  tournamentStages,
} from "@/db/schema";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { getEdition } from "./content";
import { resolveHistoricalPool } from "./exhibition-pools";
import { HttpError } from "./http-error";
import {
  categories,
  moveMappoolEntries,
  parseBeatmapId,
  parseMappoolRows,
  type BeatmapMetadata,
  type BeatmapSnapshot,
} from "./mappool-model";
import { mappoolWorkspace, type MappoolWorkspace } from "./mappool-reads";
import {
  changeMappoolWrite,
  type mappoolBatchRow,
} from "./mappool-write-contracts";
import {
  fetchBeatmap,
  fetchBeatmaps,
  withBeatmapAttributes,
  refreshDifficultyPreviews,
} from "./osu-beatmaps";

function validateImport(
  command: {
    text: string;
    category: (typeof categories)[number];
    rows: z.infer<typeof mappoolBatchRow>[];
  },
  entries: NonNullable<Parameters<typeof parseMappoolRows>[2]>,
) {
  let resolved;
  try {
    resolved = parseMappoolRows(command.text, command.category, entries);
  } catch {
    throw new HttpError(400, "Enter between 1 and 50 map rows.");
  }
  const invalid = resolved.find((row) => row.error);
  if (invalid) {
    const conflict = entries.some(
      (entry) =>
        entry.category === invalid.category &&
        (entry.position === invalid.position ||
          entry.beatmapId === invalid.beatmapId),
    );
    throw new HttpError(
      conflict ? 409 : 400,
      `Row ${invalid.line}: ${invalid.error}`,
    );
  }
  if (
    resolved.length !== command.rows.length ||
    resolved.some(
      (row, i) =>
        row.category !== command.rows[i].category ||
        row.position !== command.rows[i].position ||
        row.beatmapId !== parseBeatmapId(command.rows[i].beatmap),
    )
  )
    throw new HttpError(
      409,
      "Resolved slots changed. Preview the batch again before saving.",
    );
  return resolved;
}
export async function mappoolCommand(
  actor: User,
  slug: string,
  input: unknown,
): Promise<MappoolWorkspace> {
  await assertCapability(actor, "manage_mappools", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  const parsed = changeMappoolWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm a valid mappool change.");
  const c = parsed.data;
  let metadata: BeatmapMetadata | undefined;
  let beatmapId: number | undefined;
  let metadataFetchedAt: Date | undefined;
  const batchMetadata = new Map<number, BeatmapSnapshot>();
  const refreshedEntries = new Map<string, BeatmapSnapshot>();
  if (c.action === "history_import") {
    const [target] = await db()
      .select({ pool: mappools, stage: tournamentStages.kind })
      .from(mappools)
      .innerJoin(tournamentRounds, eq(tournamentRounds.id, mappools.roundId))
      .innerJoin(
        tournamentStages,
        eq(tournamentStages.id, tournamentRounds.stageId),
      )
      .where(and(eq(mappools.id, c.poolId), eq(mappools.editionSlug, slug)));
    if (!target || target.stage !== "exhibition")
      throw new HttpError(
        400,
        "Historical map selection is available for exhibition pools only.",
      );
    if (
      target.pool.version !== c.expectedVersion ||
      target.pool.lockedAt ||
      target.pool.selectionLockedAt
    )
      throw new HttpError(
        409,
        "Refresh the pool. Stale or completed-fixture pools cannot be edited.",
      );
    const source = await resolveHistoricalPool(db(), slug, c);
    const snapshots = await fetchBeatmaps(
      source.maps.map((map) => map.beatmapId),
    );
    for (const [id, snapshot] of snapshots) {
      if (snapshot instanceof HttpError) throw snapshot;
      batchMetadata.set(id, snapshot);
    }
  }
  if (c.action === "batch_import" || c.action === "batch_refresh") {
    const [pool] = await db()
      .select()
      .from(mappools)
      .where(and(eq(mappools.id, c.poolId), eq(mappools.editionSlug, slug)));
    if (!pool) throw new HttpError(404, "Mappool not found.");
    if (
      pool.version !== c.expectedVersion ||
      pool.lockedAt ||
      pool.selectionLockedAt
    )
      throw new HttpError(
        409,
        "Refresh the pool. Stale or completed-fixture pools cannot be edited.",
      );
    let ids: number[];
    let refreshEntries: (typeof mappoolEntries.$inferSelect)[] = [];
    if (c.action === "batch_import") {
      const existing = await db()
        .select()
        .from(mappoolEntries)
        .where(eq(mappoolEntries.poolId, pool.id));
      const rows = validateImport(c, existing);
      if (rows.some((r) => r.category === "FM") && !pool.fmMode)
        throw new HttpError(409, "Configure FM before importing FM slots.");
      ids = rows.map((r) => r.beatmapId!);
    } else {
      const entries = await db()
        .select()
        .from(mappoolEntries)
        .where(
          and(
            eq(mappoolEntries.poolId, pool.id),
            inArray(mappoolEntries.id, c.entryIds),
          ),
        );
      if (entries.length !== c.entryIds.length)
        throw new HttpError(404, "Selected maps no longer exist in this pool.");
      if (
        entries.some((e) => Date.now() - e.metadataFetchedAt.getTime() < 60000)
      )
        throw new HttpError(429, "Wait one minute between metadata refreshes.");
      ids = entries.map((e) => e.beatmapId);
      refreshEntries = entries;
    }
    const snapshots = await fetchBeatmaps(ids);
    for (const [id, value] of snapshots) {
      if (value instanceof HttpError) throw value;
      batchMetadata.set(id, value);
    }
    for (const entry of refreshEntries)
      refreshedEntries.set(
        entry.id,
        await refreshDifficultyPreviews(
          batchMetadata.get(entry.beatmapId)!,
          entry.category,
          entry.metadata.attributes?.configuration ?? null,
        ),
      );
    if (
      c.action === "batch_import" &&
      c.rows.some(
        (r) =>
          batchMetadata.get(parseBeatmapId(r.beatmap)!)?.fingerprint !==
          r.expectedMetadataFingerprint,
      )
    )
      throw new HttpError(
        409,
        "Official metadata changed. Preview the batch again.",
      );
  }
  // Provider work happens before the transaction; the version is checked again under lock.
  if (c.action === "entry_save" || c.action === "entry_refresh") {
    const [pool] = await db()
      .select()
      .from(mappools)
      .where(and(eq(mappools.id, c.poolId), eq(mappools.editionSlug, slug)));
    if (!pool) throw new HttpError(404, "Mappool not found.");
    if (
      pool.version !== c.expectedVersion ||
      pool.lockedAt ||
      pool.selectionLockedAt
    )
      throw new HttpError(
        409,
        "Refresh the pool. Stale or completed-fixture pools cannot be edited.",
      );
    const [entry] = c.entryId
      ? await db()
          .select()
          .from(mappoolEntries)
          .where(
            and(
              eq(mappoolEntries.id, c.entryId),
              eq(mappoolEntries.poolId, pool.id),
            ),
          )
      : [];
    if (c.entryId && !entry) throw new HttpError(404, "Map slot not found.");
    beatmapId =
      c.action === "entry_save"
        ? (parseBeatmapId(c.beatmap) ?? undefined)
        : entry!.beatmapId;
    if (!beatmapId)
      throw new HttpError(
        400,
        "Enter an osu! beatmap ID or canonical difficulty URL.",
      );
    if (
      c.action === "entry_refresh" &&
      entry &&
      Date.now() - entry.metadataFetchedAt.getTime() < 60000
    )
      throw new HttpError(
        429,
        "Wait at least one minute between metadata refreshes.",
      );
    const snapshot =
      c.action === "entry_refresh"
        ? await refreshDifficultyPreviews(
            await fetchBeatmap(beatmapId),
            entry!.category,
            entry?.metadata.attributes?.configuration ?? null,
          )
        : await withBeatmapAttributes(
            await fetchBeatmap(beatmapId),
            c.action === "entry_save"
              ? c.difficultyConfiguration
              : (entry?.metadata.attributes?.configuration ?? null),
          );
    if (
      c.action === "entry_save" &&
      c.expectedMetadataFingerprint &&
      c.expectedMetadataFingerprint !== snapshot.fingerprint
    )
      throw new HttpError(
        409,
        "Official metadata changed after your preview. Look up the beatmap again before saving.",
      );
    metadata = snapshot.metadata;
    metadataFetchedAt = new Date(snapshot.fetchedAt);
  }
  try {
    await db().transaction(async (tx) => {
      // All pool/round changes for this edition share a lock, without touching draft versions.
      await tx.insert(editionState).values({ slug }).onConflictDoNothing();
      await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug))
        .for("update");
      await assertCapability(actor, "manage_mappools", slug, tx);
      await assertOperationalEdition(slug, tx);
      if (c.action === "round_delete") {
        const [round] = await tx
          .select()
          .from(tournamentRounds)
          .where(
            and(
              eq(tournamentRounds.id, c.roundId),
              eq(tournamentRounds.editionSlug, slug),
            ),
          )
          .for("update");
        if (!round)
          throw new HttpError(404, "Round not found in this edition.");
        if (round.version !== c.expectedVersion)
          throw new HttpError(
            409,
            "The round changed. Refresh before deleting.",
          );
        const pools = await tx
          .select({
            id: mappools.id,
            lockedAt: mappools.lockedAt,
            selectionLockedAt: mappools.selectionLockedAt,
          })
          .from(mappools)
          .where(eq(mappools.roundId, round.id));
        const [fixture] = await tx
          .select({ id: fixtures.id })
          .from(fixtures)
          .where(eq(fixtures.roundId, round.id))
          .limit(1);
        if (pools.some((pool) => pool.lockedAt || pool.selectionLockedAt))
          throw new HttpError(
            409,
            "This round has locked competition pools. Keep it and create a new round instead.",
          );
        if (pools.length)
          throw new HttpError(
            409,
            "This round contains mappools and cannot be deleted. Keep it or create a new round; no dependent records were removed.",
          );
        if (fixture)
          throw new HttpError(
            409,
            "This round contains fixtures or result history. Remove only eligible unused fixtures in Fixtures & results first; protected history must be retained.",
          );
        // The edition and round locks serialize this with normal pool/fixture
        // creation. Existing restrictive FKs also protect against direct writes.
        const [refereePolicy] = await tx
          .delete(refereeRoundPolicies)
          .where(eq(refereeRoundPolicies.roundId, round.id))
          .returning();
        await tx
          .delete(tournamentRounds)
          .where(eq(tournamentRounds.id, round.id));
        await tx.insert(mappoolEvents).values({
          editionSlug: slug,
          actorId: actor.osuId,
          action: "round_delete",
          before: { ...round, refereePolicy: refereePolicy ?? null },
          // This existing event store requires an after object. An explicit
          // tombstone keeps the stable entity ID without inventing a live row.
          after: { id: round.id, deleted: true },
        });
        return;
      }
      if (c.action === "round_create" || c.action === "round_edit") {
        let before = null;
        let round;
        if (c.action === "round_create") {
          const [stage] = await tx
            .insert(tournamentStages)
            .values({ editionSlug: slug, kind: c.stage })
            .onConflictDoUpdate({
              target: [tournamentStages.editionSlug, tournamentStages.kind],
              set: { kind: c.stage },
            })
            .returning();
          [round] = await tx
            .insert(tournamentRounds)
            .values({
              editionSlug: slug,
              stageId: stage.id,
              name: c.name,
              position: c.position,
            })
            .returning();
        } else {
          [before] = await tx
            .select()
            .from(tournamentRounds)
            .where(
              and(
                eq(tournamentRounds.id, c.roundId),
                eq(tournamentRounds.editionSlug, slug),
              ),
            );
          if (!before) throw new HttpError(404, "Round not found.");
          if (before.version !== c.expectedVersion)
            throw new HttpError(
              409,
              "The round changed. Refresh before editing.",
            );
          const used = await tx
            .select()
            .from(mappools)
            .where(
              and(
                eq(mappools.roundId, before.id),
                or(
                  isNotNull(mappools.lockedAt),
                  isNotNull(mappools.selectionLockedAt),
                ),
              ),
            )
            .limit(1);
          const completed = await tx
            .select({ id: fixtures.id })
            .from(fixtures)
            .innerJoin(
              resultRevisions,
              eq(resultRevisions.fixtureId, fixtures.id),
            )
            .where(
              and(
                eq(fixtures.roundId, before.id),
                isNotNull(resultRevisions.approvedAt),
              ),
            )
            .limit(1);
          if (used.length || completed.length)
            throw new HttpError(
              409,
              "Completed-fixture round labels are protected; create a new round for later matches.",
            );
          [round] = await tx
            .update(tournamentRounds)
            .set({
              name: c.name,
              position: c.position,
              version: before.version + 1,
            })
            .where(eq(tournamentRounds.id, before.id))
            .returning();
        }
        await tx.insert(mappoolEvents).values({
          editionSlug: slug,
          actorId: actor.osuId,
          action: c.action,

          before,
          after: round,
        });
        return;
      }
      if (c.action === "pool_create") {
        const [round] = await tx
          .select()
          .from(tournamentRounds)
          .where(
            and(
              eq(tournamentRounds.id, c.roundId),
              eq(tournamentRounds.editionSlug, slug),
            ),
          );
        if (!round)
          throw new HttpError(404, "Round not found in this edition.");
        const [pool] = await tx
          .insert(mappools)
          .values({ editionSlug: slug, roundId: round.id, name: c.name })
          .returning();
        await tx.insert(mappoolEvents).values({
          editionSlug: slug,
          poolId: pool.id,
          actorId: actor.osuId,
          action: c.action,

          after: pool,
        });
        return;
      }
      const [pool] = await tx
        .select()
        .from(mappools)
        .where(and(eq(mappools.id, c.poolId), eq(mappools.editionSlug, slug)))
        .for("update");
      if (!pool) throw new HttpError(404, "Mappool not found.");
      if (pool.version !== c.expectedVersion)
        throw new HttpError(
          409,
          "This pool changed. Refresh before confirming.",
        );
      if (pool.lockedAt)
        throw new HttpError(
          409,
          "A pool used by an approved fixture is immutable; create a new pool instead.",
        );
      if (pool.selectionLockedAt && c.action !== "pool_publish")
        throw new HttpError(
          409,
          "Map selection is locked. Create a new pool to change maps.",
        );
      const entries = await tx
        .select()
        .from(mappoolEntries)
        .where(eq(mappoolEntries.poolId, pool.id));
      // Stable entry IDs retain attachments through moves. Removal/replacement requires explicit attachment cleanup.
      const attachments = entries.length
        ? await tx
            .select()
            .from(mappoolReplays)
            .where(
              inArray(
                mappoolReplays.entryId,
                entries.map((e) => e.id),
              ),
            )
        : [];
      const removing =
        c.action === "entry_remove"
          ? [c.entryId]
          : c.action === "batch_remove"
            ? c.entryIds
            : [];
      if (attachments.some((r) => removing.includes(r.entryId)))
        throw new HttpError(
          409,
          "Remove replay attachments before removing this map.",
        );
      if (
        c.action === "entry_save" &&
        c.entryId &&
        entries.find((e) => e.id === c.entryId)?.beatmapId !== beatmapId &&
        attachments.some((r) => r.entryId === c.entryId)
      )
        throw new HttpError(
          409,
          "Remove replay attachments before replacing this beatmap.",
        );
      for (const replay of attachments) {
        const next =
          c.action === "batch_refresh"
            ? batchMetadata.get(
                entries.find((e) => e.id === replay.entryId)!.beatmapId,
              )?.metadata
            : (c.action === "entry_save" || c.action === "entry_refresh") &&
                c.entryId === replay.entryId
              ? metadata
              : undefined;
        if (
          next?.checksum &&
          next.checksum.toLowerCase() !== replay.summary.beatmapMd5
        )
          throw new HttpError(
            409,
            "Updated beatmap checksum conflicts with an attached replay. Saved metadata was preserved.",
          );
      }

      const before = { pool, entries };
      const [roundConfiguration] = await tx
        .select({
          rules: tournamentRounds.scoringRules,
          stage: tournamentStages.kind,
        })
        .from(tournamentRounds)
        .innerJoin(
          tournamentStages,
          eq(tournamentStages.id, tournamentRounds.stageId),
        )
        .where(eq(tournamentRounds.id, pool.roundId));
      const snapshots = [
        ...(metadata ? [metadata] : []),
        ...Array.from(batchMetadata.values(), (snapshot) => snapshot.metadata),
      ];
      const configuredMode = roundConfiguration.rules?.mode;
      if (configuredMode && snapshots.some((m) => m.mode !== configuredMode))
        throw new HttpError(
          400,
          "Beatmap ruleset does not match the configured round. No maps were saved.",
        );

      if (c.action === "history_import") {
        if (roundConfiguration.stage !== "exhibition")
          throw new HttpError(
            400,
            "Historical map selection is available for exhibition pools only.",
          );
        // Serialize against source edition configuration/publication changes. Source rows are never mutated.
        await tx
          .select({ slug: editionState.slug })
          .from(editionState)
          .where(eq(editionState.slug, c.sourceEdition))
          .for("share");
        const source = await resolveHistoricalPool(tx, slug, c);
        const positions = new Map(
          categories.map((category) => [
            category,
            Math.max(
              0,
              ...entries
                .filter((e) => e.category === category)
                .map((e) => e.position),
            ),
          ]),
        );
        const selectedMaps = new Set<string>();
        for (const map of source.maps) {
          if (map.category === "FM" && !pool.fmMode)
            throw new HttpError(409, "Configure FM before importing FM slots.");
          if (
            entries.some(
              (entry) =>
                entry.category === map.category &&
                entry.beatmapId === map.beatmapId,
            )
          )
            throw new HttpError(
              409,
              "A selected beatmap already exists in this category. No maps were saved.",
            );
          const identity = `${map.category}:${map.beatmapId}`;
          if (selectedMaps.has(identity))
            throw new HttpError(
              400,
              "Choose each beatmap only once per category.",
            );
          selectedMaps.add(identity);
          const position = positions.get(map.category)! + 1;
          if (position > 999)
            throw new HttpError(
              400,
              "This category has no available map slots.",
            );
          positions.set(map.category, position);
          const snapshot = batchMetadata.get(map.beatmapId);
          if (!snapshot)
            throw new HttpError(
              409,
              "The historical mappool changed. Select its maps again.",
            );
          await tx.insert(mappoolEntries).values({
            poolId: pool.id,
            category: map.category,
            position,
            beatmapId: map.beatmapId,
            metadata: snapshot.metadata,
            metadataFetchedAt: new Date(snapshot.fetchedAt),
            source: {
              editionSlug: source.pool.editionSlug,
              editionName: source.pool.editionName,
              poolId: source.pool.poolId,
              poolName: source.pool.poolName,
              slot: map.slot,
              beatmapId: map.beatmapId,
            },
          });
        }
      } else if (c.action === "batch_import") {
        validateImport(c, entries);
        for (const row of c.rows) {
          const id = parseBeatmapId(row.beatmap)!;
          if (
            entries.some(
              (e) =>
                e.category === row.category &&
                (e.position === row.position || e.beatmapId === id),
            )
          )
            throw new HttpError(
              409,
              "A batch slot or beatmap already exists in this category. No maps were saved.",
            );
          if (row.category === "FM" && !pool.fmMode)
            throw new HttpError(409, "Configure FM before importing FM slots.");
          const snapshot = batchMetadata.get(id)!;
          await tx.insert(mappoolEntries).values({
            poolId: pool.id,
            category: row.category,
            position: row.position,
            beatmapId: id,
            metadata: snapshot.metadata,
            metadataFetchedAt: new Date(snapshot.fetchedAt),
          });
        }
      } else if (
        c.action === "batch_remove" ||
        c.action === "batch_move" ||
        c.action === "batch_refresh"
      ) {
        const selected = c.entryIds.map((id) =>
          entries.find((e) => e.id === id),
        );
        if (selected.some((e) => !e))
          throw new HttpError(
            404,
            "Selected maps no longer exist in this pool.",
          );
        if (c.action === "batch_remove")
          await tx
            .delete(mappoolEntries)
            .where(inArray(mappoolEntries.id, c.entryIds));
        else if (c.action === "batch_refresh") {
          for (const entry of selected) {
            const snapshot = refreshedEntries.get(entry!.id)!;
            await tx
              .update(mappoolEntries)
              .set({
                metadata: snapshot.metadata,
                metadataFetchedAt: new Date(snapshot.fetchedAt),
              })
              .where(eq(mappoolEntries.id, entry!.id));
          }
        } else {
          if (c.category === "FM" && !pool.fmMode)
            throw new HttpError(409, "Configure FM first.");
          let moved;
          try {
            moved = moveMappoolEntries(
              entries,
              c.entryIds,
              c.category,
              c.position,
            );
          } catch (error) {
            throw new HttpError(400, (error as Error).message);
          }
          // Vacate every affected slot first, including occupied destination rows.
          for (let i = 0; i < moved.length; i++)
            await tx
              .update(mappoolEntries)
              .set({ position: 10000 + i })
              .where(eq(mappoolEntries.id, moved[i].id));
          for (const entry of moved)
            await tx
              .update(mappoolEntries)
              .set({ category: entry.category, position: entry.position })
              .where(eq(mappoolEntries.id, entry.id));
        }
      } else if (c.action === "pool_settings") {
        if (!c.fmMode && entries.some((e) => e.category === "FM"))
          throw new HttpError(409, "Remove FM slots before disabling FM.");
        await tx
          .update(mappools)
          .set({
            name: c.name,
            fmMode: c.fmMode,
            fmRestrictions: c.fmMode ? c.fmRestrictions : "",
          })
          .where(eq(mappools.id, pool.id));
      } else if (c.action === "pool_publish") {
        if (c.published && !entries.length)
          throw new HttpError(409, "Add a verified map before publishing.");
        await tx
          .update(mappools)
          .set({ publishedAt: c.published ? new Date() : null })
          .where(eq(mappools.id, pool.id));
      } else if (c.action === "reorder") {
        const group = entries.filter((e) => e.category === c.category);
        if (
          new Set(c.entryIds).size !== c.entryIds.length ||
          group.length !== c.entryIds.length ||
          !group.every((e) => c.entryIds.includes(e.id))
        )
          throw new HttpError(
            400,
            "Reorder every slot in this category exactly once.",
          );
        for (let i = 0; i < c.entryIds.length; i++)
          await tx
            .update(mappoolEntries)
            .set({ position: 10000 + i })
            .where(eq(mappoolEntries.id, c.entryIds[i]));
        for (let i = 0; i < c.entryIds.length; i++)
          await tx
            .update(mappoolEntries)
            .set({ position: i + 1 })
            .where(eq(mappoolEntries.id, c.entryIds[i]));
      } else {
        const entry = entries.find((e) => e.id === c.entryId);
        if (c.entryId && !entry)
          throw new HttpError(404, "Map slot not found in this pool.");
        if (c.action === "entry_remove")
          await tx
            .delete(mappoolEntries)
            .where(eq(mappoolEntries.id, c.entryId));
        else if (c.action === "entry_refresh")
          await tx
            .update(mappoolEntries)
            .set({ metadata: metadata!, metadataFetchedAt: metadataFetchedAt! })
            .where(eq(mappoolEntries.id, c.entryId));
        else {
          if (c.category === "FM" && !pool.fmMode)
            throw new HttpError(
              409,
              "Choose Free Mod or Force Mod before adding FM slots.",
            );
          const values = {
            category: c.category,
            position: c.position,
            beatmapId: beatmapId!,
            downloadMirror:
              c.downloadMirror !== undefined
                ? c.downloadMirror
                : entry?.beatmapId === beatmapId
                  ? (entry?.downloadMirror ?? null)
                  : null,
            metadata: metadata!,
            metadataFetchedAt: metadataFetchedAt!,
            source:
              entry?.beatmapId === beatmapId ? (entry?.source ?? null) : null,
          };
          if (entry)
            await tx
              .update(mappoolEntries)
              .set(values)
              .where(eq(mappoolEntries.id, entry.id));
          else
            await tx
              .insert(mappoolEntries)
              .values({ poolId: pool.id, ...values });
        }
      }
      const [afterPool] = await tx
        .update(mappools)
        .set({ version: pool.version + 1, updatedAt: new Date() })
        .where(eq(mappools.id, pool.id))
        .returning();
      const afterEntries = await tx
        .select()
        .from(mappoolEntries)
        .where(eq(mappoolEntries.poolId, pool.id))
        .orderBy(mappoolEntries.category, mappoolEntries.position);
      if (afterPool.publishedAt && !afterEntries.length)
        throw new HttpError(
          409,
          "A public pool must retain at least one verified map. Unpublish it before removing every map.",
        );
      await tx.insert(mappoolEvents).values({
        editionSlug: slug,
        poolId: pool.id,
        actorId: actor.osuId,
        action: c.action,
        before,
        after: { pool: afterPool, entries: afterEntries },
      });
    });
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (
      c.action === "round_delete" &&
      (cause as { code?: string })?.code === "23503"
    )
      throw new HttpError(
        409,
        "This round gained dependent records. Refresh and handle its dependencies before deleting.",
      );
    if ((cause as { code?: string })?.code === "23505")
      throw new HttpError(
        409,
        "This round position, pool name or map slot already exists. Refresh and choose another.",
      );
    throw error;
  }
  return mappoolWorkspace(actor, slug);
}
