import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { lookupArchiveStaffIdentity } from "@/lib/archive-staff-identity";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(
      await lookupArchiveStaffIdentity(
        await requireUser(),
        (await context.params).edition,
        await readJson(request, 4096),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
