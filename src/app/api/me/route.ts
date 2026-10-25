import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { remoteMode } from "@/lib/data-source";
import { frontendConnection } from "@/lib/frontend-data";
import { requireUser } from "@/lib/auth/user";
import { apiError, HttpError } from "@/lib/http";
async function readGET() {
  try {
    const user = remoteMode()
      ? (await frontendConnection()).identity?.user
      : await requireUser();
    if (!user) throw new HttpError(401, "Sign in with osu! to continue.");
    return NextResponse.json(user, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
