import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { oauthStates, users } from "@/db/schema";
import { equalTokens, hashToken } from "@/lib/auth/tokens";
import { exchangeIdentity } from "@/lib/auth/osu";
import { createSession, revokeSession } from "@/lib/auth/sessions";
import { cookieOptions, sessionCookie, stateCookie } from "@/lib/auth/config";
import { appUrl } from "@/lib/http";
import { observeLoginNames } from "@/lib/player-identity";
export async function GET(request: NextRequest) {
  const origin = appUrl();
  let response: NextResponse;
  try {
    const state = request.nextUrl.searchParams.get("state");
    const cookie = request.cookies.get(stateCookie())?.value;
    if (!equalTokens(cookie, state)) throw new Error("state");
    const [consumed] = await db()
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.stateHash, hashToken(state!)),
          gt(oauthStates.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!consumed) throw new Error("state");
    if (request.nextUrl.searchParams.has("error")) {
      response = NextResponse.redirect(`${origin}/login?error=declined`, 303);
    } else {
      const code = request.nextUrl.searchParams.get("code");
      if (!code || code.length > 4096) throw new Error("code");
      const identity = await exchangeIdentity(code);
      await db()
        .insert(users)
        .values({ osuId: identity.id, username: identity.username })
        .onConflictDoUpdate({
          target: users.osuId,
          set: { username: identity.username, updatedAt: new Date() },
        });
      await observeLoginNames(identity.id, identity.previous_usernames ?? []);
      const session = await createSession(identity.id);
      await revokeSession(request.cookies.get(sessionCookie())?.value);
      response = NextResponse.redirect(`${origin}/dashboard`, 303);
      response.cookies.set(sessionCookie(), session.token, {
        ...cookieOptions(),
        expires: session.expiresAt,
      });
    }
  } catch {
    response = NextResponse.redirect(`${origin}/login?error=failed`, 303);
  }
  response.cookies.set(stateCookie(), "", { ...cookieOptions(), maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
