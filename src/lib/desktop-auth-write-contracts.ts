import { z } from "zod";
import { desktopMetadataSchema } from "./desktop-wire";
import { defaultJsonBodyLimit } from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

export const desktopScopes = [
  "referee:fixtures:read",
  "referee:context:read",
  "referee:panel:read",
  "referee:relay",
] as const;

const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const client = z.literal("oclr-ref-tools");
const redirect = z.string().refine((s) => {
  try {
    const u = new URL(s);
    return (
      u.protocol === "http:" &&
      u.hostname === "127.0.0.1" &&
      Number(u.port) >= 1024 &&
      Number(u.port) <= 65535 &&
      u.pathname === "/oclr/callback" &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
});
const requestSchema = z
  .object({
    client_id: client,
    client_version: z
      .string()
      .max(64)
      .regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/),
    platform: z.enum(["linux", "darwin", "win32"]),
    device_name: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[^\p{Cc}\p{Cf}]+$/u),
    redirect_uri: redirect,
    scope: z
      .array(z.enum(desktopScopes))
      .min(1)
      .max(4)
      .refine((a) => new Set(a).size === a.length)
      .meta({ uniqueItems: true }),
    state: secret,
    code_challenge: secret,
    code_challenge_method: z.literal("S256"),
  })
  .strict();

const exchangeRequest = z.strictObject({
  authorization_request_id: z.uuid(),
  client_id: client,
  code: secret,
  code_verifier: secret,
  redirect_uri: redirect,
});

const refreshRequest = z
  .object({
    client_id: client,
    refresh_token: z.string().regex(/^oclr_desk_rt_[A-Za-z0-9_-]{43}$/),
  })
  .strict();

const root = "/api/desktop/v1/auth";
const errorFormat = "desktop";
const noStore = { "Cache-Control": z.literal("no-store") };
const noReferrer = { "Referrer-Policy": z.literal("no-referrer") };
const desktopClient = ["OCLR-dev/OCLR-ref-tools:src/main/oclr.ts"];
const desktopPost = {
  method: "POST",
  access: "public",
  errorFormat,
  maxBodyBytes: defaultJsonBodyLimit,
  consumers: [],
  externalConsumers: desktopClient,
} as const;
const enveloped = {
  contractHeader: "X-OCLR-Desktop-Contract",
  successHeaders: { ...noStore, ...noReferrer },
};
const forbiddenHeader = "An Authorization header is rejected (INSUFFICIENT_SCOPE).";
const unavailable = "The service or site configuration is unavailable (SERVICE_UNAVAILABLE).";
const issued = z.object({
  token_type: z.literal("Bearer"),
  access_token: z.string().regex(/^oclr_desk_at_[A-Za-z0-9_-]{43}$/),
  expires_in: z.number().int(),
  access_expires_at: z.iso.datetime(),
  refresh_token: refreshRequest.shape.refresh_token,
  refresh_expires_at: z.iso.datetime(),
  session_expires_at: z.iso.datetime(),
  session_id: z.uuid(),
  scope: z.array(z.enum(desktopScopes)),
  subject: z.object({ osuId: z.number().int(), username: z.string() }),
});
const tokenResponse = z.object({ data: issued, meta: desktopMetadataSchema });

export const requestDesktopAuthWrite = {
  ...desktopPost,
  ...enveloped,
  id: "requestDesktopAuthorization",
  path: `${root}/requests`,
  request: requestSchema,
  summary: "Start desktop authorization with PKCE S256",
  description:
    "Creates a short-lived request for the referee client. redirect_uri must use HTTP, 127.0.0.1, a port from 1024 through 65535 and /oclr/callback, with no credentials, query or fragment. Scopes must be distinct. The user reviews the device and verification code in a browser.",
  successStatus: 201,
  successDescription: "Pending request and verification code in the desktop envelope.",
  response: z.object({
    data: z.object({
      authorization_request_id: z.uuid(),
      authorization_url: z.url(),
      verification_code: z.string().regex(/^[0-9A-F]{4}-[0-9A-F]{4}$/),
      expires_at: z.iso.datetime(),
    }),
    meta: desktopMetadataSchema,
  }),
  errors: {
    400: "Invalid JSON, client, callback, PKCE fields or scopes (INVALID_REQUEST for invalid fields).",
    403: forbiddenHeader,
    429: "Pending authorization limit reached (RATE_LIMITED).",
    503: unavailable,
  },
} as const satisfies WriteApiOperation;

export const decideDesktopAuthWrite = {
  id: "decideDesktopAuthorization",
  path: `${root}/decision`,
  method: "POST",
  access: "browser",
  errorFormat,
  maxBodyBytes: 2048,
  requestMediaType: "application/x-www-form-urlencoded",
  request: z.strictObject({
    request_id: z.uuid(),
    decision: z.enum(["approve", "deny"]),
  }),
  actionField: "decision",
  summary: "Approve or deny a pending desktop authorization in the browser",
  description:
    "Uses a same-origin browser session. Both form fields must occur exactly once. Approval requires a current Referee or Admin grant. The loopback callback carries state and either a single-use code valid for at most 60 seconds or error=access_denied.",
  successStatus: 303,
  successDescription: "Redirects to the saved loopback callback with no response body.",
  successHeaders: { ...noStore, ...noReferrer, Location: z.url() },
  response: null,
  errors: {
    400: "Invalid form, request ID or body size (INVALID_REQUEST).",
    401: "A browser session is required (SERVICE_UNAVAILABLE).",
    403: "Invalid origin or authentication channel, or approval without a current grant.",
    409: "Authorization was already handled (AUTH_REQUEST_ALREADY_HANDLED).",
    410: "Authorization expired or was not found (AUTH_REQUEST_EXPIRED).",
    503: unavailable,
  },
  consumers: ["src/app/desktop/authorize/page.tsx"],
} as const satisfies WriteApiOperation;

export const exchangeDesktopAuthWrite = {
  ...desktopPost,
  ...enveloped,
  id: "exchangeDesktopAuthorization",
  path: `${root}/exchange`,
  request: exchangeRequest,
  summary: "Exchange an approved desktop authorization for credentials",
  description:
    "Requires the approved single-use code, matching PKCE verifier and exact original redirect URI. A request is invalidated after five unsuccessful verification attempts. The subject needs a current Referee or Admin grant. A successful exchange consumes the code and creates a session.",
  successStatus: 200,
  successDescription: "The desktop access and refresh credentials with expiry and subject.",
  response: tokenResponse,
  errors: {
    400: "Invalid JSON or grant, including an invalid, expired or consumed code (INVALID_GRANT for invalid grants).",
    403: "Authorization header rejected or the current referee access has been revoked.",
    409: "The subject has reached the active session limit (SESSION_LIMIT_REACHED).",
    503: unavailable,
  },
} as const satisfies WriteApiOperation;

export const refreshDesktopAuthWrite = {
  ...desktopPost,
  ...enveloped,
  id: "refreshDesktopAuthorization",
  path: `${root}/refresh`,
  request: refreshRequest,
  summary: "Rotate desktop credentials",
  description:
    "Uses the current refresh token and a live referee grant. Success consumes the refresh token and returns a new pair within the same session expiry. Reusing a consumed refresh token revokes the session family, so do not blindly retry an uncertain refresh.",
  successStatus: 200,
  successDescription: "Rotated desktop access and refresh credentials.",
  response: tokenResponse,
  errors: {
    401: "Refresh token is invalid, expired, consumed, or belongs to an expired or revoked session (INVALID_REFRESH_TOKEN).",
    403: "Authorization header rejected or the current referee access has been revoked.",
    503: unavailable,
  },
} as const satisfies WriteApiOperation;

export const revokeDesktopAuthWrite = {
  ...desktopPost,
  id: "revokeDesktopAuthorization",
  path: `${root}/revoke`,
  request: refreshRequest,
  summary: "Revoke a desktop session with its refresh token",
  description:
    "Uses the refresh token from the JSON body. An invalid or unknown token in a parsed JSON payload also returns 204. The endpoint does not reveal token existence in its response.",
  successStatus: 204,
  successDescription: "Empty response.",
  successHeaders: noStore,
  response: null,
  errors: { 403: forbiddenHeader, 503: unavailable },
} as const satisfies WriteApiOperation;

export const deleteDesktopSessionWrite = {
  id: "deleteDesktopSession",
  path: `${root}/sessions/{id}`,
  method: "DELETE",
  access: "browser",
  errorFormat,
  parameters: {
    id: z.string().describe("Session UUID. Invalid or unowned IDs have no effect."),
  },
  summary: "Revoke an owned desktop session from the browser",
  description:
    "Uses a same-origin browser session. The response is the same when the session is revoked, does not exist, belongs to another user or has an invalid ID.",
  successStatus: 204,
  successDescription: "Empty response.",
  successHeaders: noStore,
  response: null,
  errors: {
    401: "A browser session is required (SERVICE_UNAVAILABLE).",
    403: "Origin or authentication channel rejected.",
    503: unavailable,
  },
  consumers: ["src/components/desktop-sessions.tsx"],
} as const satisfies WriteApiOperation;
