import { cookies, headers } from "next/headers.js";
import { HttpError } from "../http";
import { sessionCookie } from "./config";
import { readSession, readSessionContext } from "./sessions";
export async function currentUser() {
  if (process.env.OCLR_DATA_SOURCE === "remote")
    return (
      (await (await import("../frontend-data")).frontendConnection()).identity
        ?.user ?? null
    );
  // A bearer request must never inherit a browser's independent write roles.
  if ((await headers()).has("authorization"))
    throw new HttpError(403, "Use a browser session for this operation.");
  return readSession((await cookies()).get(sessionCookie())?.value);
}
export async function requireBrowserSession() {
  if (process.env.OCLR_DATA_SOURCE === "remote")
    throw new HttpError(
      403,
      "Remote development does not grant browser write roles.",
    );
  if ((await headers()).has("authorization"))
    throw new HttpError(403, "Use a browser session for this operation.");
  const session = await readSessionContext(
    (await cookies()).get(sessionCookie())?.value,
  );
  if (!session) throw new HttpError(401, "Sign in with osu! to continue.");
  return session;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in with osu! to continue.");
  return user;
}
