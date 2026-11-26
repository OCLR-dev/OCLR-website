import { appUrl } from "../app-url";
import { assertDevelopmentDatabase } from "../development-database";
import { isLoopbackHostname } from "../site-origin";
import { validToken } from "./tokens";

export const localRolePreviewCookie = "oclr_local_role_preview";

/** The opt-in, database boundary and request origin apply to session reads as well as issuance. */
export function localRolePreviewKey(host: string | null) {
  const key = process.env.OCLR_LOCAL_ROLE_PREVIEW_KEY;
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.OCLR_ENVIRONMENT === "production" ||
    ![undefined, "", "database"].includes(process.env.OCLR_DATA_SOURCE) ||
    !validToken(key)
  )
    return null;

  try {
    const origin = new URL(appUrl());
    if (host !== origin.host || !isLoopbackHostname(origin.hostname))
      return null;
    assertDevelopmentDatabase(
      process.env.DATABASE_URL,
      process.env.OCLR_DEVELOPMENT_DATABASE_URL ??
        process.env.TEST_DATABASE_URL,
    );
    return key;
  } catch {
    return null;
  }
}
