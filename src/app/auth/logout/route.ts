import { NextRequest, NextResponse } from "next/server";
import { cookieOptions, sessionCookie } from "@/lib/auth/config";
import { revokeSession } from "@/lib/auth/sessions";
import { apiError, appUrl, requireSameOrigin } from "@/lib/http";
import { logoutWrite } from "@/lib/browser-connection-write-contracts";
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    await revokeSession(request.cookies.get(sessionCookie())?.value);
    const response = NextResponse.redirect(
      `${appUrl()}/login?loggedOut=1`,
      logoutWrite.successStatus,
    );
    response.cookies.set(sessionCookie(), "", {
      ...cookieOptions(),
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return apiError(error);
  }
}
