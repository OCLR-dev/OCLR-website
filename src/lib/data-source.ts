import paths from "./remote-route-paths.json" with { type: "json" };
/** Shared with proxy: no database, request state or credentials in this module. */
export function remoteMode() {
  const source = process.env.OCLR_DATA_SOURCE;
  if (source && !["database", "remote"].includes(source))
    throw new Error("Choose database or remote as the data source.");
  return source === "remote";
}
export function remoteConfiguration() {
  if (!remoteMode()) throw new Error("Remote development is disabled.");
  if (process.env.NODE_ENV !== "development")
    throw new Error("Remote data is available only with next dev.");
  let local: URL, upstream: URL;
  try {
    local = new URL(process.env.APP_URL ?? "");
    upstream = new URL(process.env.OCLR_API_BASE_URL ?? "");
  } catch {
    throw new Error(
      "Configure the local and backend origins for remote development.",
    );
  }
  const loopback = (host: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const originOnly = (url: URL) =>
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === "/";
  if (
    !originOnly(local) ||
    !["localhost", "127.0.0.1"].includes(local.hostname) ||
    !["http:", "https:"].includes(local.protocol)
  )
    throw new Error("Remote development requires a loopback APP_URL origin.");
  if (
    !originOnly(upstream) ||
    (upstream.protocol !== "https:" &&
      !(upstream.protocol === "http:" && loopback(upstream.hostname))) ||
    upstream.origin === local.origin
  )
    throw new Error(
      "Choose a separate HTTPS API origin (HTTP loopback is allowed for local testing).",
    );
  return { local: local.origin, upstream: upstream.origin };
}
function matchesRoute(path: string, template: string, api = false) {
  const actual = path.split("/"),
    parts = template.split("/");
  return (
    parts.every((part, index) => {
      if (part === "[...path]") return actual.length > index;
      if (part.startsWith("[")) {
        const value = actual[index] ?? "";
        if (
          api &&
          [
            "[id]",
            "[teamId]",
            "[fixtureId]",
            "[entryId]",
            "[replayId]",
          ].includes(part)
        )
          return /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
        if (part === "[osuId]")
          return (
            /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
          );
        return /^[a-zA-Z0-9_-]+$/.test(value);
      }
      return actual[index] === part;
    }) &&
    (template.includes("[...path]") || parts.length === actual.length)
  );
}
export function remotePageSupported(path: string) {
  return paths.pages.some((template) => matchesRoute(path, template));
}
export function remoteApiSupported(path: string) {
  return paths.reads.some((template) => matchesRoute(path, template, true));
}
