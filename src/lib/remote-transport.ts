import { readContractHeader, supportsFullSiteRead } from "./read-api-version";
import { z } from "zod";
import { remoteConfiguration } from "./data-source";
import { editionSchema } from "./editions";
import { profileMode } from "./osu-profile-model";
import { paginationSchema } from "./read-api-contract";
import { readOperations, readSchemas } from "./read-api-operations";
import { RemoteDataError } from "./remote-errors";
import { remoteRetrySeconds } from "./remote-retry";
const metaSchema = z
  .object({
    apiVersion: z.literal("1"),
    requestId: z.uuid(),
    pagination: paginationSchema.optional(),
  })
  .strict();
export function remoteOperation(path: string, query: URLSearchParams) {
  if (
    !path.startsWith("/") ||
    path.includes("%") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#")
  )
    throw new RemoteDataError("INVALID_REQUEST", 400);
  const parts = path.split("/");
  const operation = readOperations.find((candidate) => {
    const template = candidate.path.split("/");
    return (
      template.length === parts.length &&
      template.every((part, index) => {
        if (part === "{edition}")
          return editionSchema.shape.slug.safeParse(parts[index]).success;
        if (["{id}", "{replayId}"].includes(part))
          return z.uuid().safeParse(parts[index]).success;
        if (part === "{osuId}")
          return (
            /^[1-9]\d*$/.test(parts[index]) &&
            Number.isSafeInteger(Number(parts[index]))
          );
        return part === parts[index];
      })
    );
  });
  if (
    !operation ||
    [...query.keys()].some(
      (key) => !operation.query.includes(key) || query.getAll(key).length !== 1,
    )
  )
    throw new RemoteDataError("INVALID_REQUEST", 400);
  if (query.has("mode") && !profileMode.safeParse(query.get("mode")).success)
    throw new RemoteDataError("INVALID_REQUEST", 400);
  return operation;
}
/** Fixed origin + registered paths only. Never log fetch inputs/errors containing credentials. */
export async function remoteRead(
  path: string,
  query = new URLSearchParams(),
  token?: string,
) {
  const operation = remoteOperation(path, query);
  if (!operation.public && !token)
    throw new RemoteDataError("REMOTE_DISCONNECTED", 401);
  const { upstream, local } = remoteConfiguration();
  const url = new URL(`/api/v1${path}`, upstream);
  url.search = query.toString();
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "application/json",
        Origin: local,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (response.status === 429)
      throw new RemoteDataError(
        "RATE_LIMITED",
        429,
        remoteRetrySeconds(response.headers.get("retry-after")),
      );
    if (response.status === 401)
      throw new RemoteDataError("REMOTE_EXPIRED", 401);
    if (
      response.ok &&
      !supportsFullSiteRead(response.headers.get(readContractHeader))
    )
      throw new RemoteDataError("REMOTE_INCOMPATIBLE");
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new RemoteDataError("REMOTE_UNAVAILABLE");
    const reader = response.body?.getReader();
    if (!reader) throw new RemoteDataError("REMOTE_UNAVAILABLE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2097152) {
        await reader.cancel();
        throw new RemoteDataError("REMOTE_UNAVAILABLE");
      }
      chunks.push(value);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (response.status === 403) {
      const code = input?.error?.code;
      throw new RemoteDataError(
        [
          "ORIGIN_NOT_ALLOWED",
          "INSUFFICIENT_SCOPE",
          "DEVELOPER_REQUIRED",
        ].includes(code)
          ? code
          : "REMOTE_FORBIDDEN",
        403,
      );
    }
    if (!response.ok) {
      const known = [
        "NOT_FOUND",
        "PROFILE_SNAPSHOT_NOT_FOUND",
        "COLLECTION_CHANGED",
        "INVALID_REQUEST",
      ];
      throw new RemoteDataError(
        known.includes(input?.error?.code)
          ? input.error.code
          : "REMOTE_UNAVAILABLE",
        [400, 404, 409, 413, 429].includes(response.status)
          ? response.status
          : 503,
      );
    }
    const meta = metaSchema.parse(input.meta);
    const data = readSchemas[operation.schema].parse(input.data);
    return {
      data,
      meta,
      contractVersion: response.headers.get(readContractHeader),
    };
  } catch (error) {
    if (error instanceof RemoteDataError) throw error;
    throw new RemoteDataError("REMOTE_UNAVAILABLE");
  }
}
/** Binary companion to the same finite read registry. Never accepts a URL or storage key. */
export async function remoteMedia(path: string, token?: string) {
  const operation = remoteOperation(path, new URLSearchParams());
  if (!operation.binary) throw new RemoteDataError("INVALID_REQUEST", 400);
  if (!operation.public && !token)
    throw new RemoteDataError("REMOTE_DISCONNECTED", 401);
  const { upstream, local } = remoteConfiguration();
  try {
    const response = await fetch(new URL(`/api/v1${path}`, upstream), {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Origin: local,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok)
      throw new RemoteDataError(
        response.status === 401
          ? "REMOTE_EXPIRED"
          : response.status === 403
            ? "REMOTE_FORBIDDEN"
            : response.status === 404
              ? "NOT_FOUND"
              : response.status === 429
                ? "RATE_LIMITED"
                : "REMOTE_UNAVAILABLE",
        [401, 403, 404, 429].includes(response.status) ? response.status : 503,
      );
    if (!supportsFullSiteRead(response.headers.get(readContractHeader)))
      throw new RemoteDataError("REMOTE_INCOMPATIBLE");
    const type =
      operation.id === "getTeamAvatar"
        ? "image/webp"
        : "application/octet-stream";
    if (response.headers.get("content-type") !== type)
      throw new RemoteDataError("REMOTE_UNAVAILABLE");
    const reader = response.body?.getReader();
    if (!reader) throw new RemoteDataError("REMOTE_UNAVAILABLE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > (type === "image/webp" ? 1048576 : 8388608)) {
        await reader.cancel();
        throw new RemoteDataError("REMOTE_UNAVAILABLE");
      }
      chunks.push(value);
    }
    const headers = new Headers({
      "Content-Type": type,
      "Content-Length": String(size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    if (type === "application/octet-stream") {
      const disposition = response.headers.get("content-disposition") ?? "";
      if (
        // A valid 180-character Unicode filename expands when RFC 5987 encoded.
        disposition.length > 2200 ||
        !/^attachment; filename="replay\.osr"; filename\*=UTF-8''[A-Za-z0-9%_.!~*-]+$/.test(
          disposition,
        )
      )
        throw new RemoteDataError("REMOTE_UNAVAILABLE");
      headers.set("Content-Disposition", disposition);
    }
    return new Response(Buffer.concat(chunks), { headers });
  } catch (error) {
    if (error instanceof RemoteDataError) throw error;
    throw new RemoteDataError("REMOTE_UNAVAILABLE");
  }
}
