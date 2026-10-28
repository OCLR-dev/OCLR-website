import { z } from "zod";
import { oauthConfig } from "./config";
import { HttpError } from "../http";
export const osuIdentity = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  username: z.string().min(1).max(255),
  previous_usernames: z.array(z.string().min(1).max(255)).optional(),
});
export function authorizationUrl(state: string) {
  const { clientId, redirectUri } = oauthConfig();
  const url = new URL("https://osu.ppy.sh/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  }).toString();
  return url;
}
export async function exchangeIdentity(code: string) {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  const response = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new HttpError(502, "osu! authorization could not be completed.");
  const result = z
    .object({
      access_token: z.string().min(1),
      token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
    })
    .parse(await response.json());
  const identity = await fetch("https://osu.ppy.sh/api/v2/me", {
    headers: {
      Authorization: `Bearer ${result.access_token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!identity.ok)
    throw new HttpError(502, "osu! identity could not be retrieved.");
  // No access/refresh tokens are persisted; future logins refresh mutable identity.
  return osuIdentity.parse(await identity.json());
}
