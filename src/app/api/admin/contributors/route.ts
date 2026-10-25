import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { contributorsForAdmin, updateContributors } from "@/lib/contributors";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { withFrontendReadRequest } from "@/lib/frontend-read-context";
async function readGET() {
  try {
    return NextResponse.json(await contributorsForAdmin(await requireUser()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export function GET() {
  return withFrontendReadRequest(readGET);
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(
      await updateContributors(await requireUser(), await readJson(request)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
