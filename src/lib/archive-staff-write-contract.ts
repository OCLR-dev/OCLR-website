import { z } from "zod";
import type { WriteApiOperation } from "./write-api-contract";

export const archiveStaffLookupInput = z.strictObject({
  staffIndex: z.number().int().min(0).max(199),
  username: z.string().trim().min(1).max(100),
  expectedRevision: z.number().int().nonnegative(),
});

export const lookupArchiveStaffWrite = {
  id: "lookupArchiveStaffIdentity",
  path: "/api/admin/tournaments/{edition}/archive-staff",
  method: "POST",
  access: "browser",
  maxBodyBytes: 4096,
  request: archiveStaffLookupInput,
  summary: "Verify a candidate osu! identity for unresolved historical staff",
  description:
    "Requires configure_tournament for the completed archive and its current revision. Checks the unresolved staff entry before and after provider work. This lookup does not link the identity. Linking requires the separate resolve-archive-staff command with evidence and explicit confirmation.",
  successStatus: 200,
  successDescription: "The current osu! identity and nullable avatar URL.",
  response: z.strictObject({
    osuId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    username: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  errors: {
    401: "An active browser session is required.",
    403: "Origin, authentication channel, or edition management permission rejected.",
    500: "Unexpected failure.",
    400: "Invalid lookup request or username.",
    404: "The tournament or provider profile was not found.",
    409: "Archive revision, staff selection, current username, or confirmed identity conflicts.",
    429: "Provider lookup is rate limited or busy.",
    502: "The provider returned an invalid response or could not be reached.",
    503: "Site configuration or a current verified profile is unavailable.",
  },
  consumers: ["src/components/archive-staff-resolver.tsx"],
} as const satisfies WriteApiOperation;

export type ArchiveStaffLookupInput = z.input<typeof archiveStaffLookupInput>;
export type ArchiveStaffCandidate = z.output<
  typeof lookupArchiveStaffWrite.response
>;
