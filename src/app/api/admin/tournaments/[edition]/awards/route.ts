import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { awardCommand, awardWorkspace } from "@/lib/awards";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
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
    return NextResponse.json(
      await awardCommand(
        await requireUser(),
        (await context.params).edition,
        await readJson(request, 524288),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
