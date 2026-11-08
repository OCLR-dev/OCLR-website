import type { Edition, EditionConfiguration } from "./editions";
import type { EligibilityVerification } from "./eligibility-model";
import type { PublicNewsItem } from "./public-news-model";

export type SavedTournament = {
  edition: Edition;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  registrationPaused: boolean;
};

type PublicEdition = Pick<
  Edition,
  | "slug"
  | "name"
  | "season"
  | "branding"
  | "defaultAppearance"
  | "published"
  | "status"
  | "summary"
  | "timeZone"
  | "archive"
  | "rules"
  | "eligibility"
  | "schedule"
> & {
  registration:
    | (Pick<
        NonNullable<Edition["registration"]>,
        "enabled" | "opensAt" | "closesAt" | "withdrawUntil"
      > & { questions: [] })
    | null;
};

type PublicConfiguration = Omit<SavedTournament, "edition"> & {
  edition: PublicEdition;
};

type RegistrationRecord = {
  id: string;
  editionSlug: string;
  userId: number;
  status: "pending" | "deferred" | "accepted" | "rejected" | "withdrawn";
  source: "player" | "staff";
  rulesVersion: string | null;
  eligibilityAcknowledged: boolean | null;
  eligibilityVerification: EligibilityVerification | null;
  configurationVersion: number | null;
  answers: Record<string, string>;
  attempt: number;
  statusReason: string | null;
  draftUnavailableReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RegistrationReadOperation =
  "staff_remove" | "staff_restore" | "player_withdraw" | "player_reapply";

type RegistrationWithConfiguration = {
  registration: RegistrationRecord;
  lastOperation: RegistrationReadOperation | null;
  acknowledgedConfiguration: EditionConfiguration | null;
};

export type ConfigurationReadContracts = {
  publicEnrollment: PublicConfiguration;
  privateSavedTournament: SavedTournament;
  publicNewsModel: { editions: Edition[]; items: PublicNewsItem[] };
  ownRegistrationForm: SavedTournament | PublicConfiguration;
  tournamentForAdmin: {
    applications: number;
    readiness: { label: string; ready: boolean }[];
    links: { href: string; label: string; group: string; exact: boolean }[];
  } & SavedTournament;
  applicationDetails: {
    attempts: {
      attempt: number;
      snapshot: Omit<RegistrationRecord, "createdAt" | "updatedAt"> & {
        createdAt: string;
        updatedAt: string;
      };
      configuration: EditionConfiguration | null;
    }[];
    username: string;
  } & RegistrationWithConfiguration;
  playerApplications: ({
    captainAssigned: boolean;
  } & RegistrationWithConfiguration & {
      edition: Edition | undefined;
      withdrawable: boolean;
      reapplyAvailable: boolean;
    })[];
};
