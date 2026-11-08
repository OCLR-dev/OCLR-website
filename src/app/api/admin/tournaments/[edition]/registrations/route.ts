import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { addManualRegistration } from "@/lib/manual-registrations";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { addManualRegistrationWrite } from "@/lib/manual-registration-write-contract";
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition } = await context.params;
    const registration = await addManualRegistration(
      actor,
      edition,
      await readJson(request, addManualRegistrationWrite.maxBodyBytes),
    );
    return NextResponse.json(
      {
        id: registration.id,
        userId: registration.userId,
        status: registration.status,
      },
      {
        status: addManualRegistrationWrite.successStatus,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
