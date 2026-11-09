import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { ownRegistrations } from "@/lib/registration-reads";
import { apiError } from "@/lib/http";
async function readGET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await ownRegistrations(user.osuId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
