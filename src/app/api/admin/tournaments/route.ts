import { createTournamentWrite } from "@/lib/tournament-write-contracts";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { tournamentList } from "@/lib/tournament-reads";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
async function readGET() {
  try {
    return NextResponse.json(await tournamentList(await requireUser()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const input = await readJson(request, createTournamentWrite.maxBodyBytes);
    const { createTournament } = await import("@/lib/tournaments");
    return NextResponse.json(await createTournament(actor, input), {
      status: createTournamentWrite.successStatus,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
