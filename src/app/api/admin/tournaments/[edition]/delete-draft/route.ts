import { deleteTournamentDraftWrite } from "@/lib/tournament-write-contracts";
import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { deleteUnusedTournamentDraft } from "@/lib/delete-tournament-draft";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const result = await deleteUnusedTournamentDraft(
      await requireUser(),
      (await context.params).edition,
      await readJson(request, deleteTournamentDraftWrite.maxBodyBytes),
    );
    revalidateCommittedPath("/", "layout");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
