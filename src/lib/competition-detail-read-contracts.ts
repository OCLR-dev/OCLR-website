import type { EventPoolFixture } from "./archive-mappool-statistics";
import type { StatisticsPlay } from "./archive-statistics-model";
import type { PublicFixture } from "./competition-read-contracts";
import type { ScoringRules } from "./competition-model";
import type { HistoricalArchive } from "./historical-archive";
import type { MappoolCategory, BeatmapMetadata } from "./mappool-model";
import type { MatchDetails } from "./match-details-model";
import type { MatchGame } from "./match-model";
import type { StatisticsSnapshot } from "./statistics-snapshot";

type ArchivePlayer = HistoricalArchive["players"][number];
type ArchiveScore = HistoricalArchive["matches"][number]["score"];
type LabelledId = { id: string; name: string };

export type HistoricalMapSource = {
  editionSlug: string;
  editionName: string;
  poolId: string;
  poolName: string;
  slot: string;
  beatmapId: number;
};
type PublicMapEntry = {
  id: string;
  position: number;
  poolId: string;
  category: MappoolCategory;
  beatmapId: number;
  metadata: BeatmapMetadata;
  source?: HistoricalMapSource | null;
  downloadMirror?: string | null;
};

export type ArchiveStatisticsSummary = {
  slug: string;
  archiveKey: string;
  ezScoreMultiplier?: number;
  statisticsScorePolicy?: string;
  players: Pick<
    ArchivePlayer,
    "osuId" | "username" | "teamId" | "role" | "tier"
  >[];
  teams: LabelledId[];
  stages: string[];
  fixtures: {
    id: string;
    label: string;
    stage: string;
    covered: boolean;
    technicalAdjudication: boolean;
    score: ArchiveScore;
  }[];
  poolFixtures?: EventPoolFixture[];
  publishedAt: string | null;
  mpTotal: number;
  mpCovered: number;
};

export type CompetitionDetailReadContracts = {
  nextStreamingRead: {
    nextFixture: PublicFixture | null;
    stage: {
      id: string;
      kind: "group" | "knockout" | "exhibition";
      round: {
        id: string;
        name: string;
        position: number;
        scoringRules: ScoringRules | null;
      };
    } | null;
    mappools: CompetitionDetailReadContracts["publicMappools"];
  };
  publicFixture: (PublicFixture & { details: MatchDetails | null }) | null;
  publicMappools: {
    entries: PublicMapEntry[];
    id: string;
    name: string;
    roundId: string;
    fmMode: "free_mod" | "force_mod" | null;
    fmRestrictions: string;
    publishedAt: Date | null;
    updatedAt: Date;
    roundName: string;
    roundPosition: number;
    stage: "group" | "knockout" | "exhibition";
  }[];
  publicArchiveStatistics: {
    plays: StatisticsPlay[];
    matchDetails: { fixtureId: string; details: MatchDetails }[];
  } & ArchiveStatisticsSummary;
  statisticsWorkspace: {
    slug: string;
    fixtures: {
      id: string;
      label: string;
      stage: string;
      score: ArchiveScore;
      teams: string[];
      mpIds: number[];
    }[];
    summaries: {
      mpId: number;
      fixtureId: string;
      version: number;
      importedAt: string;
      publishedAt: string | null;
      changes: boolean;
      stale: boolean;
    }[];
    canPublish: boolean;
    pools: LabelledId[];
    reviews: {
      mpId: number;
      version: number;
      poolId: string;
      allowUnlistedMaps: boolean;
      excludedScores: NonNullable<StatisticsSnapshot["excludedScores"]>;
      rosterTeamGames: number[];
      technicalAdjudication: boolean;
      adjudication: StatisticsSnapshot["adjudication"];
      excludedGames: StatisticsSnapshot["excludedGames"];
      reviewedBy: number | null | undefined;
      reviewedAt: string | null | undefined;
      evidenceUrl: string | null | undefined;
      complete: boolean;
      fetchedAt: string;
      warnings: string[];
      games: {
        game: MatchGame;
        included: boolean;
        nonParticipantIds: number[];
        issues: string[];
      }[];
    }[];
    blockers: string[];
  };
};
