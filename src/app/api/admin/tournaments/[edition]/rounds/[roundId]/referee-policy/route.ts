import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { roundRefereePolicyWrite } from "@/lib/fixture-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { saveRoundRefereePolicy } from "@/lib/round-referee-policy";

export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string; roundId: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, roundId } = await context.params;
    const result = await saveRoundRefereePolicy(
      actor,
      edition,
      roundId,
      await readJson(request, roundRefereePolicyWrite.maxBodyBytes),
    );
    revalidateCommittedPath(`/admin/tournaments/${edition}`, "layout");
    revalidateCommittedPath(`/tournaments/${edition}`, "layout");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
