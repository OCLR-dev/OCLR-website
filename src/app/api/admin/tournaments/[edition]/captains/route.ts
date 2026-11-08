import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff-request";
import { captainSetup, updateCaptains } from "@/lib/captains";
import { changeCaptainsWrite } from "@/lib/draft-setup-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const actor = await requireStaff();
    const { edition } = await context.params;
    return NextResponse.json(await captainSetup(actor, edition), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireStaff();
    const { edition } = await context.params;
    return NextResponse.json(
      await updateCaptains(
        actor,
        edition,
        await readJson(request, changeCaptainsWrite.maxBodyBytes),
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
