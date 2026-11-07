import { liveSnapshot } from "@/lib/live-snapshot";
import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { refereeCommand, refereeWorkspace } from "@/lib/referee";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
type Context = { params: Promise<{ edition: string; fixtureId: string }> };
async function readGET(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(
      await refereeWorkspace(actor, edition, fixtureId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(
      await refereeCommand(actor, edition, fixtureId, await readJson(request)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(
  request: Request,
  context: Parameters<typeof readGET>[1],
) {
  const { fixtureId } = await context.params;
  return liveSnapshot(request, `referee:${fixtureId}`, () =>
    withFrontendReadRequest(() => readGET(request, context)),
  );
}
