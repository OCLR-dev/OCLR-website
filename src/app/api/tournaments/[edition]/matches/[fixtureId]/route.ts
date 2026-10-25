import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { publicFixture } from "@/lib/public-competition";
import { apiError, HttpError } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string; fixtureId: string }> },
) {
  try {
    const { edition, fixtureId } = await context.params;
    const data = await publicFixture(edition, fixtureId);
    if (!data) throw new HttpError(404, "Published fixture not found.");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
