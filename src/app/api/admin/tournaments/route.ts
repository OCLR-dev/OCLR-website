import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { tournamentList, createTournament } from "@/lib/tournaments";
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
    return NextResponse.json(
      await createTournament(await requireUser(), await readJson(request)),
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
