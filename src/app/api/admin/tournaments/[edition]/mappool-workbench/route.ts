import { NextResponse } from "next/server";
import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { requireUser } from "@/lib/auth/user";
import { changeMappoolWorkbenchWrite } from "@/lib/mappool-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { selectionWorkspace } from "@/lib/mappool-workbench-reads";
import { beatmapHistory } from "@/lib/mappool-history";
type Context = { params: Promise<{ edition: string }> };
export async function GET(request: Request, context: Context) {
  return withFrontendReadRequest(async () => {
    try {
      const actor = await requireUser();
      const { edition } = await context.params;
      const beatmap = new URL(request.url).searchParams.get("beatmap");
      return NextResponse.json(
        beatmap === null
          ? await selectionWorkspace(actor, edition)
          : await beatmapHistory(actor, edition, beatmap),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return apiError(error);
    }
  });
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition } = await context.params;
    const input = await readJson(
      request,
      changeMappoolWorkbenchWrite.maxBodyBytes,
    );
    const preview =
      input &&
      typeof input === "object" &&
      "action" in input &&
      input.action === "preview";
    const result = preview
      ? await (
          await import("@/lib/mappool-workbench-preview")
        ).previewCandidates(actor, edition, {
          text: "text" in input ? input.text : null,
          category: "category" in input ? input.category : undefined,
        })
      : await (
          await import("@/lib/mappool-workbench")
        ).selectionCommand(actor, edition, input);
    if (!preview)
      revalidateCommittedPath(
        `/admin/tournaments/${edition}/mappool-workbench`,
      );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
