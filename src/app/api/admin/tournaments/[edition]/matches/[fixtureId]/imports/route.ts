import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { importFixtureMatch } from "@/lib/results";
import { importMatchResultWrite } from "@/lib/match-result-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string; fixtureId: string }> },
) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { edition, fixtureId } = await context.params;
    const result = await importFixtureMatch(
      user,
      edition,
      fixtureId,
      await readJson(request, importMatchResultWrite.maxBodyBytes),
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
