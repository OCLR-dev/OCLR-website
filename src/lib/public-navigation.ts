/** One selected public destination, including its detail routes. */
export function publicTournamentSection(path: string, base: string) {
  const suffix =
    path === base
      ? ""
      : path.startsWith(`${base}/`)
        ? path.slice(base.length + 1).split("/")[0]
        : null;
  if (suffix === null) return null;
  if (suffix === "participants") return "players";
  if (suffix === "matches") return "schedule";
  if (["register", "rules"].includes(suffix)) return "";
  if (suffix === "team") return "teams";
  return suffix;
}

/** Public route context is independent of the shared visual theme. */
export function isPublicPage(path: string, presenter = false) {
  if (/^\/(admin|dashboard|developer|login|auth|api)(?:\/|$)/.test(path))
    return false;
  if (
    /^\/tournaments\/[^/]+\/(team(?:\/|$)|draft\/(captain|overlay)(?:\/|$))/.test(
      path,
    )
  )
    return false;
  return !(presenter && /^\/tournaments\/[^/]+\/draft$/.test(path));
}

/** Broadcast output deliberately keeps its own transparent/dark presentation. */
export function isBroadcastPage(path: string, presenter = false) {
  return (
    /^\/tournaments\/[^/]+\/draft\/overlay(?:\/|$)/.test(path) ||
    (presenter && /^\/tournaments\/[^/]+\/draft$/.test(path))
  );
}
