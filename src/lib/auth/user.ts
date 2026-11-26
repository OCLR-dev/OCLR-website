import { cookies, headers } from "next/headers.js";
import { HttpError } from "../http-error";
import { sessionCookie } from "./config";
import { readSession, readSessionContext } from "./sessions";
import {
  localRolePreviewCookie,
  localRolePreviewKey,
} from "./local-role-preview-config";

async function browserSessionToken() {
  const request = await headers();
  // A bearer request must never inherit a browser's independent write roles.
  if (request.has("authorization"))
    throw new HttpError(403, "Use a browser session for this operation.");
  const store = await cookies();
  const key = localRolePreviewKey(request.get("host"));
  const preview = key && store.get(localRolePreviewCookie)?.value;
  return preview
    ? { token: preview, previewKey: key ?? undefined }
    : { token: store.get(sessionCookie())?.value };
}
export async function currentUser() {
  if (process.env.OCLR_DATA_SOURCE === "remote")
    return (
      (await (await import("../frontend-data")).frontendConnection()).identity
        ?.user ?? null
    );
  return localBrowserUser();
}
export async function localBrowserUser() {
  const { token, previewKey } = await browserSessionToken();
  return readSession(token, previewKey);
}
export async function requireBrowserSession() {
  if (process.env.OCLR_DATA_SOURCE === "remote")
    throw new HttpError(
      403,
      "Remote development does not grant browser write roles.",
    );
  const { token, previewKey } = await browserSessionToken();
  const session = await readSessionContext(token, previewKey);
  if (!session) throw new HttpError(401, "Sign in with osu! to continue.");
  return session;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in with osu! to continue.");
  return user;
}
