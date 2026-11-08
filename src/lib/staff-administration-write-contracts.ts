import { z } from "zod";
import { contributorListSchema } from "./contributor-model";
import { defaultJsonBodyLimit } from "./request-body-limits";
import { roles } from "./staff-role-model";
import type { WriteApiOperation } from "./write-api-contract";

const errors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, or current management permission rejected.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};
const confirmed = z.literal(true);
const role = z.enum(roles);
const userId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const scope = z.string().regex(/^[a-z0-9-]+$/).max(80).nullable();
const grantId = z.uuid();

export const staffRoleChange = z.discriminatedUnion("action", [
  z.strictObject({
    confirmed,
    action: z.literal("visibility"),
    grantId,
    published: z.boolean(),
    expectedPublished: z.boolean(),
  }),
  z.strictObject({
    confirmed,
    action: z.literal("grant"),
    userId,
    role,
    editionSlug: scope,
  }),
  z.strictObject({ confirmed, action: z.literal("revoke"), grantId }),
]);
export const staffRoleSet = z.strictObject({
  action: z.literal("set_roles"),
  confirmed,
  userId,
  editionSlug: scope,
  roles: z
    .array(role)
    .max(roles.length)
    .refine((items) => new Set(items).size === items.length)
    .meta({ uniqueItems: true }),
  expectedGrantIds: z
    .array(grantId)
    .max(roles.length)
    .refine((items) => new Set(items).size === items.length)
    .meta({ uniqueItems: true }),
});
const savedGrant = z.strictObject({
  id: grantId,
  userId,
  editionSlug: z.string().nullable(),
  role,
  grantedBy: z.number().int(),
  grantedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  aboutPublished: z.boolean(),
});
export const changeStaffRolesWrite = {
  id: "changeStaffRoles",
  path: "/api/admin/staff",
  method: "POST",
  access: "browser",
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.union([staffRoleChange, staffRoleSet]),
  summary: "Grant, revoke, replace or change visibility of staff roles",
  description:
    "Requires manage_staff in the exact grant scope and a signed-in target for new grants. Developer grants are global only. Set_roles compares the current active grant ID set and preserves visibility for retained roles. Visibility compares expectedPublished before saving. A stale set, duplicate active grant or repeated revocation returns a conflict. Changes and audit events commit together.",
  successStatus: 200,
  successDescription:
    "The saved grant for a single change, or the active grants in the requested scope for set_roles.",
  response: z.union([savedGrant, z.strictObject({ grants: z.array(savedGrant) })]),
  errors: {
    ...errors,
    400: "Invalid role change, unsupported grant scope, or unknown target user.",
    404: "The edition or grant was not found.",
    409: "Grant, visibility, or role set differs from the expected state.",
  },
  consumers: ["src/components/staff-role-form.tsx"],
} as const satisfies WriteApiOperation;

export const updateContributorsWrite = {
  id: "updateContributors",
  path: "/api/admin/contributors",
  method: "PATCH",
  access: "browser",
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.strictObject({
    entries: contributorListSchema.describe(
      "Ordered entries with unique entry IDs and unique osu! IDs.",
    ),
    expectedRevision: z.number().int().min(0).max(2147483646),
  }),
  summary: "Replace the ordered global contributor directory",
  description:
    "Requires global configure_tournament. Only entries marked published appear in the public directory. An unchanged request at the current revision or an identical retry of the last saved revision returns the saved directory without a second audit event.",
  successStatus: 200,
  successDescription: "The complete saved admin directory and revision.",
  response: { readResource: "contributorsForAdmin" },
  errors: {
    ...errors,
    400: "Invalid revision or contributor list, including duplicate identities.",
    409: "The directory changed since the expected revision.",
  },
  consumers: ["src/components/contributor-manager.tsx"],
} as const satisfies WriteApiOperation;

export type StaffRoleInput = z.input<typeof changeStaffRolesWrite.request>;
export type UpdateContributorsInput = z.input<
  typeof updateContributorsWrite.request
>;
