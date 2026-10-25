import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { remoteMode } from "@/lib/data-source";
import { frontendLegacyTournaments } from "@/lib/frontend-legacy";
import { NextResponse } from "next/server";
import { getPublicEditions } from "@/lib/content";
import { publicEditionSummary } from "@/lib/tournaments";
import { registrationAvailability } from "@/lib/registrations";
import { apiError } from "@/lib/http";
async function readGET() {
  try {
    if (remoteMode())
      return NextResponse.json(await frontendLegacyTournaments(), {
        headers: { "Cache-Control": "no-store" },
      });
    return NextResponse.json(
      await Promise.all(
        (await getPublicEditions()).map(async (e) =>
          publicEditionSummary(e, await registrationAvailability(e)),
        ),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
