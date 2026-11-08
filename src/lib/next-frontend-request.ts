import { cookies } from "next/headers.js";
import { cache } from "react";
import { remoteMode } from "./data-source";
import {
  createFrontendReadContext,
  currentFrontendReadContext,
  runFrontendReadContext,
} from "./frontend-read-context";
import { remoteCookie } from "./remote-sessions";

// React shares this context across server components and metadata in one render.
// Route handlers have no render cache, so each handler gets its own context.
const requestContext = cache(async () =>
  createFrontendReadContext((await cookies()).get(remoteCookie)?.value),
);

export async function withFrontendReadRequest<T>(
  read: () => Promise<T>,
): Promise<T> {
  if (!remoteMode() || currentFrontendReadContext()) return read();
  return runFrontendReadContext(await requestContext(), read);
}
