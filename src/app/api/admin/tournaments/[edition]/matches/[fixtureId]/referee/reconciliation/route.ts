import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { reconcileRefereeAttemptWrite } from "@/lib/referee-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import {
  refereeReconciliation,
  reconcileRefereeAttempt,
} from "@/lib/referee-reconciliation";
type Context = { params: Promise<{ edition: string; fixtureId: string }> };
async function readGET(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { edition, fixtureId } = await context.params;
    return NextResponse.json(
      await refereeReconciliation(actor, edition, fixtureId),
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
    return NextResponse.json(
      await reconcileRefereeAttempt(
        actor,
        edition,
        fixtureId,
        await readJson(request, reconcileRefereeAttemptWrite.maxBodyBytes),
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
