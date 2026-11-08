import { HttpError } from "./http-error";
import { allowsPlainHttpOrigin } from "./site-origin";

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
