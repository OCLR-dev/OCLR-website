import { liveSnapshot } from "@/lib/live-snapshot";
import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { after, NextResponse } from "next/server";
import { publicDraft } from "@/lib/draft";
import { publicBroadcastDraft } from "@/lib/broadcast";
import { apiError } from "@/lib/http";
async function readGET(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const { edition } = await context.params;
    const query = new URL(request.url).searchParams;
    const board =
      query.get("overlay") === "1"
        ? await publicBroadcastDraft(
            edition,
            query.get("live") === "1" ? undefined : after,
          )
        : await publicDraft(edition);
    return NextResponse.json(board, {
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
  return liveSnapshot(request, `draft-public:${edition}`, () =>
    withFrontendReadRequest(() => readGET(request, context)),
  );
}
