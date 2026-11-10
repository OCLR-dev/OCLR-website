import { fixtureStatuses } from "./fixture-status";
import { z } from "zod";
import {
  groupConfigurationInputSchema,
  scoringRulesSchema,
  standingsRulesSchema,
  validTimeZone,
} from "./competition-model";
import { exhibitionNamesSchema } from "./exhibition-sides";
import {
  forceDeleteCountKeys,
  type FixtureForceDeletePreview,
} from "./fixture-force-delete-model";
import { refereePolicySchema } from "./referee-model";
import { defaultJsonBodyLimit } from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

const confirmation = {
  confirmed: z.literal(true),
};
const fixtureFields = {
  label: z.string().trim().min(1).max(100),
  roundId: z.uuid(),
  homeTeamId: z.uuid().nullable(),
  awayTeamId: z.uuid().nullable(),
  exhibitionNames: exhibitionNamesSchema.nullable().optional(),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  timeZone: z.string().trim().max(80).refine(validTimeZone),
  status: z.enum(fixtureStatuses),
  mappoolId: z.uuid().nullable(),
  position: z.number().int().min(1).max(999),
  homeSourceId: z.uuid().nullable(),
  homeSourceOutcome: z.enum(["winner", "loser"]).nullable(),
  awaySourceId: z.uuid().nullable(),
  awaySourceOutcome: z.enum(["winner", "loser"]).nullable(),
};
const refereeIdsSchema = z
  .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length);
export const fixtureCommandInput = z.discriminatedUnion("action", [
  z
    .object({
      ...confirmation,
      action: z.literal("force_delete"),
      fixtureId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      expectedAssignmentRevision: z.number().int().nonnegative(),
      expectedDeletionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      confirmationLabel: z.string().min(1).max(100),
      testFixtureConfirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("delete"),
      fixtureId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      expectedAssignmentRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("stage_groups"),
      stageId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      configuration: groupConfigurationInputSchema.nullable(),
      published: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...fixtureFields,
      refereeIds: refereeIdsSchema.default([]),
      action: z.literal("create"),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...fixtureFields,
      action: z.literal("edit"),
      fixtureId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("publish"),
      fixtureId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      published: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("round_rules"),
      roundId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      expectedRefereePolicyRevision: z.number().int().nonnegative().optional(),
      scoringRules: scoringRulesSchema.partial({ version: true }).nullable(),
      standingsRules: standingsRulesSchema
        .partial({ version: true })
        .nullable(),
    })
    .strict(),
]);

const assignmentInput = z
  .object({
    expectedAssignmentRevision: z.number().int().nonnegative(),
    refereeIds: refereeIdsSchema,
  })
  .strict();

const roundRefereePolicyCommandSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    policy: refereePolicySchema,
    seriesChange: z
      .object({
        bestOf: z
          .number()
          .int()
          .min(1)
          .max(197)
          .refine((value) => value % 2 === 1),
        expectedRoundVersion: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const forceDeletePreviewInput = z.strictObject({
  action: z.literal("preview_force_delete"),
  fixtureId: z.uuid(),
});

export const forceDeletePreviewResponse = z.object({
  fixtureId: z.uuid(),
  label: z.string(),
  version: z.number().int().nonnegative(),
  assignmentRevision: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  blocker: z
    .enum(["official_result", "bracket", "published_statistics"])
    .nullable(),
  counts: z.record(
    z.enum(forceDeleteCountKeys),
    z.number().int().nonnegative(),
  ),
}) satisfies z.ZodType<FixtureForceDeletePreview>;

const browser = {
  access: "browser",
  successStatus: 200,
  maxBodyBytes: defaultJsonBodyLimit,
} as const;
const base = "/api/admin/tournaments/{edition}";
const commonErrors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, or edition capability rejected.",
  404: "The edition or requested fixture or round was not found.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};

export const changeFixturesWrite = {
  ...browser,
  id: "changeFixtures",
  path: `${base}/matches`,
  method: "POST",
  request: z.union([forceDeletePreviewInput, fixtureCommandInput]),
  summary: "Manage fixtures, group assignments and round rules",
  description:
    "Requires manage_fixtures. Normal changes return the staff fixture workspace. The force-delete preflight returns a versioned fingerprint, counts and any blocker. Force deletion requires that fingerprint, both fixture and assignment revisions, the exact label and explicit test-fixture confirmation. Approved result history, bracket dependents and published statistics are protected.",
  successDescription: "The staff fixture workspace or force-delete preflight.",
  response: {
    anyOf: [forceDeletePreviewResponse, { readResource: "staffFixtures" }],
  },
  errors: {
    ...commonErrors,
    400: "Invalid fixture fields, round or group rules, command, or deletion confirmation.",
    409: "The revision, publication state, dependency fingerprint, or a protected record prevents the change.",
  },
  consumers: [
    "src/components/competition-settings.tsx",
    "src/components/fixture-manager.tsx",
    "src/components/force-fixture-delete.tsx",
    "src/components/stage-groups.tsx",
  ],
} as const satisfies WriteApiOperation;

export const assignFixtureRefereesWrite = {
  ...browser,
  id: "assignFixtureReferees",
  path: `${base}/matches/{fixtureId}/referees`,
  method: "PATCH",
  parameters: { fixtureId: z.uuid() },
  request: assignmentInput,
  summary: "Replace the referee assignment list for a fixture",
  description:
    "Requires manage_fixtures and the current assignment revision. The list can be empty. The transaction rechecks that all distinct referees are eligible for the edition. The assignment revision is separate from the fixture and result versions.",
  successDescription: "The current staff fixture workspace.",
  response: { readResource: "staffFixtures" },
  errors: {
    ...commonErrors,
    400: "Invalid assignment revision or ineligible referee IDs.",
    409: "The assignment revision or edition state prevents the change.",
  },
  consumers: ["src/components/referee-assignment.tsx"],
} as const satisfies WriteApiOperation;

export const roundRefereePolicyWrite = {
  ...browser,
  id: "saveRoundRefereePolicy",
  path: `${base}/rounds/{roundId}/referee-policy`,
  method: "POST",
  parameters: { roundId: z.uuid() },
  request: roundRefereePolicyCommandSchema,
  summary:
    "Save a round referee policy and optionally change its best-of series",
  description:
    "Requires manage_fixtures and the current policy revision. An optional series change includes the current round version and an odd best-of value. Policy and scoring updates commit together. Started or protected fixtures constrain changes.",
  successDescription:
    "Saved policy, series, policy revision and round version.",
  response: z.object({
    revision: z.number().int().nonnegative(),
    policy: refereePolicySchema,
    series: scoringRulesSchema.shape.series.nullable(),
    roundVersion: z.number().int().nonnegative(),
  }),
  errors: {
    ...commonErrors,
    400: "Invalid policy, round ID, best-of, or incompatible round configuration.",
    409: "The policy or round revision changed, or an active or protected fixture prevents the change.",
  },
  consumers: ["src/components/round-referee-policy.tsx"],
} as const satisfies WriteApiOperation;

export type RoundRefereePolicyReceipt = z.output<
  typeof roundRefereePolicyWrite.response
>;
