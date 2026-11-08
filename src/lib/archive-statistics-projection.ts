import type { HistoricalArchive } from "./historical-archive";
import type { StatisticsRow } from "./archive-read-model";
import {
  archiveMpId,
  fixtureStatisticsIssues,
  statisticsFixtures,
} from "./archive-statistics-model";
import { statisticsArchiveKey } from "./archive-statistics-key";
import { archivePoolFixtures } from "./archive-mappool-statistics";
import type { ArchiveStatisticsSummary } from "./competition-detail-read-contracts";
export type { ArchiveStatisticsSummary } from "./competition-detail-read-contracts";
import { hasStatisticsAdjudication } from "./statistics-snapshot";
import { STATISTICS_SCORE_POLICY } from "./statistics-score";

/** Shared release selection: a fixture is never partially covered by its MPs. */
export function releasedArchiveStatistics(
  archive: HistoricalArchive,
  rows: StatisticsRow[],
  fixtureId?: string,
) {
  const key = statisticsArchiveKey(archive);
  const fixtures = statisticsFixtures(archive).filter(
    (f) => !fixtureId || f.id === fixtureId,
  );
  const published = fixtures.flatMap((fixture) => {
    const sources = rows.filter(
      (r) =>
        r.fixtureId === fixture.id &&
        fixture.mpUrls.some((u) => archiveMpId(u) === r.mpId),
    );
    if (
      !sources.length ||
      sources.some((r) => !r.published || r.published.archiveKey !== key) ||
      fixtureStatisticsIssues(
        archive,
        fixture.id,
        sources.map((r) => r.published!),
      ).length
    )
      return [];
    return sources;
  });
  return { key, fixtures, published };
}
export function archiveStatisticsSummary(
  archive: HistoricalArchive,
  release: ReturnType<typeof releasedArchiveStatistics>,
  ezScoreMultiplier = 1,
  fixtureId?: string,
): ArchiveStatisticsSummary {
  const { key, fixtures, published } = release;
  return {
    slug: archive.editionSlug,
    archiveKey: key,
    ezScoreMultiplier,
    statisticsScorePolicy: STATISTICS_SCORE_POLICY,
    players: archive.players.map(({ osuId, username, teamId, role, tier }) => ({
      osuId,
      username,
      teamId,
      role,
      tier,
    })),
    teams: archive.teams.map(({ id, name }) => ({ id, name })),
    stages: [...new Set(fixtures.map((m) => m.stage))],
    fixtures: fixtures.map((m) => ({
      id: m.id,
      label: m.label,
      stage: m.stage,
      covered: published.some((r) => r.fixtureId === m.id),
      technicalAdjudication: published.some(
        (r) =>
          r.fixtureId === m.id &&
          !!r.published &&
          hasStatisticsAdjudication(r.published),
      ),
      score: m.score,
    })),
    poolFixtures: archivePoolFixtures(
      archive,
      published.map((r) => ({
        fixtureId: r.fixtureId,
        snapshot: r.published!,
      })),
    ).filter((f) => !fixtureId || f.id === fixtureId),
    publishedAt:
      published
        .map((r) => r.publishedAt!.toISOString())
        .sort()
        .at(-1) ?? null,
    mpTotal: fixtures.reduce((n, m) => n + m.mpUrls.length, 0),
    mpCovered: published.length,
  };
}
