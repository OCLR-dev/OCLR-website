import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { postPlayerMessage, publicPlayerMessages } from "@/lib/player-messages";
type Context = { params: Promise<{ edition: string; osuId: string }> };
const headers = { "Cache-Control": "no-store" };
async function readGET(_request: Request, context: Context) {
  try {
    const { edition, osuId } = await context.params;
    return NextResponse.json(
      await publicPlayerMessages(edition, Number(osuId)),
      { headers },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, osuId } = await context.params;
    return NextResponse.json(
      await postPlayerMessage(
        actor,
        edition,
        Number(osuId),
        await readJson(request, 8192),
      ),
      { status: 201, headers },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
