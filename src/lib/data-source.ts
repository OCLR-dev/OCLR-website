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
export function remotePageSupported(path: string) {
  if (path === "/admin/tournaments/new") return false;
  return (
    [
      "/",
      "/tournaments",
      "/remote",
      "/remote/unsupported",
      "/login",
      "/developer",
      "/admin/tournaments",
    ].includes(path) ||
    /^\/tournaments\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:rules|players|participants)|\/players\/[1-9]\d*)?$/.test(
      path,
    ) ||
    /^\/players\/[1-9]\d*$/.test(path) ||
    /^\/admin\/tournaments\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)
  );
}
export function remoteApiSupported(path: string) {
  return (
    path === "/api/remote/connection" ||
    path.startsWith("/api/remote/read/") ||
    path === "/api/me" ||
    ["/api/tournaments", "/api/players"].includes(path) ||
    /^\/api\/tournaments\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/players)?$/.test(path) ||
    /^\/api\/players\/[1-9]\d*$/.test(path)
  );
}
