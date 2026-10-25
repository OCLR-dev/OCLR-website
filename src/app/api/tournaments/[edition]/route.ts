import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { remoteMode } from "@/lib/data-source";
import { frontendTournament } from "@/lib/frontend-data";
import { legacyTournamentProjection } from "@/lib/frontend-legacy";
import { NextResponse } from "next/server";
import { getPublicEdition } from "@/lib/content";
import { publicEditionSummary } from "@/lib/tournaments";
import { registrationAvailability } from "@/lib/registrations";
import { apiError, HttpError } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    if (remoteMode())
      return NextResponse.json(
        legacyTournamentProjection(
          await frontendTournament((await context.params).edition),
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    const edition = await getPublicEdition((await context.params).edition);
    if (!edition) throw new HttpError(404, "Tournament not found.");
    return NextResponse.json(
      publicEditionSummary(edition, await registrationAvailability(edition)),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
