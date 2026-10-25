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
    const board =
      new URL(request.url).searchParams.get("overlay") === "1"
        ? await publicBroadcastDraft(edition, after)
        : await publicDraft(edition);
    return NextResponse.json(board, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
