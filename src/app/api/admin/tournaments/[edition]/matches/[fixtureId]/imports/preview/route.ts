import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { previewFixtureMatch } from "@/lib/results";
import { previewMatchImportWrite } from "@/lib/match-result-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string; fixtureId: string }> },
) {
  try {
    requireSameOrigin(request);
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(
      await previewFixtureMatch(
        await requireUser(),
        edition,
        fixtureId,
        await readJson(request, previewMatchImportWrite.maxBodyBytes),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
