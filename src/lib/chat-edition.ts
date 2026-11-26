import type { Edition } from "./editions";
import { isBroadcastPage } from "./public-navigation";
import { compareTournamentSeasons } from "./tournament-order";

export const chatEditionPattern = /^[a-z0-9-]{1,80}$/;
export function chatEdition(value: string | null) {
  return value && chatEditionPattern.test(value) ? value : null;
}

export type ChatEdition = Pick<Edition, "slug" | "name" | "season" | "status">;

export function chatEditionForPage(
  path: string,
  query: Pick<URLSearchParams, "get"> | null,
  editions: readonly ChatEdition[],
) {
  if (
    isBroadcastPage(path, query?.get("presenter") === "1") ||
    /^\/tournaments\/[^/]+\/chat\/?$/.test(path)
  )
    return undefined;
  const route =
    /^\/(?:tournaments|admin\/tournaments|streaming)\/([^/]+)(?:\/|$)/.exec(
      path,
    );
  const slug =
    route?.[1] ??
    (/^\/players\/[^/]+\/?$/.test(path) ? query?.get("edition") : null);
  const sorted = [...editions].sort(compareTournamentSeasons);
  return (
    sorted.find((edition) => edition.slug === slug) ??
    sorted.find((edition) => edition.status === "live") ??
    sorted.find((edition) => edition.status === "upcoming") ??
    sorted[0]
  );
}

/** Canonical same-site document routes can survive a chat sign-in. */
export function chatReturnPath(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s#]/u.test(value)
  )
    return null;
  const origin = "https://oclr.invalid";
  const url = URL.parse(value, origin);
  if (!url || url.origin !== origin) return null;
  try {
    const path = decodeURIComponent(url.pathname);
    if (
      path.startsWith("//") ||
      path.includes("\\") ||
      [...path].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      /^\/(?:auth|api|login)(?:\/|$)/i.test(path)
    )
      return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
