import { alias } from "drizzle-orm/pg-core";
import {
  normalizedArchive,
  syncArchiveRelations,
  archiveEditionStates,
  archiveReadIdentity,
  readArchiveSummary,
  saveArchiveSummary,
} from "./archive-relations";
import {
  archivePlayColumns,
  archivePlayFromColumns,
} from "./archive-play-columns";
import { supportsArchiveStatistics } from "./archive-statistics-model";
import { STATISTICS_SCORE_POLICY } from "./statistics-score";
import {
  and,
  desc,
  eq,
  inArray,
  or,
  gte,
  getTableColumns,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  archiveReadVersions,
  editionState,
  historicalStatistics,
  historicalStatisticsSources,
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
  ARCHIVE_PROJECTOR_VERSION,
  archiveContentHash,
  archiveSourceHash,
  buildArchiveReadData,
  restoreArchiveReadData,
  restoreStatisticsReadData,
  archivePlayPayload,
  type ArchiveReadData,
  type ArchiveState,
  type StatisticsRow,
} from "./archive-read-model";
import { historicalArchiveSchema } from "./historical-archive";
import { HttpError } from "./http-error";
import { remoteMode } from "./data-source";

type Reader = Pick<ReturnType<typeof db>, "select">;
type Writer = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
const empty = (): ArchiveReadData => ({
  teams: [],
  people: [],
  picks: [],
  matches: [],
  mps: [],
  pools: [],
  maps: [],
  placements: [],
  snapshots: [],
  games: [],
  scores: [],
  decisions: [],
  plays: [],
});

async function currentVersion(
  state: ArchiveState,
  reader: Reader,
  rows?: StatisticsRow[],
) {
  if (
    remoteMode() ||
    process.env.OCLR_ARCHIVE_READ_MODEL === "jsonb" ||
    !state.configuration?.archive
  )
    return undefined;
  const [version] = await reader
    .select()
    .from(archiveReadVersions)
    .where(
      and(
        eq(archiveReadVersions.editionSlug, state.slug),
        eq(
          archiveReadVersions.configurationVersion,
          state.configurationVersion,
        ),
        eq(archiveReadVersions.projectorVersion, ARCHIVE_PROJECTOR_VERSION),
        eq(
          archiveReadVersions.archiveHash,
          archiveContentHash(
            historicalArchiveSchema.parse(state.configuration.archive),
          ),
        ),
        rows
          ? eq(archiveReadVersions.sourceHash, archiveSourceHash(state, rows))
          : undefined,
      ),
    )
    .orderBy(desc(archiveReadVersions.createdAt), desc(archiveReadVersions.id))
    .limit(1);
  return version;
}
async function loadData(
  reader: Reader,
  generationId: string,
  statistics = false,
) {
  const data = empty();
  if (!statistics)
    data.teams = await reader
      .select()
      .from(archiveReadTeams)
      .where(eq(archiveReadTeams.generationId, generationId))
      .orderBy(archiveReadTeams.position);
  if (!statistics)
    data.people = await reader
      .select()
      .from(archiveReadPeople)
      .where(eq(archiveReadPeople.generationId, generationId))
      .orderBy(archiveReadPeople.position);
  if (!statistics)
    data.picks = await reader
      .select()
      .from(archiveReadPicks)
      .where(eq(archiveReadPicks.generationId, generationId))
      .orderBy(archiveReadPicks.position);
  if (!statistics)
    data.matches = await reader
      .select()
      .from(archiveReadMatches)
      .where(eq(archiveReadMatches.generationId, generationId))
      .orderBy(archiveReadMatches.position);
  if (!statistics)
    data.mps = await reader
      .select()
      .from(archiveReadMps)
      .where(eq(archiveReadMps.generationId, generationId))
      .orderBy(archiveReadMps.position);
  if (!statistics)
    data.pools = await reader
      .select()
      .from(archiveReadPools)
      .where(eq(archiveReadPools.generationId, generationId))
      .orderBy(archiveReadPools.position);
  if (!statistics)
    data.maps = await reader
      .select()
      .from(archiveReadMaps)
      .where(eq(archiveReadMaps.generationId, generationId))
      .orderBy(archiveReadMaps.position);
  if (!statistics)
    data.placements = await reader
      .select()
      .from(archiveReadPlacements)
      .where(eq(archiveReadPlacements.generationId, generationId))
      .orderBy(archiveReadPlacements.position);
  if (statistics)
    data.snapshots = await reader
      .select()
      .from(archiveReadSnapshots)
      .where(eq(archiveReadSnapshots.generationId, generationId));
  if (statistics)
    data.games = await reader
      .select()
      .from(archiveReadGames)
      .where(eq(archiveReadGames.generationId, generationId))
      .orderBy(
        archiveReadGames.mpId,
        archiveReadGames.kind,
        archiveReadGames.position,
      );
  if (statistics)
    data.scores = await reader
      .select()
      .from(archiveReadScores)
      .where(eq(archiveReadScores.generationId, generationId))
      .orderBy(
        archiveReadScores.mpId,
        archiveReadScores.kind,
        archiveReadScores.gamePosition,
        archiveReadScores.position,
      );
  if (statistics)
    data.decisions = await reader
      .select()
      .from(archiveReadDecisions)
      .where(eq(archiveReadDecisions.generationId, generationId))
      .orderBy(
        archiveReadDecisions.mpId,
        archiveReadDecisions.kind,
        archiveReadDecisions.position,
      );
  if (statistics)
    data.plays = await reader
      .select()
      .from(archiveReadPlays)
      .where(eq(archiveReadPlays.generationId, generationId))
      .orderBy(archiveReadPlays.position);
  return data;
}

/** Internal reader: caller retains the current edition's publication/permission gate. */
export async function relationalArchive(state: ArchiveState, reader: Reader) {
  const normalized = await normalizedArchive(state, reader);
  if (normalized) return normalized;
  const version = await currentVersion(state, reader);
  if (!version) return undefined;
  const data = await loadData(reader, version.id);
  try {
    const archive = restoreArchiveReadData(version.header, data);
    return archiveContentHash(archive) === version.archiveHash
      ? archive
      : undefined;
  } catch {
    return undefined;
  } // Incomplete derived rows fall back to source JSONB.
}

/** Called only in a write transaction holding the authoritative edition row lock. */
export async function rebuildArchiveReadData(
  tx: Writer,
  slug: string,
  force = false,
) {
  await syncArchiveRelations(tx, slug, force);
  const [state] = await archiveEditionStates(tx, false, slug);
  if (!state?.configuration?.archive)
    return { created: false, generationId: null };
  const { readHistoricalStatistics } = await import("./archive-relations");
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
      const { readHistoricalStatistics } = await import("./archive-relations");
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

export async function relationalStatistics(
  slug: string,
  rows: StatisticsRow[],
  reader: Reader,
) {
  const [state] = await reader
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!state) return rows;
  const version = await currentVersion(state, reader, rows);
  if (!version) return rows;
  const data = await loadData(reader, version.id, true);
  try {
    return rows.map((row) => {
      const draft = restoreStatisticsReadData(data, row.mpId, "draft");
      const published = restoreStatisticsReadData(data, row.mpId, "published");
      if (
        archiveContentHash(draft) !== archiveContentHash(row.draft) ||
        archiveContentHash(published) !== archiveContentHash(row.published)
      )
        throw new Error("Incomplete statistics projection.");
      return { ...row, draft: draft!, published };
    });
  } catch {
    return rows;
  }
}

/** Anonymous score facts. Pass source rows and reader from the same read snapshot.
 * Every server entry point rechecks publication and the matching source manifest. */
export async function relationalPublicPlays(
  slug: string,
  _rows: StatisticsRow[],
  reader: Reader,
  filters: {
    fixtureId?: string;
    osuId?: number;
    teamId?: string;
    stage?: string;
    beatmapId?: number;
  } = {},
) {
  const version = await currentPublicStatisticsVersion(slug, reader);
  if (!version) return undefined;
  const result = await reader
    .select(archivePlayColumns)
    .from(archiveReadPlays)
    .where(
      and(
        eq(archiveReadPlays.generationId, version.id),
        filters.fixtureId
          ? eq(archiveReadPlays.fixtureId, filters.fixtureId)
          : undefined,
        filters.osuId === undefined
          ? undefined
          : eq(archiveReadPlays.osuId, filters.osuId),
        filters.teamId
          ? eq(archiveReadPlays.teamId, filters.teamId)
          : undefined,
        filters.stage ? eq(archiveReadPlays.stage, filters.stage) : undefined,
        filters.beatmapId === undefined
          ? undefined
          : eq(archiveReadPlays.beatmapId, filters.beatmapId),
      ),
    )
    .orderBy(archiveReadPlays.position);
  try {
    return result.map(archivePlayFromColumns);
  } catch {
    return undefined;
  }
}

/** A missing sidecar row disables the shortcut; it never hides a source. */
async function statisticsManifestHash(reader: Reader, slug: string) {
  const sources = await reader
    .select({
      mpId: historicalStatistics.mpId,
      sourceHash: historicalStatisticsSources.sourceHash,
    })
    .from(historicalStatistics)
    .leftJoin(
      historicalStatisticsSources,
      and(
        eq(
          historicalStatisticsSources.editionSlug,
          historicalStatistics.editionSlug,
        ),
        eq(historicalStatisticsSources.mpId, historicalStatistics.mpId),
      ),
    )
    .where(eq(historicalStatistics.editionSlug, slug))
    .orderBy(historicalStatistics.mpId);
  return sources.some((s) => s.sourceHash === null)
    ? null
    : archiveContentHash(sources);
}
export async function currentPublicStatisticsVersion(
  slug: string,
  reader: Reader,
) {
  if (remoteMode() || process.env.OCLR_ARCHIVE_READ_MODEL === "jsonb")
    return undefined;
  const state = await archiveReadIdentity(reader, slug);
  if (state?.published !== true || !supportsArchiveStatistics(slug))
    return undefined;
  const {
    header: _header,
    publicStatistics: _summary,
    ...fields
  } = getTableColumns(archiveReadVersions);
  void _header;
  void _summary;
  const [version] = await reader
    .select({
      ...fields,
      actualPlayCount: sql<number>`(SELECT count(*)::integer FROM ${archiveReadPlays} WHERE ${archiveReadPlays.generationId}=${archiveReadVersions.id})`,
    })
    .from(archiveReadVersions)
    .where(
      and(
        eq(archiveReadVersions.editionSlug, slug),
        eq(
          archiveReadVersions.configurationVersion,
          state.configurationVersion,
        ),
        eq(archiveReadVersions.archiveHash, state.archiveHash),
        eq(archiveReadVersions.projectorVersion, ARCHIVE_PROJECTOR_VERSION),
      ),
    )
    .orderBy(desc(archiveReadVersions.createdAt), desc(archiveReadVersions.id))
    .limit(1);
  if (
    !version ||
    !version.publicSummaryDocumentId ||
    version.publicPlayCount !== version.actualPlayCount ||
    !version.statisticsManifestHash ||
    version.statisticsScorePolicy !== STATISTICS_SCORE_POLICY ||
    version.ezScoreMultiplier !== state.ezScoreMultiplier ||
    version.statisticsManifestHash !==
      (await statisticsManifestHash(reader, slug))
  )
    return undefined;
  return version;
}

/** Already validated summary and facts: no MP source JSONB is read on this path. */
export async function relationalPublicStatistics(slug: string, reader: Reader) {
  const version = await currentPublicStatisticsVersion(slug, reader);
  if (!version?.publicSummaryDocumentId) return undefined;
  const summary = await readArchiveSummary(
    reader,
    slug,
    version.publicSummaryDocumentId,
    version.id,
  );
  if (!summary) return undefined;
  const facts = await reader
    .select(archivePlayColumns)
    .from(archiveReadPlays)
    .where(eq(archiveReadPlays.generationId, version.id))
    .orderBy(archiveReadPlays.position);
  try {
    return { summary, plays: facts.map(archivePlayFromColumns) };
  } catch {
    return undefined;
  }
}

/** Keep entire games, including opponents and bench games for the player's teams. */
export async function relationalPlayerArchivePlays(
  slug: string,
  reader: Reader,
  osuId: number,
  rosterTeams: string[],
  minimumScore: number,
) {
  const version = await currentPublicStatisticsVersion(slug, reader);
  if (!version) return undefined;
  const scope = alias(archiveReadPlays, "player_game_scope"),
    own = alias(archiveReadPlays, "player_team_scope");
  const observedTeams = reader
    .select({ teamId: own.teamId })
    .from(own)
    .where(
      and(
        eq(own.generationId, version.id),
        eq(own.osuId, osuId),
        gte(own.rawScore, minimumScore),
      ),
    );
  const games = reader
    .select({ gameId: scope.gameId })
    .from(scope)
    .where(
      and(
        eq(scope.generationId, version.id),
        or(
          eq(scope.osuId, osuId),
          inArray(scope.teamId, rosterTeams),
          inArray(scope.teamId, observedTeams),
        ),
      ),
    );
  const facts = await reader
    .select(archivePlayColumns)
    .from(archiveReadPlays)
    .where(
      and(
        eq(archiveReadPlays.generationId, version.id),
        inArray(archiveReadPlays.gameId, games),
      ),
    )
    .orderBy(archiveReadPlays.position);
  try {
    return facts.map(archivePlayFromColumns);
  } catch {
    return undefined;
  }
}
