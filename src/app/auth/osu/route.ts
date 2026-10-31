import { NextResponse } from "next/server";
import { db } from "@/db";
import { oauthStates } from "@/db/schema";
import { authorizationUrl } from "@/lib/auth/osu";
import { randomToken, hashToken } from "@/lib/auth/tokens";
import { cookieOptions, stateCookie } from "@/lib/auth/config";
import { apiError } from "@/lib/http";
import { streamingReturnPath } from "@/lib/streaming-connect-model";
import { streamingOrigins } from "@/lib/streaming-api";
export async function GET(request?: Request) {
  try {
    const requested = new URL(
      request?.url ?? "http://localhost/auth/osu",
    ).searchParams.get("desktop_request");
    const desktopRequestId =
      requested &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requested,
      )
        ? requested
        : null;
    const returnValue = request
      ? new URL(request.url).searchParams.get("streaming_return")
      : null;
    const returnTo = returnValue
      ? streamingReturnPath(returnValue, streamingOrigins())
      : null;
    const token = randomToken();
    const url = authorizationUrl(token);
    await db()
      .insert(oauthStates)
      .values({
        stateHash: hashToken(token),
        desktopRequestId,
        expiresAt: new Date(Date.now() + 600000),
      });
    const response = NextResponse.redirect(url);
    response.cookies.set(stateCookie(), token, {
      ...cookieOptions(),
      maxAge: 600,
    });
    response.cookies.set(
      `${stateCookie()}_streaming`,
      returnTo
        ? Buffer.from(
            JSON.stringify({ stateHash: hashToken(token), returnTo }),
          ).toString("base64url")
        : "",
      {
        ...cookieOptions(),
        maxAge: returnTo ? 600 : 0,
      },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return apiError(error);
  }
}
