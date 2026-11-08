import { z } from "zod";
import { replaySummarySchema } from "./replay-model";

const identity = { osuId: z.number(), username: z.string() };

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

export const explicitReadContracts = {
  publicStaff,
  publicCaptains,
  publishedTeams,
  replayList,
} as const;

export type ExplicitReadData<Id extends keyof typeof explicitReadContracts> =
  z.infer<(typeof explicitReadContracts)[Id]>;
