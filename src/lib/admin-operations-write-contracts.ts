import { z } from "zod";
import { publicAppearances } from "./preferences";
import { profileSnapshotReadContract } from "./profile-read-contract";
import { defaultJsonBodyLimit } from "./request-body-limits";
import {
  browserWriteError,
  type WriteApiOperation,
} from "./write-api-contract";

const errors = {
  401: "An authenticated browser session is required.",
  403: "Origin, authentication channel, or required staff permission rejected.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};
const noStore = { "Cache-Control": z.literal("no-store") };
const backupAction = z.enum(["backup", "import", "restore"]);
const backupBodyLimit = 64 * 1024 * 1024 + 16384;
const backupManifest = z.looseObject({
  format: z.literal(1),
  createdAt: z.string(),
  source: z.string(),
  release: z.string(),
  schema: z.string(),
  postgres: z.number().int(),
  media: z.literal(false),
  mediaHash: z.string().optional(),
  counts: z.record(z.string(), z.string()).optional(),
  sha256: z.string(),
});
const backupJob = z.object({
  id: z.uuid(),
  actor: z.number().int().positive(),
  action: backupAction,
  source: z.string().nullable(),
  state: z.enum(["queued", "running", "validated", "completed", "failed"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().optional(),
  recovery: z.enum(["operator-required", "original-preserved"]).optional(),
  target: z.string().optional(),
  manifest: backupManifest.optional(),
});

export const queueAdminBackupWrite = {
  id: "queueAdminBackup",
  path: "/api/admin/backups",
  method: "POST",
  access: "browser",
  query: {
    action: backupAction,
    source: z
      .string()
      .describe("Required for restore. The source job ID.")
      .optional(),
    confirm: z
      .string()
      .describe("Required for restore with the exact value REPLACE.")
      .optional(),
  },
  maxBodyBytes: backupBodyLimit,
  requestMediaType: "*/*",
  requestBodyRequired: false,
  request: z
    .file()
    .max(backupBodyLimit)
    .describe(
      "Send the raw .oclr package for import. Backup and restore need no body.",
    ),
  summary: "Queue a backup, package import or restore with the backup operator",
  description:
    "Requires a global Admin and a same-origin browser session. Import sends the package bytes directly, without a multipart envelope. Restore uses source and confirm=REPLACE. A repeated restore for the same source can return its existing job. A 202 indicates acceptance, not completion. Poll the job list for the outcome.",
  successStatus: 202,
  successDescription: "The queued or existing operator job.",
  successHeaders: {
    "Cache-Control": z.literal("private, no-store"),
    "X-Content-Type-Options": z.literal("nosniff"),
  },
  response: backupJob,
  errors: {
    ...errors,
    400: "Invalid action.",
    409: "The operator rejected the request or is busy.",
    413: "The raw body exceeds the byte limit.",
    502: "The operator response exceeded the size limit.",
    503: "Site origin or the separately configured backup operator is unavailable.",
  },
  errorResponses: {
    503: z.union([
      browserWriteError.extend({
        code: z.enum(["not_configured", "unreachable"]),
      }),
      browserWriteError.strict(),
    ]),
  },
  consumers: ["src/components/backup-manager.tsx"],
} as const satisfies WriteApiOperation;

export const refreshStaffProfileWrite = {
  id: "refreshStaffProfile",
  path: "/api/admin/profiles",
  method: "POST",
  access: "browser",
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.strictObject({
    input: z
      .string()
      .trim()
      .pipe(z.string().min(1).max(300))
      .describe("Numeric osu! ID or canonical HTTPS osu! profile URL."),
    mode: profileSnapshotReadContract.shape.profile.shape.ruleset.optional(),
    refresh: z.boolean().default(false),
  }),
  summary: "Look up or refresh an osu! profile through the staff cache",
  description:
    "Requires registration-management access. A Developer without that write permission may read a saved snapshot only. Normal lookup may fetch the provider on a cache miss. Refresh can reuse a current claim, return a stale saved snapshot or be rate limited. The lookup does not create user accounts or tournament participation.",
  successStatus: 200,
  successDescription: "Profile snapshot, stale flag and nullable notice.",
  successHeaders: noStore,
  response: profileSnapshotReadContract.extend({
    profile: profileSnapshotReadContract.shape.profile.loose(),
  }),
  errors: {
    ...errors,
    400: "Invalid profile ID, URL or ruleset.",
    404: "The profile or a permitted saved snapshot is unavailable.",
    429: "The provider or cache refresh is busy.",
    502: "Provider transport or response failure.",
    503: "Site, cache or provider configuration is unavailable.",
  },
  consumers: ["src/components/captain-player-card.tsx"],
} as const satisfies WriteApiOperation;

export const updateSiteAppearanceWrite = {
  id: "updateSiteAppearance",
  path: "/api/admin/settings",
  method: "PATCH",
  access: "browser",
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.strictObject({
    defaultAppearance: z.enum(publicAppearances),
    expectedRevision: z.number().int().min(0).max(2147483646),
  }),
  summary: "Update the global website appearance",
  description:
    "Requires global configure_tournament. Only public appearances can be saved. The current revision is required even for unchanged values. Unchanged settings at the current revision do not create an audit event.",
  successStatus: 200,
  successDescription: "Saved website setting with its revision and timestamp.",
  successHeaders: noStore,
  response: z.strictObject({
    id: z.literal(1),
    defaultAppearance: z.enum(publicAppearances),
    revision: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
  }),
  errors: {
    ...errors,
    400: "Invalid appearance or revision.",
    409: "The current revision differs from the supplied revision.",
  },
  consumers: ["src/components/site-appearance-form.tsx"],
} as const satisfies WriteApiOperation;

export type BackupAction = z.input<typeof backupAction>;
export type StaffProfileLookupInput = z.input<
  typeof refreshStaffProfileWrite.request
>;
export type SiteAppearanceInput = z.input<
  typeof updateSiteAppearanceWrite.request
>;
