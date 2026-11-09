import { alias } from "drizzle-orm/pg-core";
import {
  normalizedArchive,
  archiveReadIdentity,
  readArchiveSummary,
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
import type { Reader } from "./archive-relation-storage";
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
  restoreArchiveReadData,
  restoreStatisticsReadData,
  type ArchiveReadData,
  type ArchiveState,
  type StatisticsRow,
} from "./archive-read-model";
import { historicalArchiveSchema } from "./historical-archive";
import { remoteMode } from "./data-source";

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
export async function statisticsManifestHash(reader: Reader, slug: string) {
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
