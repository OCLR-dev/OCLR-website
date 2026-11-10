import type {
  GroupConfiguration,
  ScoringRules,
  StandingsRules,
} from "./competition-model";
import type { ExhibitionSides } from "./exhibition-sides";
import type { FixtureStatus } from "./fixture-status";
import type { BeatmapMetadata, MappoolCategory } from "./mappool-model";
import type {
  MatchImportPreview,
  MatchSource,
  ReviewedResult,
} from "./match-model";
import type { RefereeSettings } from "./referee-commands";
import type {
  RefereeEvent,
  RefereeModelInput,
  RefereeOrders,
  RefereePolicy,
  RefereeProjection,
} from "./referee-model";

type Stage = "group" | "knockout" | "exhibition";
type Identity = { osuId: number; username: string };
type LabelledId = { id: string; name: string };
type Outcome = "winner" | "loser";
type Fixture = {
  id: string;
  editionSlug: string;
  roundId: string;
  label: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  scheduledAt: Date | null;
  timeZone: string;
  status: FixtureStatus;
  mappoolId: string | null;
  position: number;
  homeSourceId: string | null;
  homeSourceOutcome: Outcome | null;
  awaySourceId: string | null;
  awaySourceOutcome: Outcome | null;
  publishedAt: Date | null;
  assignmentRevision: number;
  streamRevision: number;
  version: number;
  updatedAt: Date;
};
type Round = {
  id: string;
  editionSlug: string;
  stageId: string;
  name: string;
  position: number;
  version: number;
  scoringRules: ScoringRules | null;
  standingsRules: StandingsRules | null;
};
type Result = {
  fixtureId: string;
  state: "draft" | "approved" | "submitted";
  version: number;
  currentRevision: number;
  latestImportId: string | null;
  publishedRevision: number | null;
  publishedAt: Date | null;
};
type OfficialTeam = LabelledId & { captainId: number; members: Identity[] };
type ExhibitionTeam = { captainId: null; members: Identity[] } & LabelledId;
type ReviewTeam = OfficialTeam | ExhibitionTeam;
type ReviewFixture = {
  exhibitionSides?: ExhibitionSides;
  openExhibition?: true;
  homeTeamId: string;
  awayTeamId: string;
} & Omit<Fixture, "homeTeamId" | "awayTeamId">;

type FixtureForReviewRead = {
  exDeclarations: { id: string; beatmapId: number; exMode: boolean }[];
  fixture: ReviewFixture;
  round: ({ stage: Stage } & Round) | undefined;
  teams: readonly [ReviewTeam, ReviewTeam];
  pool: {
    id: string;
    version: number;
    name: string;
    fmMode: "free_mod" | "force_mod" | null;
    fmRestrictions: string;
    entries: {
      beatmapId: number;
      category: MappoolCategory;
      position: number;
    }[];
  } | null;
  result: Result | null;
  canApprove: boolean;
  canRecord: boolean;
  canViewAll: boolean;
};

// The fixture foreign key supplies a round in the local review workflow.
// Preserve the wire schema's ability to read older payloads with an omitted round.
export type FixtureReviewContext = Omit<FixtureForReviewRead, "round"> & {
  round: NonNullable<FixtureForReviewRead["round"]>;
};

type ResultRevision = {
  proposal: ReviewedResult | null;
  fixtureId: string;
  revision: number;
  importId: string;
  reason: string | null;
  createdBy: number;
  createdAt: Date;
  approvedBy: number | null;
  approvedAt: Date | null;
};
export type MatchReview<
  Context extends FixtureForReviewRead = FixtureForReviewRead,
> = {
  context: Context;
  source: MatchSource | null;
  importId: string | null;
  sourceError: string | null;
  preview: MatchImportPreview | null;
  imports: {
    id: string;
    externalMatchId: number;
    fingerprint: string;
    createdBy: number;
    createdAt: Date;
  }[];
  revisions: ResultRevision[];
  current: ResultRevision | null;
  published: ResultRevision | null;
  diff: {
    added: number[];
    removed: number[];
    changed: number[];
    historyChanged: boolean;
  } | null;
  dependents: { id: string; label: string; published: boolean }[];
};

export type RefereeBasis = Pick<
  RefereeModelInput,
  | "policy"
  | "teamIds"
  | "maps"
  | "series"
  | "tiedMapPolicy"
  | "exPlayersPerTeam"
  | "skipBans"
>;

export type FixtureReadContracts = {
  staffFixtures: {
    eligibleReferees: Identity[];
    stages: {
      id: string;
      editionSlug: string;
      kind: Stage;
      version: number;
      groupConfiguration: GroupConfiguration | null;
      groupsPublishedAt: Date | null;
    }[];
    canManage: boolean;
    canViewAll: boolean;
    timeZone: string;
    fixtures: ({
      referees: Identity[];
      refereeIds: number[];
      result: Result | null;
      exhibitionSides?: ExhibitionSides;
    } & Fixture)[];
    rounds: { round: Round; stage: Stage }[];
    teams: ({ unpublished: boolean } & OfficialTeam)[];
    pools: (LabelledId & { roundId: string })[];
  };
  fixtureForReview: FixtureForReviewRead;
  matchReview: MatchReview;
  refereeWorkspace: {
    fixture: {
      version: number;
      openExhibition?: true;
      id: string;
      label: string;
      roundId: string;
      status: FixtureStatus;
      homeTeamId: string | null;
      awayTeamId: string | null;
    };
    round: LabelledId & { exhibition?: true };
    teams: (LabelledId & {
      captainId: number | null;
      captainUsername: string | null;
      members: Identity[];
    })[];
    defaultSettings: RefereeSettings;
    maps: {
      id: string;
      beatmapId: number;
      category: MappoolCategory;
      position: number;
      metadata: BeatmapMetadata;
    }[];
    rules: ScoringRules | null;
    series: ScoringRules["series"] | null;
    policy: RefereePolicy | null;
    policyRevision: number;
    session:
      | (RefereeOrders & {
          settings: RefereeSettings;
          dependencyFingerprint: string;
          basis: RefereeBasis;
          revision: number;
        })
      | null;
    events: RefereeEvent[];
    projection: RefereeProjection;
    dependencyFingerprint: string;
    readiness: string[];
    canRecord: boolean;
    canConfigure: boolean;
  };
};
