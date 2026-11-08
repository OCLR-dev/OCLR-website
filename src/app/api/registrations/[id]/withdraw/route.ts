import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { withdrawRegistration } from "@/lib/registrations";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import {
  withdrawRegistrationWrite,
  type RegistrationReceipt,
} from "@/lib/registration-write-contract";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const saved = await withdrawRegistration(
      user,
      id,
      await readJson(request, withdrawRegistrationWrite.maxBodyBytes),
    );
    return NextResponse.json(
      { id: saved.id, status: saved.status } satisfies RegistrationReceipt,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
