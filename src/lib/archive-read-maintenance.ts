import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  archiveReadVersions,
  editionState,
  historicalStatistics,
  archiveReadTeams,
  archiveReadPeople,
  archiveReadPicks,
  archiveReadMatches,
  archiveReadMps,
  archiveReadPools,
  archiveReadMaps,
  archiveReadPlacements,
  archiveReadSnapshots,
  archiveReadGames,
  archiveReadScores,
  archiveReadDecisions,
  archiveReadPlays,
} from "@/db/schema";
import {
  archiveEditionStates,
  readArchiveSummary,
  readHistoricalStatistics,
} from "./archive-relations";
import {
  saveArchiveSummary,
  syncArchiveRelations,
} from "./archive-relation-writes";
import type { Reader, Writer } from "./archive-relation-storage";
import { statisticsManifestHash } from "./archive-read";
import {
  archivePlayColumns,
  archivePlayFromColumns,
} from "./archive-play-columns";
import {
  ARCHIVE_PROJECTOR_VERSION,
  archiveContentHash,
  archivePlayPayload,
  archiveSourceHash,
  buildArchiveReadData,
  restoreArchiveReadData,
  restoreStatisticsReadData,
} from "./archive-read-model";
import { STATISTICS_SCORE_POLICY } from "./statistics-score";
import { HttpError } from "./http-error";

/** Called only in a write transaction holding the authoritative edition row lock. */
async function rebuildArchiveReadData(
  tx: Writer,
  slug: string,
  force = false,
) {
  await syncArchiveRelations(tx, slug, force);
  const [state] = await archiveEditionStates(tx, false, slug);
  if (!state?.configuration?.archive)
    return { created: false, generationId: null };
  const rows = await readHistoricalStatistics(slug, tx);
  const sourceHash = archiveSourceHash(state, rows);
  const [existing] = await tx
    .select()
    .from(archiveReadVersions)
    .where(
      and(
        eq(archiveReadVersions.editionSlug, slug),
        eq(
          archiveReadVersions.configurationVersion,
          state.configurationVersion,
        ),
        eq(archiveReadVersions.sourceHash, sourceHash),
        eq(archiveReadVersions.projectorVersion, ARCHIVE_PROJECTOR_VERSION),
      ),
    )
    .orderBy(desc(archiveReadVersions.createdAt), desc(archiveReadVersions.id))
    .limit(1);
  const [existingCount] = existing
    ? await tx
        .select({ total: sql<number>`count(*)::integer` })
        .from(archiveReadPlays)
        .where(eq(archiveReadPlays.generationId, existing.id))
    : [{ total: 0 }];
  if (
    existing &&
    !force &&
    existing.publicPlayCount === existingCount.total &&
    existing.publicSummaryDocumentId &&
    (await readArchiveSummary(
      tx,
      slug,
      existing.publicSummaryDocumentId,
      existing.id,
    ))
  )
    return { created: false, generationId: existing.id, publicReadReady: true };
  const built = buildArchiveReadData(state, rows);
  if (existing && !force && !built.publicStatistics)
    return {
      created: false,
      generationId: existing.id,
      publicReadReady: false,
    };
  if (existing && !force && built.publicStatistics) {
    const actual = await tx
      .select(archivePlayColumns)
      .from(archiveReadPlays)
      .where(eq(archiveReadPlays.generationId, existing.id))
      .orderBy(archiveReadPlays.position);
    // Upgrade old valid generations in place, preserving their JSONB and IDs.
    // Rebuild a new generation when derived facts do not roundtrip exactly.
    let matches = false;
    try {
      matches =
        archiveContentHash(actual.map(archivePlayFromColumns)) ===
        archiveContentHash(
          built.data.plays.map((r) => archivePlayPayload(r.payload)),
        );
    } catch {
      /* Incomplete native facts require a rebuild. */
    }
    if (matches) {
      const publicSummaryDocumentId = await saveArchiveSummary(
        tx,
        slug,
        existing.id,
        built.publicStatistics,
      );
      await tx
        .update(archiveReadVersions)
        .set({ publicSummaryDocumentId, publicPlayCount: actual.length })
        .where(eq(archiveReadVersions.id, existing.id));
      return {
        created: false,
        generationId: existing.id,
        publicReadReady: true,
      };
    }
  }
  if (
    archiveContentHash(restoreArchiveReadData(built.header, built.data)) !==
    built.archiveHash
  )
    throw new Error("Archive relational roundtrip mismatch.");
  for (const row of rows)
    for (const kind of ["draft", "published"] as const)
      if (
        row[kind] &&
        archiveContentHash(
          restoreStatisticsReadData(built.data, row.mpId, kind),
        ) !== archiveContentHash(row[kind])
      )
        throw new Error("Statistics relational roundtrip mismatch.");
  const [version] = await tx
    .insert(archiveReadVersions)
    .values({
      editionSlug: slug,
      configurationVersion: state.configurationVersion,
      archiveHash: built.archiveHash,
      sourceHash,
      projectorVersion: ARCHIVE_PROJECTOR_VERSION,
      header: built.header,
      statisticsManifestHash: await statisticsManifestHash(tx, slug),
      statisticsScorePolicy: STATISTICS_SCORE_POLICY,
      ezScoreMultiplier: state.configuration.ezScoreMultiplier ?? 1,
      publicStatistics: built.publicStatistics,
      publicPlayCount: built.data.plays.length,
    })
    .returning();
  const data = built.data,
    generationId = version.id;
  if (built.publicStatistics) {
    const publicSummaryDocumentId = await saveArchiveSummary(
      tx,
      slug,
      generationId,
      built.publicStatistics,
    );
    await tx
      .update(archiveReadVersions)
      .set({ publicSummaryDocumentId })
      .where(eq(archiveReadVersions.id, generationId));
  }
  for (let offset = 0; offset < data.teams.length; offset += 250)
    await tx
      .insert(archiveReadTeams)
      .values(
        data.teams
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.people.length; offset += 250)
    await tx
      .insert(archiveReadPeople)
      .values(
        data.people
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.picks.length; offset += 250)
    await tx
      .insert(archiveReadPicks)
      .values(
        data.picks
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.matches.length; offset += 250)
    await tx
      .insert(archiveReadMatches)
      .values(
        data.matches
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.mps.length; offset += 250)
    await tx
      .insert(archiveReadMps)
      .values(
        data.mps
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.pools.length; offset += 250)
    await tx
      .insert(archiveReadPools)
      .values(
        data.pools
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.maps.length; offset += 250)
    await tx
      .insert(archiveReadMaps)
      .values(
        data.maps
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.placements.length; offset += 250)
    await tx
      .insert(archiveReadPlacements)
      .values(
        data.placements
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.snapshots.length; offset += 250)
    await tx
      .insert(archiveReadSnapshots)
      .values(
        data.snapshots
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.games.length; offset += 250)
    await tx
      .insert(archiveReadGames)
      .values(
        data.games
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.scores.length; offset += 250)
    await tx
      .insert(archiveReadScores)
      .values(
        data.scores
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.decisions.length; offset += 250)
    await tx
      .insert(archiveReadDecisions)
      .values(
        data.decisions
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  for (let offset = 0; offset < data.plays.length; offset += 250)
    await tx
      .insert(archiveReadPlays)
      .values(
        data.plays
          .slice(offset, offset + 250)
          .map((row) => ({ ...row, generationId })),
      );
  return {
    created: true,
    generationId,
    publicReadReady: Boolean(built.publicStatistics),
  };
}

/** Explicit, saved-only, idempotent backfill. Preview takes no write locks. */
export async function backfillArchiveReads(
  slug: string,
  apply = false,
  force = false,
) {
  return db().transaction(
    async (tx) => {
      if (apply)
        await tx
          .select({ slug: editionState.slug })
          .from(editionState)
          .where(eq(editionState.slug, slug))
          .for("update");
      const [state] = await archiveEditionStates(tx, false, slug);
      if (!state?.configuration?.archive)
        throw new HttpError(404, "Saved historical archive is required.");
      if (apply)
        return { slug, ...(await rebuildArchiveReadData(tx, slug, force)) };
      const rows = await readHistoricalStatistics(slug, tx);
      const { data, sourceHash } = buildArchiveReadData(state, rows);
      const [existing] = await tx
        .select({
          id: archiveReadVersions.id,
          documentId: archiveReadVersions.publicSummaryDocumentId,
          publicPlayCount: archiveReadVersions.publicPlayCount,
          actualPlayCount: sql<number>`(SELECT count(*)::integer FROM ${archiveReadPlays} WHERE ${archiveReadPlays.generationId}=${archiveReadVersions.id})`,
        })
        .from(archiveReadVersions)
        .where(
          and(
            eq(archiveReadVersions.editionSlug, slug),
            eq(archiveReadVersions.sourceHash, sourceHash),
            eq(archiveReadVersions.projectorVersion, ARCHIVE_PROJECTOR_VERSION),
          ),
        )
        .orderBy(
          desc(archiveReadVersions.createdAt),
          desc(archiveReadVersions.id),
        )
        .limit(1);
      return {
        slug,
        created: false,
        sourceHash,
        publicReadReady: Boolean(
          existing?.documentId &&
          existing.publicPlayCount === existing.actualPlayCount &&
          existing.actualPlayCount === data.plays.length &&
          (await readArchiveSummary(
            tx,
            slug,
            existing.documentId,
            existing.id,
          )),
        ),
        rows: Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, value.length]),
        ),
      };
    },
    {
      isolationLevel: apply ? "read committed" : "repeatable read",
      ...(apply ? {} : { accessMode: "read only" as const }),
    },
  );
}

/** Explicit audit against retained raw evidence; never called by a page read. */
export async function verifyArchiveReads(reader: Reader, slug: string) {
  const [state] = await reader
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!state?.configuration?.archive)
    throw new HttpError(404, "Saved historical archive is required.");
  const sources = await reader
    .select()
    .from(historicalStatistics)
    .where(eq(historicalStatistics.editionSlug, slug));
  const built = buildArchiveReadData(state, sources);
  const [version] = await reader
    .select({
      id: archiveReadVersions.id,
      documentId: archiveReadVersions.publicSummaryDocumentId,
      publicPlayCount: archiveReadVersions.publicPlayCount,
    })
    .from(archiveReadVersions)
    .where(
      and(
        eq(archiveReadVersions.editionSlug, slug),
        eq(archiveReadVersions.sourceHash, built.sourceHash),
        eq(archiveReadVersions.projectorVersion, ARCHIVE_PROJECTOR_VERSION),
      ),
    )
    .orderBy(desc(archiveReadVersions.createdAt), desc(archiveReadVersions.id))
    .limit(1);
  if (!version || (built.publicStatistics && !version.documentId))
    throw new HttpError(
      409,
      "Historical relations are stale; run the reviewed apply first.",
    );
  const summary = version.documentId
    ? await readArchiveSummary(reader, slug, version.documentId, version.id)
    : null;
  const facts = await reader
    .select(archivePlayColumns)
    .from(archiveReadPlays)
    .where(eq(archiveReadPlays.generationId, version.id))
    .orderBy(archiveReadPlays.position);
  let matches = false;
  try {
    matches =
      version.publicPlayCount === facts.length &&
      archiveContentHash(summary) ===
        archiveContentHash(built.publicStatistics) &&
      archiveContentHash(facts.map(archivePlayFromColumns)) ===
        archiveContentHash(
          built.data.plays.map((row) => archivePlayPayload(row.payload)),
        );
  } catch {
    /* Fail below without printing evidence. */
  }
  if (!matches)
    throw new HttpError(
      409,
      "Historical relational verification failed; source JSONB was preserved.",
    );
  return {
    generationId: version.id,
    publicReadReady: Boolean(summary),
    plays: facts.length,
  };
}
