import { cookieOptions } from "@/lib/auth/config";
import { NextRequest, NextResponse } from "next/server";
import {
  localRolePreviewCookie,
  localRolePreviewKey,
} from "@/lib/auth/local-role-preview-config";
import { localRolePreviewAccount } from "@/lib/auth/local-role-preview";
import {
  readSessionContext,
  switchLocalRolePreviewSession,
} from "@/lib/auth/sessions";
import { equalTokens } from "@/lib/auth/tokens";
import { switchLocalRolePreviewWrite as operation } from "@/lib/browser-connection-write-contracts";
import {
  apiError,
  appUrl,
  HttpError,
  readBoundedBody,
  requireSameOrigin,
} from "@/lib/http";
import { localRolePreviewPath } from "@/lib/local-role-preview-model";

export async function POST(request: NextRequest) {
  try {
    const key = localRolePreviewKey(request.headers.get("host"));
    if (!key) throw new HttpError(404, "Local role preview is unavailable.");
    requireSameOrigin(request);
    if (
      request.headers.get("content-type")?.split(";", 1)[0].trim() !==
      operation.requestMediaType
    )
      throw new HttpError(415, "Send a URL-encoded form.");
    const body = await readBoundedBody(request, operation.maxBodyBytes);
    const form = new URLSearchParams(body.toString("utf8"));
    const fields = operation.request.safeParse(Object.fromEntries(form));
    if (!fields.success || form.size !== Object.keys(fields.data).length)
      throw new HttpError(400, "The role preview form is invalid.");
    const token = request.cookies.get(localRolePreviewCookie)?.value;
    const session = await readSessionContext(token, key);
    const location = new URL(localRolePreviewPath, appUrl());
    if (!session && !equalTokens(key, fields.data.code ?? null)) {
      location.searchParams.set("error", "access");
      return NextResponse.redirect(location, {
        status: operation.successStatus,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const account = await localRolePreviewAccount(fields.data.account);
    if (!account) {
      location.searchParams.set("error", "account");
      return NextResponse.redirect(location, {
        status: operation.successStatus,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const next = await switchLocalRolePreviewSession(
      account.osuId,
      key,
      token && session ? { token, expiresAt: session.expiresAt } : undefined,
    );
    const response = NextResponse.redirect(location, {
      status: operation.successStatus,
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(localRolePreviewCookie, next.token, {
      ...cookieOptions(),
      expires: next.expiresAt,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
