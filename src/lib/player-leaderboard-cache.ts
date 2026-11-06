import { archiveContentHash } from "./archive-read-model";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  editionState,
  historicalStatistics,
  historicalStatisticsSources,
  historicalArchiveSources,
  playerLeaderboardVersions,
  playerLeaderboardRows,
} from "@/db/schema";
import maxCombos from "@/data/beatmap-max-combos.json";
import { PLAYER_CLASS_POLICY } from "./player-class";
import { STATISTICS_SCORE_POLICY } from "./statistics-score";
import { minimumCountedScore } from "./player-map-performance-model";
import { MRA_V4_POLICY } from "./mra-v4";
import type { PlayerLeaderboardRow } from "./player-leaderboard-model";

// Bump when the ranking projection changes; assets/policies are also in the key.
export const PLAYER_LEADERBOARD_PROJECTOR = 1;
type Reader = Pick<ReturnType<typeof db>, "select">;
const hash = archiveContentHash;
const policy = {
  version: PLAYER_LEADERBOARD_PROJECTOR,
  mra: MRA_V4_POLICY,
  class: PLAYER_CLASS_POLICY,
  score: STATISTICS_SCORE_POLICY,
  minimumCountedScore,
  combos: hash(maxCombos),
};

/** Small authoritative manifest. No MP JSONB or complete archives leave the DB.
 * Digests include unversioned legacy edits and publication/withdrawal changes.
 */
export async function leaderboardSource(reader: Reader) {
  const editions = await reader
    .select({
      slug: editionState.slug,
      revision: editionState.configurationVersion,
      updatedAt: editionState.configurationUpdatedAt,
      hash: sql<
        string | null
      >`CASE WHEN jsonb_typeof(${editionState.configuration}->'archive') = 'object'
        THEN ${historicalArchiveSources.configurationHash}
        ELSE encode(sha256(convert_to(${editionState.configuration}::text, 'UTF8')), 'hex') END`,
    })
    .from(editionState)
    .leftJoin(
      historicalArchiveSources,
      eq(historicalArchiveSources.editionSlug, editionState.slug),
    )
    .where(sql`${editionState.configuration}->>'published' = 'true'`)
    .orderBy(editionState.slug);
  const sources = editions.length
    ? await reader
        .select({
          edition: historicalStatistics.editionSlug,
          mpId: historicalStatistics.mpId,
          hash: historicalStatisticsSources.sourceHash,
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
        .where(
          inArray(
            historicalStatistics.editionSlug,
            editions.map((e) => e.slug),
          ),
        )
        .orderBy(historicalStatistics.editionSlug, historicalStatistics.mpId)
    : [];
  return {
    sourceHash:
      editions.some((e) => e.hash === null) ||
      sources.some((s) => s.hash === null)
        ? null
        : hash({ policy, editions, sources }),
    editions: editions.length,
  };
}

export async function matchingLeaderboard(
  reader: Reader,
  sourceHash: string | null,
) {
  if (!sourceHash) return undefined;
  const [row] = await reader
    .select({
      version: playerLeaderboardVersions,
      rows: sql<number>`(SELECT count(*)::integer FROM ${playerLeaderboardRows}
      WHERE ${playerLeaderboardRows.generationId} = ${playerLeaderboardVersions.id})`,
    })
    .from(playerLeaderboardVersions)
    .where(
      and(
        eq(playerLeaderboardVersions.sourceHash, sourceHash),
        eq(
          playerLeaderboardVersions.projectorVersion,
          PLAYER_LEADERBOARD_PROJECTOR,
        ),
      ),
    )
    .orderBy(
      desc(playerLeaderboardVersions.calculatedAt),
      desc(playerLeaderboardVersions.id),
    )
    .limit(1);
  return row && row.rows === row.version.players ? row.version : undefined;
}

export function leaderboardRow(
  row: typeof playerLeaderboardRows.$inferSelect,
): PlayerLeaderboardRow {
  const {
    generationId: _generation,
    position: _position,
    classCategory,
    classCode,
    ...player
  } = row;
  void _generation;
  void _position;
  return {
    ...player,
    pp: null,
    classification:
      classCategory && classCode
        ? {
            category: classCategory,
            code: classCode,
            policy: PLAYER_CLASS_POLICY,
          }
        : null,
  };
}
