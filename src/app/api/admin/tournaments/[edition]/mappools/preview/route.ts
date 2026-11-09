import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { previewBeatmap, previewMappoolBatch } from "@/lib/mappool-preview";
import { previewMappoolWrite } from "@/lib/mappool-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { edition } = await context.params;
    const input = await readJson(request, previewMappoolWrite.maxBodyBytes);
    return NextResponse.json(
      input && typeof input === "object" && "text" in input
        ? await previewMappoolBatch(user, edition, input)
        : await previewBeatmap(user, edition, input),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
