import { liveSnapshot } from "@/lib/live-snapshot";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff-request";
import { staffDraft } from "@/lib/draft-reads";
import { changeDraftWrite } from "@/lib/draft-setup-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
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
    const input = await readJson(request, changeDraftWrite.maxBodyBytes);
    const { draftCommand } = await import("@/lib/draft");
    return NextResponse.json(await draftCommand(actor, edition, input), {
      headers: { "Cache-Control": "no-store" },
    });
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
