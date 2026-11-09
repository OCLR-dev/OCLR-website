import { changeTournamentWrite } from "@/lib/tournament-write-contracts";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { tournamentForAdmin } from "@/lib/tournament-reads";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
type Context = { params: Promise<{ edition: string }> };
async function readGET(_request: Request, context: Context) {
  try {
    return NextResponse.json(
      await tournamentForAdmin(
        await requireUser(),
        (await context.params).edition,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition } = await context.params;
    const input = await readJson(request, changeTournamentWrite.maxBodyBytes);
    const { tournamentCommand } = await import("@/lib/tournaments");
    const result = await tournamentCommand(actor, edition, input);
    revalidateCommittedPath("/", "layout");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
