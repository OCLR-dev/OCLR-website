import { z } from "zod";
import { operationsReadContracts } from "./operations-read-contracts";
import type { WriteApiOperation } from "./write-api-contract";

export const reviewBwsWrite = {
  id: "reviewBws",
  path: "/api/admin/tournaments/{edition}/registrations/{id}/bws",
  method: "POST",
  access: "browser",
  parameters: { id: z.uuid() },
  maxBodyBytes: 8192,
  request: z.strictObject({
    mode: z.literal("osu"),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    expectedVersion: z.number().int().nonnegative(),
    classifications: z.array(z.enum(["unknown", "other", "osu"])).max(100),
    confirmed: z.literal(true),
  }),
  summary: "Review the standard-mode badges for an applicant",
  description:
    "Requires manage_registrations for the edition and one classification per current badge. The server rechecks the badge fingerprint and review version in the transaction. A successful review increments the version and writes one audit event. Reload before retrying a stale review.",
  successStatus: 200,
  successDescription:
    "The staff BWS workspace with the updated review and summary.",
  response: operationsReadContracts.staffBws,
  errors: {
    400: "Invalid badge review command.",
    401: "An active browser session is required.",
    403: "Origin, authentication channel, or edition capability rejected.",
    404: "The application or osu! profile was not found.",
    409: "The badge inventory or review version changed.",
    429: "osu! lookup is rate limited.",
    500: "Unexpected failure.",
    502: "The upstream osu! response was unavailable or invalid.",
    503: "Site or osu! provider configuration is unavailable.",
    504: "The osu! lookup timed out.",
  },
  consumers: ["src/components/bws-review.tsx"],
} as const satisfies WriteApiOperation;
