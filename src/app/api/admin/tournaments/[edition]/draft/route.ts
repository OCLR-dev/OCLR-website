import { liveSnapshot } from "@/lib/live-snapshot";
import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff";
import { draftCommand, staffDraft } from "@/lib/draft";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { draftCommandBodyLimit } from "@/lib/request-body-limits";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const actor = await requireStaff();
    const { edition } = await context.params;
    return NextResponse.json(await staffDraft(actor, edition), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireStaff();
    const { edition } = await context.params;
    return NextResponse.json(
      await draftCommand(
        actor,
        edition,
        await readJson(request, draftCommandBodyLimit),
      ),
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
  const { edition } = await context.params;
  return liveSnapshot(request, `draft-private:${edition}`, () =>
    withFrontendReadRequest(() => readGET(request, context)),
  );
}
