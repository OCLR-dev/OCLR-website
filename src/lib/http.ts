import { NextResponse } from "next/server.js";
import { allowsPlainHttpOrigin } from "./site-origin";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function appUrl() {
  const value = process.env.APP_URL;
  if (!value) throw new HttpError(503, "The site origin is not configured.");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        allowsPlainHttpOrigin(url.hostname, process.env.NODE_ENV)
      ))
  )
    throw new HttpError(503, "The site origin is invalid.");
  return url.origin;
}
export function requireSameOrigin(request: Request) {
  if (request.headers.has("authorization"))
    throw new HttpError(403, "Use a browser session for this operation.");
  if (request.headers.get("origin") !== appUrl())
    throw new HttpError(
      403,
      "Request origin was not accepted. Refresh the page and try again.",
    );
}
export async function readJson(
  request: Request,
  limit = 32768,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Send JSON data.");
  // Bound the actual stream as well as Content-Length; do not trust the header.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A request body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "The request is too large.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The request contains invalid JSON.");
  }
}
export function apiError(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "This request could not be completed. Please try again.",
    },
    {
      status: error instanceof HttpError ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
