import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { awardWorkspace } from "@/lib/award-reads";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { changeAwardsWrite } from "@/lib/results-publication-write-contracts";
type Context = { params: Promise<{ edition: string }> };
async function readGET(_request: Request, context: Context) {
  try {
    return NextResponse.json(
      await awardWorkspace(await requireUser(), (await context.params).edition),
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
    const { edition } = await context.params;
    const input = await readJson(request, changeAwardsWrite.maxBodyBytes);
    const { awardCommand } = await import("@/lib/awards");
    return NextResponse.json(
      await awardCommand(actor, edition, input),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
