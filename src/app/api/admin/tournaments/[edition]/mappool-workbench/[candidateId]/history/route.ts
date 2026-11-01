import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { apiError } from "@/lib/http";
import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { candidateHistory } from "@/lib/mappool-history";
export async function GET(
  _request: Request,
  context: { params: Promise<{ edition: string; candidateId: string }> },
) {
  return withFrontendReadRequest(async () => {
    try {
      const { edition, candidateId } = await context.params;
      return NextResponse.json(
        await candidateHistory(await requireUser(), edition, candidateId),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return apiError(error);
    }
  });
}
