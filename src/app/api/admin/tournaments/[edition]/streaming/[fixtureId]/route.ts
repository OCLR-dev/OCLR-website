import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { streamingWorkspace } from "@/lib/streaming-workspace";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { streamingTaskWrite } from "@/lib/scheduling-write-contracts";
type Context = { params: Promise<{ edition: string; fixtureId: string }> };
async function readGET(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(
      await streamingWorkspace(actor, edition, {}, fixtureId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    const input = await readJson(request, streamingTaskWrite.maxBodyBytes);
    const { streamingCommand } = await import("@/lib/streaming");
    const saved = await streamingCommand(actor, edition, fixtureId, input);
    revalidateCommittedPath(`/admin/tournaments/${edition}`, "layout");
    return NextResponse.json(saved, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
