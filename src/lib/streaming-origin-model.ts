import { developerOriginPort } from "./developer-api-model";

/** null allows canonical loopback origins; lists retain scheme/port restrictions. */
export type StreamingOrigins = readonly string[] | null;

export function isStreamingOrigin(origin: string) {
  return developerOriginPort(origin) !== null;
}

/** Browser message targets still use the original origin, never this comparison key. */
function streamingOriginKey(origin: string) {
  const port = developerOriginPort(origin);
  if (port === null) return null;
  const url = new URL(origin);
  const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  return `${url.protocol}//${host}:${port}`;
}

export function sameStreamingOrigin(left: string, right: string) {
  const key = streamingOriginKey(left);
  return key !== null && key === streamingOriginKey(right);
}

export function streamingOriginAllowed(
  origin: string,
  origins: StreamingOrigins,
) {
  return (
    isStreamingOrigin(origin) &&
    (origins === null ||
      origins.some((allowed) => sameStreamingOrigin(origin, allowed)))
  );
}
