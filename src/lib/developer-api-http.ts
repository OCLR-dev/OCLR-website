import { readContractHeader, readContractVersion } from "./read-api-version";
import { readOnlyData } from "@/db";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  authenticateDeveloperRead,
  DeveloperApiError,
  DeveloperApiLimiter,
  developerPorts,
  type DeveloperReadPrincipal,
} from "./developer-api";
import {
  developerOriginAllowed,
  type DeveloperApiScope,
} from "./developer-api-model";
import { appUrl, HttpError } from "./http";
import type { ReadPayload } from "./read-api-contract";
import { withReadChannel } from "./read-channel";
import type { ReadMedia } from "./read-media";
import { mediaDisposition } from "./read-media";

// Anonymous traffic has an independent budget and cannot consume token quotas.
const anonymousLimiter = new DeveloperApiLimiter(
  ((
    globalThis as typeof globalThis & {
      oclrAnonymousReadWindows?: Map<string, { count: number; until: number }>;
    }
  ).oclrAnonymousReadWindows ??= new Map()),
);
function responseHeaders(request: Request, id: string, allowedOrigin: boolean) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Request-Id": id,
    Vary: "Origin",
    [readContractHeader]: readContractVersion,
  });
  const origin = request.headers.get("origin");
  if (origin !== null && allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Expose-Headers",
      "X-Request-Id, Retry-After, WWW-Authenticate, Content-Disposition, Content-Length, X-OCLR-Read-Contract",
    );
  }
  return headers;
}
function failure(error: unknown, id: string, headers: Headers, head: boolean) {
  const status = error instanceof HttpError ? error.status : 500;
  const codes: Record<number, string> = {
    400: "INVALID_REQUEST",
    401: "INVALID_TOKEN",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    413: "RESOURCE_TOO_LARGE",
    429: "RATE_LIMITED",
    503: "API_UNAVAILABLE",
  };
  const code =
    error instanceof DeveloperApiError
      ? error.code
      : (codes[status] ?? "INTERNAL_ERROR");
  const message =
    error instanceof HttpError
      ? error.message
      : "This request could not be completed. Please try again.";
  if (status === 401)
    headers.set("WWW-Authenticate", 'Bearer realm="oclr-developer"');
  if (status === 429) headers.set("Retry-After", "60");
  return head
    ? new Response(null, { status, headers })
    : Response.json(
        { error: { code, message, requestId: id } },
        { status, headers },
      );
}
export type ReadResponseOptions<T, P = DeveloperReadPrincipal> = {
  onSuccess?: () => Promise<void>;
  origins?: () => string[];
  authenticate?: (request: Request) => Promise<P>;
  anonymous?: boolean;
  query?: readonly string[];
  schema?: z.ZodType<T>;
  database?: boolean;
  maxBytes?: number;
  rawDocument?: boolean;
  binary?: boolean;
};
/** Optional bearer auth is still strict: an explicit invalid token never becomes anonymous. */
export async function readDataResponse<T, P = DeveloperReadPrincipal>(
  request: Request,
  scope: DeveloperApiScope,
  read: (
    principal: P | null,
    query: URLSearchParams,
  ) => ReadPayload<T> | Promise<ReadPayload<T>>,
  options: ReadResponseOptions<T, P> = {},
) {
  const id = randomUUID();
  let headers = new Headers({
    "Cache-Control": "no-store",
    "X-Request-Id": id,
    Vary: "Origin",
    [readContractHeader]: readContractVersion,
  });
  try {
    const origin = request.headers.get("origin");
    // Streaming supplies its own exact-origin policy; Developer port rules do not apply there.
    const origins = options.origins?.();
    const ports = origins ? null : developerPorts();
    const allowedOrigin =
      origin !== null &&
      (origins
        ? origins.includes(origin)
        : developerOriginAllowed(origin, ports));
    headers = responseHeaders(request, id, allowedOrigin);
    appUrl();
    if (origin !== null && !allowedOrigin)
      throw new DeveloperApiError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "This local origin is not allowed.",
      );
    if (request.method === "OPTIONS") {
      const method = request.headers.get("access-control-request-method");
      const requestedHeaders = (
        request.headers.get("access-control-request-headers") ?? ""
      )
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      if (
        (method && !["GET", "HEAD"].includes(method)) ||
        requestedHeaders.some(
          (value) =>
            !["authorization", "accept", "accept-language"].includes(value),
        )
      )
        throw new DeveloperApiError(
          403,
          "PREFLIGHT_REJECTED",
          "This preflight request is not allowed.",
        );
      headers.set("Allow", "GET, HEAD, OPTIONS");
      headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Accept, Accept-Language",
      );
      headers.set("Access-Control-Max-Age", "300");
      headers.append(
        "Vary",
        "Access-Control-Request-Method, Access-Control-Request-Headers",
      );
      return new Response(null, { status: 204, headers });
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      headers.set("Allow", "GET, HEAD, OPTIONS");
      throw new DeveloperApiError(
        405,
        "READ_ONLY",
        "Developer API access is read-only.",
      );
    }
    const principal =
      !options.anonymous || request.headers.has("authorization")
        ? await (options.authenticate
            ? options.authenticate(request)
            : (authenticateDeveloperRead(request, scope) as Promise<P>))
        : null;
    if (!principal) anonymousLimiter.take("anonymous-reads", 600);
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some(
        (key) =>
          !(options.query ?? []).includes(key) ||
          query.getAll(key).length !== 1,
      )
    )
      throw new DeveloperApiError(
        400,
        "INVALID_REQUEST",
        "Choose valid API query parameters without duplicates.",
      );
    const execute = async () => {
      const payload = await read(principal, query);
      return {
        ...payload,
        data: options.schema
          ? options.schema.parse(payload.data)
          : payload.data,
      };
    };
    if (options.database && !process.env.DATABASE_URL)
      throw new DeveloperApiError(
        503,
        "DATA_UNAVAILABLE",
        "Saved data is temporarily unavailable.",
      );
    const payload = options.database
      ? await withReadChannel(() => readOnlyData(execute))
      : await execute();
    if (options.binary) {
      const media = payload.data as ReadMedia;
      if (media.bytes.byteLength > (options.maxBytes ?? 8388608))
        throw new HttpError(413, "Media is too large.");
      if (principal)
        await (options.authenticate
          ? options.authenticate(request)
          : (authenticateDeveloperRead(request, scope) as Promise<P>));
      headers.set("Content-Type", media.contentType);
      headers.set("Content-Length", String(media.bytes.byteLength));
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
      if (media.filename)
        headers.set("Content-Disposition", mediaDisposition(media.filename));
      return new Response(
        request.method === "HEAD" ? null : new Uint8Array(media.bytes),
        { headers },
      );
    }
    const body = JSON.stringify(
      options.rawDocument
        ? payload.data
        : {
            data: payload.data,
            meta: { apiVersion: "1", requestId: id, ...payload.meta },
          },
    );
    if (Buffer.byteLength(body) > (options.maxBytes ?? 262144))
      throw new DeveloperApiError(
        413,
        "RESOURCE_TOO_LARGE",
        "This response is too large. Request a smaller collection page.",
      );
    if (options.onSuccess) await options.onSuccess();
    headers.set("Content-Type", "application/json");
    return new Response(request.method === "HEAD" ? null : body, { headers });
  } catch (error) {
    return failure(error, id, headers, request.method === "HEAD");
  }
}
/** Backwards-compatible stage-1 surface; callbacks receive no write-capable User. */
export function developerReadResponse(
  request: Request,
  scope: DeveloperApiScope,
  read: (principal: DeveloperReadPrincipal) => unknown | Promise<unknown>,
) {
  return readDataResponse(request, scope, async (principal) => ({
    data: await read(principal!),
  }));
}
export function missingDeveloperResource(request: Request) {
  return developerReadResponse(request, "identity:read", () => {
    throw new DeveloperApiError(
      404,
      "NOT_FOUND",
      "API resource was not found.",
    );
  });
}
