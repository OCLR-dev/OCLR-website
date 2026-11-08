import { z } from "zod";
import { replaySummarySchema } from "./replay-model";
import { siteRegistrationReadContracts } from "./site-registration-read-contracts";
import { playerLeaderboardReadContract } from "./player-leaderboard-model";
import { publicBracketReadContract } from "./bracket-read-contract";
import { ratingReadContracts } from "./rating-read-contracts";
import { publicPlayerParticipationReadContract } from "./player-participation-contract";
import { draftReadContracts } from "./draft-read-contracts";
import { savedProfileReadContract } from "./profile-read-contract";
import { operationsReadContracts } from "./operations-read-contracts";
import { publicCompetitionReadContract } from "./competition-read-contracts";

const identity = { osuId: z.number(), username: z.string() };
const nullableString = z.union([z.null(), z.string()]);
const nullableDate = z.union([z.null(), z.date()]);
const appointment = {
  userId: z.number(),
  username: z.string(),
  position: z.number(),
  published: z.boolean(),
};
const team = {
  id: z.string(),
  editionSlug: z.string(),
  captainId: z.number(),
  avatarKey: nullableString,
  name: z.string(),
  capacity: z.union([z.null(), z.number()]),
  identityPublished: z.boolean(),
  rosterPublished: z.boolean(),
};

const candidates = z.array(
  z.strictObject({
    userId: z.number(),
    username: z.string(),
    unavailableReason: nullableString,
  }),
);
const captainSetup = z.strictObject({
  version: z.number(),
  locked: z.boolean(),
  availabilityLocked: z.boolean(),
  poolPublished: z.boolean(),
  captains: z.array(
    z.strictObject({
      teamId: nullableString,
      teamName: nullableString,
      ...appointment,
    }),
  ),
  candidates,
  pool: candidates,
});
const captainAppointment = z.union([
  z.null(),
  z.strictObject({
    editionSlug: z.string(),
    userId: appointment.userId,
    position: appointment.position,
    published: appointment.published,
  }),
]);
const captainIdentities = z.record(
  z.string(),
  z.strictObject({
    avatarUrl: nullableString,
    countryCode: nullableString,
    countryName: nullableString,
  }),
);
const teamIdentity = { teamId: z.string(), ...identity };
const staffTeams = z.strictObject({
  version: z.number(),
  locked: z.boolean(),
  coachesEnabled: z.boolean(),
  teams: z.array(
    z.strictObject({
      coaches: z.array(z.strictObject(teamIdentity)),
      members: z.array(z.strictObject({ ...teamIdentity, origin: z.string() })),
      ...team,
      finalizedAt: nullableDate,
      archivedAt: nullableDate,
    }),
  ),
});
const ownTeam = z.union([
  z.null(),
  z.strictObject({
    finalizedAt: nullableDate,
    members: z.array(z.strictObject(identity)),
    ...team,
    archivedAt: nullableDate,
  }),
]);

const publicStaff = z.array(
  z.strictObject({
    ...identity,
    countryCode: z.union([z.null(), z.string()]),
    roles: z.array(
      z.strictObject({
        role: z.string(),
        edition: z.union([
          z.null(),
          z.strictObject({ slug: z.string(), name: z.string() }),
        ]),
      }),
    ),
  }),
);

const publicCaptains = z.array(
  z.strictObject({ ...identity, position: z.number() }),
);

const publishedTeams = z.array(
  z.strictObject({
    coaches: z.array(z.strictObject(identity)),
    id: z.string(),
    name: z.string(),
    avatarKey: z.union([z.null(), z.string()]),
    captainId: z.number(),
    captainName: z.string(),
    finalized: z.boolean(),
    members: z.union([
      z.null(),
      z.array(
        z.strictObject({
          ...identity,
          countryCode: z.union([z.null(), z.string()]),
          countryName: z.union([z.null(), z.string()]),
        }),
      ),
    ]),
  }),
);

const replayList = z.array(
  z.strictObject({
    verification: z.union([z.literal("matched"), z.literal("unverified")]),
    id: z.string(),
    entryId: z.string(),
    sha256: z.string(),
    filename: z.string(),
    size: z.number(),
    description: z.string(),
    uploaderId: z.number(),
    uploaderName: z.string(),
    summary: replaySummarySchema,
    createdAt: z.date(),
  }),
);
const publicPlayerMessages = z.array(
  z.strictObject({
    id: z.string(),
    authorId: z.number(),
    author: z.string(),
    text: z.string(),
    createdAt: z.string(),
    version: z.string(),
  }),
);
const publicPlayerMra = z.strictObject({
  mra: z.union([z.null(), z.number()]),
  state: z.union([z.literal("pending"), z.literal("ready")]),
  calculatedAt: nullableString,
});
const candidateComments = z.array(
  z.strictObject({
    id: z.string(),
    authorId: z.number(),
    authorName: z.string(),
    body: z.string(),
    version: z.string(),
    createdAt: z.date(),
  }),
);
const candidateHistory = z.strictObject({
  beatmapId: z.number(),
  matches: z.array(
    z.strictObject({
      editionSlug: z.string(),
      editionName: z.string(),
      season: nullableString,
      poolId: z.string(),
      poolName: z.string(),
      roundName: nullableString,
      slot: z.string(),
      matchedBy: z.union([z.literal("beatmap"), z.literal("original")]),
    }),
  ),
});

export const explicitReadContracts = {
  ...siteRegistrationReadContracts,
  ...ratingReadContracts,
  ...draftReadContracts,
  ...operationsReadContracts,
  ownSavedProfile: savedProfileReadContract,
  publicStaff,
  publicCaptains,
  publishedTeams,
  replayList,
  captainSetup,
  captainAppointment,
  captainIdentities,
  staffTeams,
  ownTeam,
  publicPlayerMessages,
  publicPlayerMra,
  publicPlayerParticipation: publicPlayerParticipationReadContract,
  playerLeaderboard: playerLeaderboardReadContract,
  publicBracket: publicBracketReadContract,
  publicCompetition: publicCompetitionReadContract,
  candidateComments,
  candidateHistory,
} as const;

export type ExplicitReadData<Id extends keyof typeof explicitReadContracts> =
  z.infer<(typeof explicitReadContracts)[Id]>;
