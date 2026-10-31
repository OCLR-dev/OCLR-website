import { isDeveloperOrigin } from "./developer-api-model";

/** Only this same-site path can survive OAuth; no generic return URL. */
export function streamingReturnPath(value: unknown, origins: string[]) {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value, "https://oclr.invalid");
    if (
      url.origin !== "https://oclr.invalid" ||
      url.hash ||
      !/^\/streaming\/[a-z0-9]+(?:-[a-z0-9]+)*\/connect$/.test(url.pathname)
    )
      return null;
    const origin = url.searchParams.get("origin");
    const state = url.searchParams.get("state");
    if (
      !origin ||
      !isDeveloperOrigin(origin) ||
      !origins.includes(origin) ||
      !state ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      [...url.searchParams.keys()].length !== 2
    )
      return null;
    return `${url.pathname}?${new URLSearchParams({ origin, state })}`;
  } catch {
    return null;
  }
}

export function streamingOAuthReturn(
  value: string | undefined,
  stateHash: string,
  origins: string[],
) {
  try {
    const context = JSON.parse(
      Buffer.from(value ?? "", "base64url").toString(),
    );
    return context.stateHash === stateHash
      ? streamingReturnPath(context.returnTo, origins)
      : null;
  } catch {
    return null;
  }
}
