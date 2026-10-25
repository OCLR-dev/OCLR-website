import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { publicCompetition } from "@/lib/public-competition";
import { apiError, HttpError } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const { edition } = await context.params;
    const data = await publicCompetition(edition);
    if (!data) throw new HttpError(404, "Edition not found.");
    return NextResponse.json(
      { fixtures: data.fixtures, groups: data.groups },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
