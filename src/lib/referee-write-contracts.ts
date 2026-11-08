import { z } from "zod";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { refereeSettingsSchema } from "./referee-commands";
import { refereeActionSchema, refereePolicySchema } from "./referee-model";
import { defaultJsonBodyLimit } from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

const common = {
  requestKey: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  dependencyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
};
export const refereeCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("save_settings"),
      settings: refereeSettingsSchema,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("configure_policy"),
      expectedPolicyRevision: z.number().int().nonnegative(),
      policy: refereePolicySchema,
    })
    .strict(),
  z.object({ ...common, action: z.literal("reconfirm_dependencies") }).strict(),
  ...refereeActionSchema.options.map((option) => option.extend(common)),
]);
export type RefereeCommand = z.infer<typeof refereeCommandSchema>;

const version = z.number().int().nonnegative();
const mpRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z
    .object({
      action: z.literal("bind"),
      match: z.string().trim().min(1).max(250),
      expectedRevision: version,
      expectedSessionRevision: version,
      dependencyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("bind_room"),
      expectedRoomId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      expectedRevision: version,
      expectedSessionRevision: version,
      dependencyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ action: z.literal("unbind"), expectedRevision: version }).strict(),
  z
    .object({
      action: z.literal("sync"),
      expectedRevision: version,
      expectedRoomId: z
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER)
        .optional(),
    })
    .strict(),
]);

const reconciliationRequest = z
  .object({
    requestKey: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    expectedSessionRevision: z.number().int().nonnegative(),
    dependencyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    attemptId: z.uuid(),
    importId: z.uuid().nullable(),
    sourceFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    gameId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  })
  .strict()
  .refine((v) =>
    v.importId === null
      ? v.gameId === null && v.sourceFingerprint === null
      : v.gameId !== null && v.sourceFingerprint !== null,
  );

export const refereeEventReceipt = z.object({
  requestKey: z.uuid(),
  revision: version,
  eventId: z.uuid(),
});
export const refereeReconciliationReceipt = z.object({
  id: z.uuid(),
  revision: version,
});

const nullableId = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
export const refereeMpBindingResponse = z
  .object({
    matchId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    revision: version,
    enabled: z.boolean(),
    lastCheckedAt: z.iso.datetime().nullable(),
    nextPollAt: z.iso.datetime(),
    error: z.string().nullable(),
    issues: z.array(
      z.object({
        gameId: nullableId,
        beatmapId: nullableId,
        reason: z.enum([
          "replay",
          "unmatched",
          "incomplete",
          "rules",
          "ambiguous",
          "source_changed",
          "dependencies",
          "already_used",
        ]),
      }),
    ),
    issueCount: version,
    syncing: z.boolean(),
  })
  .nullable();

export type RefereeCommandResult = {
  receipt: z.output<typeof refereeEventReceipt>;
  workspace: ExplicitReadData<"refereeWorkspace">;
};
export type RefereeReconciliationResult = {
  receipt: z.output<typeof refereeReconciliationReceipt>;
  workspace: ExplicitReadData<"refereeReconciliation">;
};
export type RefereeMpView = {
  workspace: ExplicitReadData<"refereeWorkspace">;
  binding: z.output<typeof refereeMpBindingResponse>;
};

const base = "/api/admin/tournaments/{edition}/matches/{fixtureId}/referee";
const browser = {
  access: "browser",
  successStatus: 200,
  maxBodyBytes: defaultJsonBodyLimit,
  parameters: { fixtureId: z.uuid() },
} as const;
const commonErrors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, assignment, or edition capability rejected.",
  404: "The fixture, edition or related record was not found.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};

export const changeRefereeWorkspaceWrite = {
  ...browser,
  id: "changeRefereeWorkspace",
  path: base,
  method: "PATCH",
  request: refereeCommandSchema,
  summary: "Save referee settings and record provisional fixture events",
  description:
    "Requires record_results and fixture access. Commands check the current session revision and dependency fingerprint. Policy changes also check the policy revision and configuration capability. Repeating the same request key and payload returns the original event receipt with the current workspace.",
  successDescription:
    "Event receipt and the current private referee workspace.",
  response: {
    properties: {
      receipt: refereeEventReceipt,
      workspace: { readResource: "refereeWorkspace" },
    },
  },
  errors: {
    ...commonErrors,
    400: "Invalid referee settings or command.",
    409: "The revision, dependencies, progression state, or request key conflicts with current state.",
  },
  consumers: ["src/components/referee-panel.tsx"],
} as const satisfies WriteApiOperation;

export const changeRefereeMpWrite = {
  ...browser,
  id: "changeRefereeMp",
  path: `${base}/mp`,
  method: "POST",
  request: mpRequest,
  summary: "Bind, inspect or synchronize a referee multiplayer source",
  description:
    "Requires a direct browser session and fixture access. Status does not poll the provider. Bind and bind_room check the binding and session revisions and dependency fingerprint. Sync checks the current binding and optional IRC room, observes cooldown and lease rules, and records only provisional scores. Provider failures during sync are recorded in binding.error.",
  successDescription: "Current referee workspace and nullable MP binding.",
  response: {
    properties: {
      workspace: { readResource: "refereeWorkspace" },
      binding: refereeMpBindingResponse,
    },
  },
  errors: {
    ...commonErrors,
    400: "Invalid command or multiplayer link.",
    409: "The room, binding, session revision, or dependencies changed.",
    502: "The retrieved match does not match the current binding.",
  },
  consumers: [
    "src/components/referee-mp.tsx",
    "src/components/referee-panel.tsx",
  ],
} as const satisfies WriteApiOperation;

export const reconcileRefereeAttemptWrite = {
  ...browser,
  id: "reconcileRefereeAttempt",
  path: `${base}/reconciliation`,
  method: "POST",
  request: reconciliationRequest,
  summary: "Link or unlink saved multiplayer evidence for a referee attempt",
  description:
    "Requires a direct browser session and current referee assignment or authorized staff access. A link includes import ID, source fingerprint and game ID together. An unlink sets all three to null. The transaction checks current revisions and dependencies. An identical request key replays the original receipt. Linking does not publish an official result.",
  successDescription:
    "Reconciliation receipt and the current private reconciliation workspace.",
  response: {
    properties: {
      receipt: refereeReconciliationReceipt,
      workspace: { readResource: "refereeReconciliation" },
    },
  },
  errors: {
    ...commonErrors,
    400: "Invalid command or game selection.",
    409: "The workspace, source, attempt, or request key conflicts with current state.",
  },
  consumers: ["src/components/referee-reconciliation.tsx"],
} as const satisfies WriteApiOperation;
