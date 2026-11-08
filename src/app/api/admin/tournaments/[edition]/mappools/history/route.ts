import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { assertReadCapability } from "@/lib/auth/staff";
import { historicalPoolChoices } from "@/lib/exhibition-pools";
import { apiError } from "@/lib/http";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";
export async function GET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  return withFrontendReadRequest(async () => {
    try {
      const actor = await requireUser();
      const { edition } = await context.params;
      await assertReadCapability(actor, "manage_mappools", edition);
      return NextResponse.json(await historicalPoolChoices(edition), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
