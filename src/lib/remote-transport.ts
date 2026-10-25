import { z } from "zod";
import { readOperations, readSchemas } from "./read-api-operations";
import { paginationSchema } from "./read-api-contract";
import { remoteConfiguration } from "./data-source";
import { RemoteDataError } from "./remote-errors";
import { editionSchema } from "./editions";
import { profileMode } from "./osu-profile-model";
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
    if (response.status === 429) throw new RemoteDataError("RATE_LIMITED", 429);
    if (response.status === 401)
      throw new RemoteDataError("REMOTE_EXPIRED", 401);
    if (response.status === 403)
      throw new RemoteDataError("REMOTE_FORBIDDEN", 403);
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
    return { data, meta };
  } catch (error) {
    if (error instanceof RemoteDataError) throw error;
    throw new RemoteDataError("REMOTE_UNAVAILABLE");
  }
}
