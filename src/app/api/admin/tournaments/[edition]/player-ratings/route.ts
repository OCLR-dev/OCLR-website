import { requireStaff } from "@/lib/auth/staff-request";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { importPlayerRatingsWrite } from "@/lib/player-rating-import-contract";
import { importPlayerRatings } from "@/lib/player-rating-import";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireStaff();
    const { edition } = await context.params;
    const input = await readJson(
      request,
      importPlayerRatingsWrite.maxBodyBytes,
    );
    return NextResponse.json(await importPlayerRatings(actor, edition, input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
