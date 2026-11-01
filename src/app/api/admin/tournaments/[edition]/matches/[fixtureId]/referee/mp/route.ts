import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { refereeMpCommand } from "@/lib/referee-mp";
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string; fixtureId: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(
      await refereeMpCommand(
        actor,
        edition,
        fixtureId,
        await readJson(request),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
