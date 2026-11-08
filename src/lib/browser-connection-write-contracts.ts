import { z } from "zod";
import type { WriteApiOperation } from "./write-api-contract";

const remotePath = "/api/remote/connection";
const remoteConsumer = "src/components/remote-development.tsx";
const noStore = { "Cache-Control": z.literal("no-store") };
const remoteError = z.strictObject({
  state: z.literal("unavailable"),
  code: z.string(),
});
const remoteErrors = {
  403: "Origin or authentication channel rejected, or the remote backend denied access.",
  503: "Remote development is disabled, unavailable or incompatible.",
};
const remoteConnected = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("anonymous"), expiresAt: z.null() }),
  z.strictObject({ state: z.literal("developer"), expiresAt: z.iso.datetime() }),
]);

export const changeRemoteConnectionWrite = {
  id: "changeRemoteConnection",
  path: remotePath,
  method: "POST",
  access: "same-origin",
  maxBodyBytes: 1024,
  request: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("refresh") }),
    z.strictObject({ mode: z.literal("anonymous") }),
    z.strictObject({ mode: z.literal("developer"), token: z.string().max(100) }),
  ]),
  actionField: "mode",
  summary: "Connect to the saved-read backend or refresh local snapshots",
  description:
    "Available only in loopback remote development. Anonymous mode verifies the public backend. Developer mode verifies a read token in the JSON body and stores it in the local server's connection vault. The browser receives an opaque HttpOnly cookie. Refresh uses the current connection cookie to clear that connection's cached public snapshots.",
  successStatus: 200,
  successDescription: "The current connection's public snapshots were cleared.",
  successHeaders: noStore,
  response: z.strictObject({ state: z.literal("refreshed") }),
  additionalSuccess: {
    201: {
      description: "A new anonymous or Developer connection replaced the previous connection.",
      response: remoteConnected,
      headers: {
        ...noStore,
        "Set-Cookie": z.string().describe(
          "Opaque oclr_remote_session, HttpOnly and SameSite=Strict. Secure on HTTPS.",
        ),
      },
    },
  },
  errors: {
    ...remoteErrors,
    400: "Invalid JSON, mode or request fields, or the backend rejected the request.",
    401: "Connection absent or expired, or the Developer token is invalid or revoked.",
    404: "The backend did not find the required read resource.",
    409: "The backend reported a conflict while verifying access.",
    413: "The JSON body exceeds the byte limit, or the backend rejected its request size.",
    415: "Content-Type must be application/json.",
    429: "Local connection attempts or backend reads are rate limited.",
  },
  errorResponses: {
    400: remoteError,
    401: remoteError,
    403: remoteError,
    404: remoteError,
    409: remoteError,
    413: remoteError,
    415: remoteError,
    429: remoteError,
    503: remoteError,
  },
  errorHeaders: {
    429: { ...noStore, "Retry-After": z.string().regex(/^\d+$/) },
  },
  consumers: [remoteConsumer],
} as const satisfies WriteApiOperation;

export const disconnectRemoteWrite = {
  id: "disconnectRemote",
  path: remotePath,
  method: "DELETE",
  access: "same-origin",
  summary: "Disconnect the local saved-read session",
  description:
    "Clears the local connection, its public cache, and the browser's opaque cookie. A missing connection also returns disconnected.",
  successStatus: 200,
  successDescription: "The browser is disconnected from the local remote session.",
  successHeaders: {
    ...noStore,
    "Set-Cookie": z.string().describe("Expires the oclr_remote_session cookie."),
  },
  response: z.strictObject({ state: z.literal("disconnected") }),
  errors: {
    403: "Origin or authentication channel rejected.",
    503: "Remote development is disabled or its configuration is unavailable.",
  },
  errorResponses: { 403: remoteError, 503: remoteError },
  consumers: [remoteConsumer],
} as const satisfies WriteApiOperation;

export const logoutWrite = {
  id: "logout",
  path: "/auth/logout",
  method: "POST",
  access: "same-origin",
  summary: "Sign out of the browser session",
  description:
    "Revokes the current site session from its cookie when present. No request fields are read. A missing session still clears the cookie and redirects to the login confirmation page.",
  successStatus: 303,
  successDescription: "Empty redirect to /login?loggedOut=1.",
  successHeaders: {
    ...noStore,
    Location: z.url(),
    "Set-Cookie": z.string().describe(
      "Clears __Host-oclr_session or the local oclr_session cookie with Max-Age=0.",
    ),
  },
  response: null,
  errors: {
    403: "Origin or authentication channel rejected.",
    500: "Unexpected failure.",
    503: "Site origin configuration is unavailable or invalid.",
  },
  consumers: ["src/app/dashboard/page.tsx"],
} as const satisfies WriteApiOperation;

export type RemoteConnectionInput = z.input<
  typeof changeRemoteConnectionWrite.request
>;
