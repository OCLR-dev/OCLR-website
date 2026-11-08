import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { changeMappoolWorkbenchWrite } from "@/lib/mappool-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import {
  selectionWorkspace,
  previewCandidates,
  selectionCommand,
} from "@/lib/mappool-workbench";
type Context = { params: Promise<{ edition: string }> };
export async function GET(_request: Request, context: Context) {
  return withFrontendReadRequest(async () => {
    try {
      return NextResponse.json(
        await selectionWorkspace(
          await requireUser(),
          (await context.params).edition,
        ),
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
      ? await previewCandidates(actor, edition, {
          text: "text" in input ? input.text : null,
          category: "category" in input ? input.category : undefined,
        })
      : await selectionCommand(actor, edition, input);
    if (!preview)
      revalidatePath(`/admin/tournaments/${edition}/mappool-workbench`);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
