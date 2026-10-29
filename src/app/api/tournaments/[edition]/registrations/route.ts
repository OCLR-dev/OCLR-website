import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { submitRegistration, ApplicationFieldError } from "@/lib/registrations";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { registrationBodyLimit } from "@/lib/request-body-limits";
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { edition } = await context.params;
    const saved = await submitRegistration(
      user,
      edition,
      await readJson(request, registrationBodyLimit),
    );
    return NextResponse.json(
      { id: saved.id, status: saved.status },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof ApplicationFieldError)
      return NextResponse.json(
        { error: error.message, field: error.field },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    return apiError(error);
  }
}
