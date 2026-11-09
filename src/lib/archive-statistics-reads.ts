import { db } from "@/db";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  relationalPlayerArchivePlays,
  relationalPublicPlays,
  relationalPublicStatistics,
} from "./archive-read";
import {
  readStatisticsArchive,
  readStatisticsSources,
} from "./archive-statistics-data";
import { statisticsArchiveKey } from "./archive-statistics-key";
import {
  archiveMpId,
  canExcludeNonParticipantScore,
  canExcludeStatisticsBenchScore,
  fixtureStatisticsIssues,
  projectStatistics,
  statisticsFixtures,
  statisticsGameIssues,
  type StatisticsSnapshot,
} from "./archive-statistics-model";
import {
  archiveStatisticsSummary,
  releasedArchiveStatistics,
} from "./archive-statistics-projection";
import type { User } from "./auth/sessions";
import { assertReadCapability, hasCapability } from "./auth/staff";
import { remoteMode } from "./data-source";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import type { HistoricalArchive } from "./historical-archive";
import {
  archiveMatchDetails,
  withStatisticsScores,
} from "./match-details-model";
import { ratingSnapshot } from "./rating-snapshot";
import { statisticsScore } from "./statistics-score";
import { hasStatisticsAdjudication } from "./statistics-snapshot";
import { readTournament } from "./tournament-reads";
import type { RatingGame } from "./yumu-rating";

async function databaseStatisticsWorkspace(
  actor: User,
  slug: string,
  fixtureId = "",
): Promise<StatisticsWorkspace> {
  await assertReadCapability(actor, "record_results", slug);
  const archive = await readStatisticsArchive(slug);
  const key = statisticsArchiveKey(archive);
  const rows = (await readStatisticsSources(slug, db())).filter((r) =>
    statisticsFixtures(archive).some(
      (f) =>
        f.id === r.fixtureId && f.mpUrls.some((u) => archiveMpId(u) === r.mpId),
    ),
  );
  const summaries = rows.map((r) => ({
    mpId: r.mpId,
    fixtureId: r.fixtureId,
    version: r.version,
    importedAt: r.draft.source.fetchedAt,
    publishedAt:
      r.published?.archiveKey === key
        ? (r.publishedAt?.toISOString() ?? null)
        : null,
    changes:
      !r.published ||
      r.published.source.fingerprint !== r.draft.source.fingerprint ||
      r.published.poolId !== r.draft.poolId ||
      r.published.allowUnlistedMaps !== r.draft.allowUnlistedMaps ||
      JSON.stringify(r.published.excludedScores ?? []) !==
        JSON.stringify(r.draft.excludedScores ?? []) ||
      !isDeepStrictEqual(r.published.adjudication, r.draft.adjudication) ||
      !isDeepStrictEqual(r.published.excludedGames, r.draft.excludedGames) ||
      r.published.evidenceUrl !== r.draft.evidenceUrl ||
      r.published.reviewedBy !== r.draft.reviewedBy ||
      r.published.reviewedAt !== r.draft.reviewedAt ||
      JSON.stringify(r.published.rosterTeamGames ?? []) !==
        JSON.stringify(r.draft.rosterTeamGames ?? []) ||
      JSON.stringify(r.published.included) !== JSON.stringify(r.draft.included),
    stale: r.draft.archiveKey !== key,
  }));
  const fixtures = statisticsFixtures(archive).map((m) => ({
    id: m.id,
    label: m.label,
    stage: m.stage,
    score: m.score,
    teams: [m.teamA, m.teamB].map(
      (id) => archive.teams.find((t) => t.id === id)!.name,
    ),
    mpIds: m.mpUrls.map(archiveMpId),
  }));
  return {
    slug,
    fixtures,
    summaries,
    canPublish: await hasCapability(actor, "approve_results", slug),
    pools: archive.pools.map(({ id, name }) => ({ id, name })),
    reviews: rows
      .filter((r) => r.fixtureId === fixtureId)
      .map((r) => ({
        mpId: r.mpId,
        version: r.version,
        poolId: r.draft.poolId,
        allowUnlistedMaps: r.draft.allowUnlistedMaps ?? false,
        excludedScores: r.draft.excludedScores ?? [],
        rosterTeamGames: r.draft.rosterTeamGames ?? [],
        technicalAdjudication: hasStatisticsAdjudication(r.draft),
        adjudication: r.draft
          .adjudication as StatisticsSnapshot["adjudication"],
        excludedGames: r.draft
          .excludedGames as StatisticsSnapshot["excludedGames"],
        reviewedBy: (r.draft.reviewedBy ?? null) as number | null | undefined,
        reviewedAt: (r.draft.reviewedAt ?? null) as string | null | undefined,
        evidenceUrl: (r.draft.evidenceUrl ?? null) as string | null | undefined,
        complete: r.draft.source.complete,
        fetchedAt: r.draft.source.fetchedAt,
        warnings: r.draft.source.warnings,
        games: r.draft.source.games.map((game) => ({
          game,
          included: r.draft.included.includes(game.id),
          nonParticipantIds: game.scores
            .filter(
              (score) =>
                canExcludeNonParticipantScore(archive, r.fixtureId, score) ||
                canExcludeStatisticsBenchScore(
                  archive,
                  r.fixtureId,
                  game,
                  score,
                  (r.draft.excludedScores ?? [])
                    .filter((e) => e.gameId === game.id)
                    .map((e) => e.osuId),
                ),
            )
            .map((score) => score.osuId!),
          issues: statisticsGameIssues(
            archive,
            r.fixtureId,
            r.draft.poolId,
            game,
            r.draft.allowUnlistedMaps,
            r.draft.excludedScores,
            r.draft.rosterTeamGames?.includes(game.id),
          ),
        })),
      })),
    blockers: fixtureId
      ? fixtureStatisticsIssues(
          archive,
          fixtureId,
          rows.filter((r) => r.fixtureId === fixtureId).map((r) => r.draft),
        )
      : [],
  };
}
export async function statisticsWorkspace(
  actor: User,
  slug: string,
  fixtureId = "",
): Promise<StatisticsWorkspace> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<StatisticsWorkspace>("statisticsWorkspace", {
      slug,
      fixtureId,
    });
  }
  return databaseStatisticsWorkspace(actor, slug, fixtureId);
}

export type StatisticsWorkspace = ExplicitReadData<"statisticsWorkspace">;

function publicArchiveMatchDetails(
  archive: HistoricalArchive,
  fixtures: ReturnType<typeof statisticsFixtures>,
  published: Awaited<ReturnType<typeof readStatisticsSources>>,
  ezScoreMultiplier: number,
) {
  return fixtures.flatMap((f) => {
    const sources = published.filter((r) => r.fixtureId === f.id);
    if (!sources.length) return [];
    // Published snapshot identity, not the mutable draft version, anchors the report.
    const details = withStatisticsScores(
      archiveMatchDetails(
        archive,
        f.id,
        sources.map((r) => ({
          snapshot: r.published!,
          revision: createHash("sha256")
            .update(JSON.stringify(r.published))
            .digest("hex"),
        })),
      ),
      ezScoreMultiplier,
    );
    const games: RatingGame[] = details.games
      .filter((g) => g.included)
      .map((g) => ({
        fixtureId: f.id,
        gameId: g.gameId,
        // Historical snapshots have no numeric result revision; fingerprint is authoritative.
        revision: 0,
        fingerprint: g.revision,
        approvalFingerprint: g.revision,
        ...(ezScoreMultiplier === 1 ? {} : { ezScoreMultiplier }),
        at: g.startTime,
        teamIds: details.teamIds,
        winnerTeamId:
          g.effectiveTotals[0] === g.effectiveTotals[1]
            ? null
            : details.teamIds[
                g.effectiveTotals[0]! > g.effectiveTotals[1]! ? 0 : 1
              ],
        scores: g.scores
          .filter((s) => s.included)
          .map((s) => ({
            userId: s.osuId,
            teamId: s.teamId!,
            total: statisticsScore(
              s.effectiveTotal!,
              [...g.mods, ...s.mods],
              ezScoreMultiplier,
            ).score,
            rawTotal: s.total!,
            mods: [...new Set([...g.mods, ...s.mods])].sort(),
          })),
      }));
    details.rating = ratingSnapshot(
      games,
      new Map(archive.players.map((p) => [p.osuId, p.username])),
    );
    return [{ fixtureId: f.id, details }];
  });
}

async function databasePublicArchiveStatistics(
  slug: string,
  fixtureId?: string,
): Promise<PublicArchiveStatistics> {
  return db().transaction(
    async (tx) => {
      if (!fixtureId) {
        const fast = await relationalPublicStatistics(slug, tx);
        if (fast)
          return {
            ...fast.summary,
            plays: fast.plays,
            matchDetails: [],
          };
      }
      const archive = await readStatisticsArchive(slug, tx, true);
      const ezScoreMultiplier =
        (await readTournament(slug, tx, true))?.edition.ezScoreMultiplier ?? 1;
      const rows = await readStatisticsSources(slug, tx, fixtureId);
      const release = releasedArchiveStatistics(archive, rows, fixtureId);
      const { fixtures, published } = release;
      const plays =
        (await relationalPublicPlays(slug, rows, tx, { fixtureId })) ??
        published.flatMap((r) =>
          projectStatistics(
            archive,
            r.fixtureId,
            r.published!,
            ezScoreMultiplier,
          ),
        );
      return {
        ...archiveStatisticsSummary(
          archive,
          release,
          ezScoreMultiplier,
          fixtureId,
        ),
        plays,
        matchDetails: publicArchiveMatchDetails(
          archive,
          fixtureId ? fixtures : [],
          published,
          ezScoreMultiplier,
        ),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicArchiveStatistics(
  slug: string,
  fixtureId?: string,
): Promise<PublicArchiveStatistics> {
  if (remoteMode()) {
    return frontendResource<PublicArchiveStatistics>(
      "publicArchiveStatistics",
      { slug, fixtureId },
    );
  }
  return databasePublicArchiveStatistics(slug, fixtureId);
}

export type PublicArchiveStatistics =
  ExplicitReadData<"publicArchiveStatistics">;

/** Local profile reads keep full relevant games; remote keeps its existing resource. */
export async function publicArchivePlayerPlays(
  slug: string,
  osuId: number,
  rosterTeams: string[],
  minimumScore: number,
) {
  if (!remoteMode()) {
    const plays = await db().transaction(
      (tx) =>
        relationalPlayerArchivePlays(
          slug,
          tx,
          osuId,
          rosterTeams,
          minimumScore,
        ),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    if (plays !== undefined) return plays;
  }
  return (await publicArchiveStatistics(slug)).plays;
}
