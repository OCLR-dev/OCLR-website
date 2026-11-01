import { NextRequest, NextResponse } from "next/server";
import {
  remoteMode,
  remoteConfiguration,
  remotePageSupported,
  remoteApiSupported,
} from "@/lib/data-source";
import { appUrl } from "@/lib/http";
import { isDevelopmentNetworkRequest } from "@/lib/site-origin";
import { localeCookie, readLocale } from "@/i18n/config";
export function proxy(request: NextRequest) {
  // Only versioned APIs accept token transport; their handlers validate the
  // token family and scopes. Legacy endpoints keep session/anonymous transport.
  if (
    request.headers.has("authorization") &&
    !["/api/v1/", "/api/desktop/v1/", "/api/referee/v1/"].some((prefix) =>
      request.nextUrl.pathname.startsWith(prefix),
    )
  )
    return NextResponse.json(
      { error: "Use a browser session for this operation." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  let remote = false;
  try {
    remote = remoteMode();
    if (remote) {
      const { local } = remoteConfiguration();
      // External links may navigate to the frontend, but cannot fetch its
      // data, embed it, or submit commands across origins.
      const pageNavigation =
        request.method === "GET" &&
        request.headers.get("sec-fetch-mode") === "navigate" &&
        request.headers.get("sec-fetch-dest") === "document" &&
        !request.nextUrl.pathname.startsWith("/api/") &&
        !request.nextUrl.pathname.startsWith("/auth/");
      if (
        request.headers.get("host") !== new URL(local).host ||
        (request.headers.get("sec-fetch-site") === "cross-site" &&
          !pageNavigation)
      )
        return NextResponse.json(
          { error: { code: "REMOTE_FORBIDDEN" } },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
      const path = request.nextUrl.pathname;
      if (
        (!["GET", "HEAD"].includes(request.method) &&
          !(
            path === "/api/remote/connection" &&
            ["POST", "DELETE"].includes(request.method)
          )) ||
        (path.startsWith("/api/") && !remoteApiSupported(path)) ||
        path.startsWith("/auth/")
      )
        return NextResponse.json(
          { error: { code: "REMOTE_READ_ONLY" } },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
    }
  } catch {
    return NextResponse.json(
      { error: { code: "REMOTE_CONFIGURATION_INVALID" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  let canonical: URL | null = null;
  try {
    canonical = process.env.APP_URL ? new URL(appUrl()) : null;
  } catch {
    return NextResponse.json(
      { error: "The site origin is not configured correctly." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (
    canonical &&
    request.headers.get("host") !== canonical.host &&
    !isDevelopmentNetworkRequest(request.headers.get("host")) &&
    ["GET", "HEAD"].includes(request.method)
  ) {
    canonical.pathname = request.nextUrl.pathname;
    canonical.search = request.nextUrl.search;
    // A development origin can change between runs (localhost, a LAN address,
    // a tunnel). A permanent redirect would stay in the browser and keep
    // replaying an old target after the configuration changes, so keep dev
    // redirects temporary and uncached. Production remains permanent.
    if (process.env.NODE_ENV === "development") {
      const response = NextResponse.redirect(canonical, 307);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return NextResponse.redirect(canonical, 308);
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://a.ppy.sh https://assets.ppy.sh data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Chromium checks the native approval form's redirect as well as its
    // same-origin action. The auth service validates the exact loopback URI.
    request.nextUrl.pathname === "/desktop/authorize"
      ? "form-action 'self' http://127.0.0.1:*/oclr/callback"
      : "form-action 'self'",
    "frame-ancestors 'none'",
    ...(canonical?.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);
  headers.set("x-nonce", nonce);
  // Overwrite inbound values; layouts never trust caller-supplied route context.
  headers.set("x-oclr-pathname", request.nextUrl.pathname);
  headers.set("x-oclr-search", request.nextUrl.search);
  const path = request.nextUrl.pathname;
  const response =
    remote &&
    !path.startsWith("/api/") &&
    !path.startsWith("/_next/") &&
    !/^\/(?:branding\/|archive\/|fonts\/|flags\/|mascot\/|themes\/|[^/]+\.(?:svg|png|jpg|jpeg|webp|ico)$)/.test(
      path,
    ) &&
    !remotePageSupported(path)
      ? NextResponse.redirect(
          new URL("/remote/unsupported", canonical?.origin ?? request.url),
          307,
        )
      : NextResponse.next({ request: { headers } });
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set(
      "Content-Language",
      readLocale(
        request.cookies.get(localeCookie)?.value,
        request.headers.get("accept-language"),
      ),
    );
  }
  response.headers.set("Content-Security-Policy", policy);
  if (canonical?.protocol === "https:")
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  if (
    remote ||
    request.nextUrl.pathname.startsWith("/api/") ||
    request.nextUrl.pathname.startsWith("/auth/")
  )
    response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|rookie-stage.svg).*)"],
};
