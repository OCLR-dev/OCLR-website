import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { staffBws, reviewBws } from "@/lib/bws";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
type Context = { params: Promise<{ edition: string; id: string }> };
async function readGET(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { edition, id } = await context.params;
    return NextResponse.json(
      await staffBws(
        actor,
        edition,
        id,
        new URL(request.url).searchParams.get("mode"),
      ),
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
    const { edition, id } = await context.params;
    return NextResponse.json(
      await reviewBws(actor, edition, id, await readJson(request, 8192)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
