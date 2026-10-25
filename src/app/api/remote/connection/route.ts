import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { remoteConfiguration } from "@/lib/data-source";
import {
  remoteCookie,
  connectRemote,
  disconnectRemote,
  verifiedConnection,
} from "@/lib/remote-sessions";
import { RemoteDataError } from "@/lib/remote-errors";
import { readJson, requireSameOrigin, HttpError } from "@/lib/http";
const inputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("anonymous") }).strict(),
  z
    .object({ mode: z.literal("developer"), token: z.string().max(100) })
    .strict(),
]);
const attempts = globalThis as unknown as {
  oclrRemoteAttempts?: { start: number; count: number };
};
const response = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
function failure(error: unknown) {
  return response(
    {
      state: "unavailable",
      code:
        error instanceof RemoteDataError
          ? error.code
          : error instanceof HttpError && error.status === 403
            ? "REMOTE_FORBIDDEN"
            : "REMOTE_UNAVAILABLE",
    },
    error instanceof HttpError ? error.status : 503,
  );
}
export async function GET() {
  try {
    remoteConfiguration();
    const context = await verifiedConnection(
      (await cookies()).get(remoteCookie)?.value,
    );
    return response({
      state: context.mode,
      expiresAt: new Date(context.expiresAt).toISOString(),
      identity: context.identity,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { local } = remoteConfiguration();
    const now = Date.now();
    const window = attempts.oclrRemoteAttempts;
    if (!window || now - window.start >= 60000)
      attempts.oclrRemoteAttempts = { start: now, count: 0 };
    if (++attempts.oclrRemoteAttempts!.count > 20)
      throw new RemoteDataError("RATE_LIMITED", 429);
    const parsed = inputSchema.safeParse(await readJson(request, 1024));
    if (!parsed.success) throw new RemoteDataError("INVALID_REQUEST", 400);
    const cookieJar = await cookies();
    const created = await connectRemote(
      parsed.data,
      cookieJar.get(remoteCookie)?.value,
    );
    cookieJar.set(remoteCookie, created.id, {
      httpOnly: true,
      sameSite: "strict",
      secure: local.startsWith("https:"),
      path: "/",
      expires: new Date(created.expiresAt),
    });
    return response(
      {
        state: parsed.data.mode,
        expiresAt: new Date(created.expiresAt).toISOString(),
      },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    remoteConfiguration();
    const cookieJar = await cookies();
    disconnectRemote(cookieJar.get(remoteCookie)?.value);
    cookieJar.delete(remoteCookie);
    return response({ state: "disconnected" });
  } catch (error) {
    return failure(error);
  }
}
