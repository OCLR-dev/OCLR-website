import { z } from "zod";
import { profileSnapshotReadContract } from "./profile-read-contract";
import { siteRegistrationReadContracts } from "./site-registration-read-contracts";
import {
  defaultJsonBodyLimit,
  MANUAL_BATCH_LIMIT,
  MANUAL_BATCH_TEXT_LIMIT,
} from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

const path = "/api/admin/tournaments/{edition}/registrations";
const browserPost = { access: "browser", method: "POST" } as const;
const consumers = ["src/components/manual-registration.tsx"];
const batchConsumers = ["src/components/bulk-manual-registration.tsx"];
const errors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, or edition capability rejected.",
  404: "The edition or osu! profile was not found.",
  409: "The edition is locked, frozen, completed, or its revision changed.",
  500: "Unexpected failure.",
  503: "Site, privacy configuration, or verified osu! profile is unavailable.",
};
const lookupErrors = {
  ...errors,
  429: "osu! lookup is rate limited.",
  502: "The upstream osu! response was unavailable or invalid.",
  504: "The osu! lookup timed out.",
};
const inputType = z.enum(["id", "username"]);
const lookup = z.strictObject({
  input: z.string().trim().min(1).max(300),
  inputType: inputType.default("id"),
});
const enrollment = {
  expectedRevision: z.number().int().nonnegative(),
  status: z.enum(["pending", "accepted"]),
  confirmed: z.literal(true),
  publicationAcknowledged: z.boolean().default(false),
  overrideWindow: z.boolean().default(false),
  exceptionReason: z.string().trim().max(1000).default(""),
};
const overrideEligibility = z.boolean().default(false);
const existing = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "deferred", "accepted", "rejected", "withdrawn"]),
});
const edition = z.object({
  slug: z.string(),
  name: z.string(),
  revision: z.number(),
  outsideWindow: z.boolean(),
});
const preview = z.object({
  profile: profileSnapshotReadContract.shape.profile,
  existing: existing.nullable(),
  verification: siteRegistrationReadContracts.ownEligibility,
  edition,
});
const previewRow = z.object({
  line: z.number(),
  raw: z.string(),
  input: z.string(),
  inputType,
  state: z.enum(["ready", "duplicate", "existing", "failed"]),
  preview: preview.nullable(),
  error: z.string().nullable(),
});
const batchResult = z.object({
  line: z.number(),
  osuId: z.number(),
  state: z.enum(["added", "skipped", "failed"]),
  registration: existing.nullable(),
  error: z.string().nullable(),
  overrideEligibility: z.boolean().optional(),
});

export const previewManualRegistrationWrite = {
  ...browserPost,
  id: "previewManualRegistration",
  path: `${path}/preview`,
  maxBodyBytes: 1024,
  request: lookup,
  summary: "Verify one identity for staff-assisted registration",
  description:
    "Requires manage_registrations for the edition. An ID, canonical profile URL, or explicit username can identify a player. The preview verifies current identity and eligibility and reports any existing application without creating one.",
  successStatus: 200,
  successDescription:
    "Verified profile, edition revision and eligibility preview.",
  response: preview,
  errors: lookupErrors,
  consumers,
} as const satisfies WriteApiOperation;

export const addManualRegistrationWrite = {
  ...browserPost,
  id: "addManualRegistration",
  path,
  maxBodyBytes: 4096,
  request: lookup.extend({ ...enrollment, overrideEligibility }),
  summary: "Add one verified player by staff action",
  description:
    "Requires manage_registrations, matching edition revision, and explicit confirmation. Accepted status requires identity publication acknowledgment. Window and eligibility exceptions require their respective confirmations. An existing application of any status causes a conflict. The staff registration and audit event commit together.",
  successStatus: 201,
  successDescription: "The created registration identity and status.",
  response: existing.extend({ userId: z.number() }),
  errors: {
    ...lookupErrors,
    409: "Edition revision or enrollment state conflict, missing exception, or an existing registration.",
  },
  consumers,
} as const satisfies WriteApiOperation;

export const previewManualRegistrationsWrite = {
  ...browserPost,
  id: "previewManualRegistrations",
  path: `${path}/batch/preview`,
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.strictObject({
    text: z.string().max(MANUAL_BATCH_TEXT_LIMIT),
    inputType,
  }),
  summary: "Verify up to 20 identities for staff-assisted registration",
  description:
    "Requires manage_registrations for the edition. Accepts 1 to 20 non-empty lines. Each row keeps its original line number. Lookup failures and duplicate or already registered identities appear in the response rows.",
  successStatus: 200,
  successDescription: "Per-line previews and the common edition revision.",
  response: z.object({ rows: z.array(previewRow), edition }),
  errors,
  consumers: batchConsumers,
} as const satisfies WriteApiOperation;

export const addManualRegistrationsWrite = {
  ...browserPost,
  id: "addManualRegistrations",
  path: `${path}/batch`,
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.strictObject({
    ...enrollment,
    rows: z
      .array(
        z.strictObject({
          line: z.number().int().positive().max(MANUAL_BATCH_TEXT_LIMIT),
          osuId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          overrideEligibility,
        }),
      )
      .min(1)
      .max(MANUAL_BATCH_LIMIT),
  }),
  summary: "Add up to 20 verified players by staff action",
  description:
    "Requires unique line numbers, manage_registrations, matching edition revision and the same confirmations as a single registration. Each row commits separately. Repeated submissions report existing registrations as skipped while the caller still has permission.",
  successStatus: 200,
  successDescription:
    "Per-player added, skipped, or failed results and counts. Added rows include the submitted eligibility override flag.",
  response: z.object({
    results: z.array(batchResult),
    counts: z.object({
      added: z.number(),
      skipped: z.number(),
      failed: z.number(),
    }),
  }),
  errors: {
    ...errors,
    409: "Edition revision or enrollment state conflict, or a missing window exception.",
  },
  consumers: batchConsumers,
} as const satisfies WriteApiOperation;

export type ManualRegistrationPreview = z.output<typeof preview>;
export type ManualBatchPreview = z.output<
  typeof previewManualRegistrationsWrite.response
>;
export type ManualBatchRow = z.output<typeof previewRow>;
export type ManualBatchResult = z.output<typeof batchResult>;
export type ManualRegistrationBatch = z.output<
  typeof addManualRegistrationsWrite.response
>;
