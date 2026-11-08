import { z } from "zod";

const nullableNumber = z.union([z.null(), z.number()]);
const nullableString = z.union([z.null(), z.string()]);
export const draftIdentityReadContract = z.strictObject({
  osuId: z.number(),
  username: z.string(),
  // Read-time overlay projection. Older persisted snapshots omit it.
  profile: z
    .strictObject({
      avatarUrl: nullableString,
      pp: nullableNumber,
      globalRank: nullableNumber,
      status: z.union([
        z.literal("loading"),
        z.literal("fresh"),
        z.literal("unavailable"),
      ]),
      fetchedAt: nullableString,
    })
    .optional(),
});
const identity = draftIdentityReadContract;
export const draftTeamReadContract = z.strictObject({
  id: z.string(),
  name: z.string(),
  captain: identity,
});
const team = draftTeamReadContract;
const core = {
  sessionId: z.string(),
  version: z.number(),
  state: z.union([
    z.literal("live"),
    z.literal("completed"),
    z.literal("setup"),
    z.literal("ready"),
    z.literal("paused"),
    z.literal("finalized"),
    z.literal("aborted"),
  ]),
  turnIndex: z.number(),
  turnCount: z.number(),
  activeTeam: z.union([z.null(), team]),
  picks: z.array(
    z.strictObject({
      id: z.string(),
      turnIndex: z.number(),
      team,
      player: identity,
    }),
  ),
  rosters: z.array(z.strictObject({ team, players: z.array(identity) })),
};
const pool = z.union([z.null(), z.array(identity)]);
export const draftBoardReadContract = z.strictObject({ ...core, pool });
export const captainBoardReadContract = draftBoardReadContract.extend({
  // Snapshots published before roster capacity was included omit this field.
  capacities: z.record(z.string(), nullableNumber).optional(),
  engineRevision: z.number(),
  turnSequence: z.array(z.string()),
  eligiblePool: z.array(identity),
});
export const draftReadContracts = {
  publicDraft: z.union([z.null(), z.strictObject({ pool, ...core })]),
  publicBroadcastDraft: z.union([z.null(), draftBoardReadContract]),
  captainDraft: z.union([z.null(), captainBoardReadContract]),
} as const;
