import type {
  AwardPolicy,
  AwardStanding,
  AwardTier,
  AwardWeek,
} from "./award-model";
import type { ScoringRules } from "./competition-model";
import type { CompetitionDetailReadContracts } from "./competition-detail-read-contracts";
import type { DraftBoard, CaptainBoard, DraftState } from "./draft-types";
import type { EditionConfiguration } from "./editions";
import type { z } from "zod";
import type { ratingReadContracts } from "./rating-read-contracts";
import type { BeatmapMetadata, MappoolCategory } from "./mappool-model";
import type { SkillsetTag } from "./mappool-skillsets";
import type { RefereePolicy } from "./referee-model";

type Identity = { osuId: number; username: string };
type LabelledId = { id: string; name: string };
type RoundSummary = LabelledId & {
  stage: "group" | "knockout" | "exhibition";
  position: number;
};
type PoolRules = {
  fmMode: "free_mod" | "force_mod" | null;
  fmRestrictions: string;
};
export type RoundRefereeRule = {
  roundId: string;
  revision: number;
  policy: RefereePolicy | null;
  series: ScoringRules["series"] | null;
};
export type AwardReport = AwardWeek &
  AwardStanding & {
    policy: string;
    timeZone: string;
    fingerprint: string;
    identities: { userId: number; username: string; public: boolean }[];
  };

type DraftRecords = {
  session: {
    id: string;
    editionSlug: string;
    state: DraftState;
    version: number;
    turnIndex: number;
    turnSequence: string[];
    pool: number[];
    publicVersion: number;
    publishedRevision: number;
    publicSnapshot: DraftBoard | null;
    captainSnapshot: CaptainBoard | null;
  } | null;
  edition: {
    slug: string;
    configuration: EditionConfiguration | null;
    configurationVersion: number;
    createdAt: Date;
    configurationUpdatedAt: Date;
    lockedAt: Date | null;
    registrationPausedAt: Date | null;
    setupVersion: number;
    poolPublished: boolean;
  } | null;
  teams: {
    team: {
      id: string;
      editionSlug: string;
      captainId: number;
      avatarKey: string | null;
      name: string;
      capacity: number | null;
      identityPublished: boolean;
      rosterPublished: boolean;
      finalizedAt: Date | null;
      archivedAt: Date | null;
    };
    captainName: string;
    captainPublished: boolean;
  }[];
  members: {
    membership: {
      id: string;
      editionSlug: string;
      teamId: string;
      userId: number;
      origin: string;
      joinedAt: Date;
      leftAt: Date | null;
    };
    username: string;
  }[];
  picks: {
    id: string;
    sessionId: string;
    turnIndex: number;
    teamId: string;
    captainId: number;
    playerId: number;
    actorId: number;
    mode: "captain_direct" | "staff_on_behalf";
    requestKey: string;
    requestHash: string;
    revision: number;
    voidedAt: Date | null;
    createdAt: Date;
  }[];
  identities: Identity[];
};

export type StaffWorkspaceReadContracts = {
  mappoolWorkspace: {
    refereeRules?: RoundRefereeRule[];
    rounds: (RoundSummary & { version: number })[];
    pools: (LabelledId & { roundId: string } & PoolRules & {
        version: number;
        publishedAt: Date | null;
        lockedAt: Date | null;
        selectionLockedAt: Date | null;
        showcaseAt: Date | null;
        updatedAt: Date;
      })[];
    entries: (CompetitionDetailReadContracts["publicMappools"][number]["entries"][number] & {
      metadataFetchedAt: Date;
    })[];
  };
  selectionWorkspace: {
    candidates: {
      roundIds: string[];
      id: string;
      beatmapId: number;
      category: MappoolCategory | "unassigned";
      skillsetTags: SkillsetTag[];
      skillsetVersion: number;
      metadata: BeatmapMetadata;
      metadataFetchedAt: Date;
      authorId: number;
      authorName: string;
      createdAt: Date;
      commentCount: number;
    }[];
    rounds: RoundSummary[];
    asOf: Date;
    archived: boolean;
  };
  staffDraft: {
    canConfigure: boolean;
    availablePool: Identity[];
    setupPoolSize: number | null;
  } & DraftRecords;
  awardWorkspace: {
    tiers: AwardTier[];
    participants: {
      userId: number;
      username: string;
      status: "pending" | "deferred" | "accepted" | "rejected" | "withdrawn";
    }[];
    reports: AwardReport[];
    releases: {
      id: string;
      editionSlug: string;
      week: number;
      revision: number;
      fingerprint: string;
      report: AwardReport;
      publishedBy: number;
      publishedAt: Date;
      active: boolean;
    }[];
    weeks: AwardWeek[];
    policy: AwardPolicy;
    roundRatings: z.infer<typeof ratingReadContracts.publicRoundRatings>;
    edition: { slug: string; name: string; timeZone: string };
    version: number;
  };
};
