import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { fixtureForReview } from "@/lib/fixtures";
import { apiError } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string; fixtureId: string }> },
) {
  try {
    const user = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(await fixtureForReview(user, edition, fixtureId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
