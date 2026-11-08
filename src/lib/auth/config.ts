import { z } from "zod";
import { appUrl } from "../app-url";
import { HttpError } from "../http-error";
const privacyContactId = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
/** One explicitly approved public contact; never infer it from private role grants. */
export function privacyContact() {
  const parsed = privacyContactId.safeParse(process.env.PRIVACY_CONTACT_OSU_ID);
  return parsed.success
    ? {
        osuId: parsed.data,
        url: `https://osu.ppy.sh/users/${parsed.data}`,
        label: "Contact OCLR Admin on osu!",
      }
    : null;
}
export function privacyReady() {
  return privacyContact() !== null;
}
export function authReady() {
  return Boolean(
    process.env.APP_URL &&
    process.env.DATABASE_URL &&
    process.env.OSU_CLIENT_ID &&
    process.env.OSU_CLIENT_SECRET &&
    privacyReady(),
  );
}
export function oauthConfig() {
  if (!authReady() || !/^\d+$/.test(process.env.OSU_CLIENT_ID!))
    throw new HttpError(
      503,
      "osu! sign-in is not configured yet. Please return later.",
    );
  return {
    clientId: process.env.OSU_CLIENT_ID!,
    clientSecret: process.env.OSU_CLIENT_SECRET!,
    redirectUri: `${appUrl()}/auth/osu/callback`,
  };
}
export const sessionCookie = () =>
  process.env.APP_URL?.startsWith("https:")
    ? "__Host-oclr_session"
    : "oclr_session";
export const stateCookie = () =>
  process.env.APP_URL?.startsWith("https:")
    ? "__Host-oclr_oauth"
    : "oclr_oauth";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: Boolean(process.env.APP_URL?.startsWith("https:")),
  sameSite: "lax" as const,
  path: "/",
});
