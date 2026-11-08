import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { assignFixtureReferees } from "@/lib/fixtures";
import { assignFixtureRefereesWrite } from "@/lib/fixture-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ edition: string; fixtureId: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(
      await assignFixtureReferees(
        actor,
        edition,
        fixtureId,
        await readJson(request, assignFixtureRefereesWrite.maxBodyBytes),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
