import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { changeRefereeIrcBrowserWrite } from "@/lib/referee-irc-browser-contract";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { refereeIrcView } from "@/lib/referee-irc-reads";
type Context = { params: Promise<{ edition: string; fixtureId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(await refereeIrcView(actor, edition, fixtureId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    const input = await readJson(
      request,
      changeRefereeIrcBrowserWrite.maxBodyBytes,
    );
    const { refereeIrcBrowserCommand } = await import("@/lib/referee-irc");
    return NextResponse.json(
      await refereeIrcBrowserCommand(actor, edition, fixtureId, input),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
