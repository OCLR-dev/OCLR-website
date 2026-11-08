import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { matchReview, resultCommand } from "@/lib/results";
import { changeMatchResultWrite } from "@/lib/match-result-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string; fixtureId: string }> },
) {
  try {
    const user = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(await matchReview(user, edition, fixtureId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string; fixtureId: string }> },
) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { edition, fixtureId } = await context.params;
    const result = await resultCommand(
      user,
      edition,
      fixtureId,
      await readJson(request, changeMatchResultWrite.maxBodyBytes),
    );
    if (result.publicChanged)
      revalidatePath(`/tournaments/${edition}`, "layout");
    return NextResponse.json(result.review, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
