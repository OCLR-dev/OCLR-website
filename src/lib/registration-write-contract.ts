import { z } from "zod";
import { siteRegistrationReadContracts } from "./site-registration-read-contracts";
import {
  defaultJsonBodyLimit,
  registrationBodyLimit,
} from "./request-body-limits";
import {
  browserWriteError,
  type WriteApiOperation,
} from "./write-api-contract";

const browserPost = { access: "browser", method: "POST" } as const;
const commonErrors = {
  401: "An active browser session is required.",
  403: "Origin or authentication channel rejected.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};

const receipt = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "deferred", "accepted", "rejected", "withdrawn"]),
});
export type RegistrationReceipt = z.output<typeof receipt>;
const pendingReceipt = receipt.extend({ status: z.literal("pending") });
const withdrawnReceipt = receipt.extend({ status: z.literal("withdrawn") });
const participationTimestamp = { updatedAt: z.iso.datetime() };
export const registrationFieldError = browserWriteError.extend({
  field: z.string(),
});

export const submitRegistrationWrite = {
  ...browserPost,
  id: "submitRegistration",
  path: "/api/tournaments/{edition}/registrations",
  maxBodyBytes: registrationBodyLimit,
  request: z
    .object({
      rulesAcknowledged: z.literal(true).optional(),
      eligibilityAcknowledged: z.literal(true).optional(),
      rulesVersion: z.string().min(1).max(80).nullable().optional(),
      reapply: z
        .object({
          expectedUpdatedAt: z.iso.datetime(),
          attempt: z.number().int().positive(),
        })
        .strict()
        .optional(),
      configurationVersion: z.number().int().nonnegative(),
      answers: z.record(z.string(), z.string()).default({}),
    })
    .strict(),
  summary: "Submit or reapply for tournament registration",
  description:
    "Applies as the signed-in player. The saved tournament controls the window, questions, acknowledgments, and eligibility checks. Reapplication requires the prior withdrawal attempt and timestamp. The server checks the configuration revision and applies the transition once. Refresh the dashboard after an uncertain response.",
  successStatus: 201,
  successDescription: "The new or renewed application is pending.",
  response: pendingReceipt,
  errors: {
    ...commonErrors,
    400: "Invalid request, answer, acknowledgment, or eligibility result.",
    404: "The published tournament was not found.",
    409: "Registration is closed, the application already exists, or a revision changed.",
    503: "Site, privacy configuration, or eligibility verification is unavailable.",
  },
  errorResponses: { 400: z.union([registrationFieldError, browserWriteError]) },
  consumers: ["src/components/application-form.tsx"],
} as const satisfies WriteApiOperation;

const confirmation = z.object({ confirmed: z.literal(true) }).strict();
const registrationId = { id: z.uuid() };
export const registrationParticipationInput = confirmation.extend({
  expectedUpdatedAt: z.iso.datetime(),
});
export type RegistrationParticipationInput = z.input<
  typeof registrationParticipationInput
>;

export const withdrawRegistrationWrite = {
  ...browserPost,
  id: "withdrawRegistration",
  path: "/api/registrations/{id}/withdraw",
  parameters: registrationId,
  maxBodyBytes: defaultJsonBodyLimit,
  request: confirmation,
  summary: "Withdraw the signed-in player's registration",
  description:
    "Applies only to the owner's registration while self-withdrawal is open. Assigned captains and roster members require staff review. Repeating a completed withdrawal returns a conflict.",
  successStatus: 200,
  successDescription: "The application is withdrawn.",
  response: withdrawnReceipt,
  errors: {
    ...commonErrors,
    404: "The owned application was not found.",
    409: "Self-withdrawal is unavailable or requires staff review.",
  },
  consumers: ["src/app/dashboard/page.tsx"],
} as const satisfies WriteApiOperation;

const participationChange = {
  ...browserPost,
  parameters: registrationId,
  maxBodyBytes: 1024,
  request: registrationParticipationInput,
  successStatus: 200,
  consumers: ["src/components/registration-removal.tsx"],
} as const;

export const removeRegistrationWrite = {
  ...participationChange,
  id: "removeRegistration",
  path: "/api/admin/tournaments/{edition}/registrations/{id}/remove",
  summary: "Remove an application from tournament participation",
  description:
    "Requires the edition's manage_registrations capability. Records a staff withdrawal with an audit event and retains the application. The expected timestamp guards against concurrent changes. An already withdrawn application or assigned player is rejected.",
  successDescription: "The application is withdrawn with its new timestamp.",
  response: withdrawnReceipt.extend(participationTimestamp),
  errors: {
    ...commonErrors,
    403: "Origin, authentication channel, or edition capability rejected.",
    404: "The edition application was not found.",
    409: "The application changed, was already withdrawn, or has an assignment.",
  },
} as const satisfies WriteApiOperation;

export const restoreRegistrationWrite = {
  ...participationChange,
  id: "restoreRegistration",
  path: "/api/admin/tournaments/{edition}/registrations/{id}/restore",
  summary: "Restore a staff-removed application for review",
  description:
    "Requires the edition's manage_registrations capability, matching update timestamp, and staff removal provenance. Records a transition to pending. Completed editions and players with conflicting assignments are rejected.",
  successDescription: "The application is pending with its new timestamp.",
  response: pendingReceipt.extend(participationTimestamp),
  errors: {
    ...commonErrors,
    403: "Origin, authentication channel, or edition capability rejected.",
    404: "The edition application was not found.",
    409: "The application changed or is ineligible for restoration.",
  },
} as const satisfies WriteApiOperation;

export const reviewRegistrationWrite = {
  ...browserPost,
  id: "reviewRegistration",
  path: "/api/admin/registrations/{id}/review",
  parameters: registrationId,
  maxBodyBytes: defaultJsonBodyLimit,
  request: registrationParticipationInput.extend({
    status: z.enum(["accepted", "rejected", "deferred", "pending"]),
    reason: z.string().trim().max(1000).default(""),
  }),
  summary: "Review a pending or deferred registration",
  description:
    "Requires the registration edition's manage_registrations capability. Rejection requires a reason. The current update timestamp is checked in the transaction. A successful review and its audit event commit together.",
  successStatus: 200,
  successDescription:
    "Updated application with its existing answers and acknowledgment data.",
  response: receipt.extend({
    editionSlug: z.string(),
    userId: z.number(),
    source: z.enum(["player", "staff"]),
    rulesVersion: z.string().nullable(),
    eligibilityAcknowledged: z.boolean().nullable(),
    eligibilityVerification: siteRegistrationReadContracts.ownEligibility,
    configurationVersion: z.number().nullable(),
    answers: z.record(z.string(), z.string()),
    attempt: z.number(),
    statusReason: z.string().nullable(),
    draftUnavailableReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
  errors: {
    ...commonErrors,
    400: "Invalid registration ID, review command, or rejection reason.",
    403: "Origin, authentication channel, or edition capability rejected.",
    404: "The application was not found.",
    409: "The application changed, its current status disallows the transition, or the edition is locked.",
  },
  consumers: ["src/components/review-form.tsx"],
} as const satisfies WriteApiOperation;

export type ReviewedRegistration = Omit<
  z.output<typeof reviewRegistrationWrite.response>,
  "createdAt" | "updatedAt"
> & { createdAt: Date; updatedAt: Date };
