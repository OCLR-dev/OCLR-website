import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff";
import { reviewApplication } from "@/lib/staff";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { reviewRegistrationWrite } from "@/lib/registration-write-contract";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireStaff();
    const { id } = await context.params;
    return NextResponse.json(
      await reviewApplication(
        actor,
        id,
        await readJson(request, reviewRegistrationWrite.maxBodyBytes),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
