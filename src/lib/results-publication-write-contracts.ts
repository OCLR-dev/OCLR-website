import { z } from "zod";
import { archiveEvidenceUrl } from "./archive-metadata";
import { awardConfigurationSchema, awardPolicySchema } from "./award-model";
import { defaultJsonBodyLimit } from "./request-body-limits";
import {
  statisticsAdjudicationSchema,
  statisticsExcludedGameSchema,
  statisticsExcludedScoresSchema,
} from "./statistics-snapshot";
import type { WriteApiOperation } from "./write-api-contract";

const common = {
  expectedVersion: z.number().int().nonnegative(),
  confirmed: z.literal(true),
};
const awardRequest = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("configure"),
      ...awardConfigurationSchema.shape,
      policy: awardPolicySchema.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("publish"),
      week: z.number().int().positive(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("unpublish"),
      week: z.number().int().positive(),
      releaseId: z.uuid(),
    })
    .strict(),
]);

const integer = z.number().int().nonnegative();
const statisticsRequest = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("import"),
      mpId: integer.positive(),
      expectedVersion: integer,
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      mpId: integer.positive(),
      expectedVersion: integer,
      poolId: z.string().max(80),
      included: z.array(integer.positive()).max(500),
      allowUnlistedMaps: z.boolean().default(false),
      excludedScores: statisticsExcludedScoresSchema.default([]),
      rosterTeamGames: z.array(integer.positive()).max(500).default([]),
      technicalAdjudication: z.boolean().optional(),
      adjudication: statisticsAdjudicationSchema.nullable().optional(),
      excludedGames: z.array(statisticsExcludedGameSchema).max(500).optional(),
      evidenceUrl: archiveEvidenceUrl.nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["publish", "withdraw"]),
      fixtureId: z.string().max(80),
      expectedVersions: z.record(z.string(), integer),
      confirmed: z.literal(true),
    })
    .strict(),
]);

const browserPost = {
  method: "POST",
  access: "browser",
  successStatus: 200,
} as const;
const commonErrors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, or edition capability rejected.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};

export const changeAwardsWrite = {
  ...browserPost,
  id: "changeAwards",
  path: "/api/admin/tournaments/{edition}/awards",
  maxBodyBytes: 512 * 1024,
  request: awardRequest,
  summary: "Configure, publish, or withdraw a weekly award report",
  description:
    "Configuration requires configure_tournament. Publication and withdrawal require publish_results. Every command checks the settings version. Publication also checks the current report fingerprint and winner publication prerequisites. Publishing the same active fingerprint adds no second release or audit event. Withdrawal checks the active release ID.",
  successDescription: "The current staff award workspace.",
  response: { readResource: "awardWorkspace" },
  errors: {
    ...commonErrors,
    400: "Invalid award command or week configuration.",
    404: "The edition was not found.",
    409: "The settings revision, release, source fingerprint, or publication prerequisites changed.",
  },
  consumers: ["src/components/award-manager.tsx"],
} as const satisfies WriteApiOperation;

export const changeHistoricalStatisticsWrite = {
  ...browserPost,
  id: "changeHistoricalStatistics",
  path: "/api/admin/tournaments/{edition}/statistics",
  maxBodyBytes: defaultJsonBodyLimit,
  request: statisticsRequest,
  summary: "Import, review, publish, or withdraw historical match statistics",
  description:
    "Uses MP links already recorded in the edition archive. Import and review require record_results. Publishing, withdrawal and reviews with special adjudication require approve_results. Version checks protect each saved source or the full fixture release. Imported and reviewed records stay private until publication. The legacy technicalAdjudication flag is still accepted.",
  successDescription:
    "The current staff statistics workspace for the affected fixture.",
  response: { readResource: "statisticsWorkspace" },
  errors: {
    ...commonErrors,
    400: "Invalid command, unrecorded match or fixture, or invalid review or publication evidence.",
    404: "Historical statistics or the upstream MP resource was not found.",
    409: "The archive, source version, review, or publication state changed.",
    413: "The request body or upstream MP history exceeds its size limit.",
    429: "An MP refresh is cooling down or the osu! lookup is rate limited.",
    502: "The upstream osu! response was unavailable or invalid.",
    503: "Site or provider configuration is unavailable, or the import time budget was reached.",
    504: "The osu! request timed out.",
  },
  consumers: ["src/components/statistics-manager.tsx"],
} as const satisfies WriteApiOperation;
