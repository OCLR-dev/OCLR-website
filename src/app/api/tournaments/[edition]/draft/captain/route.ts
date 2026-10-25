import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { captainDraft } from "@/lib/draft";
import { apiError } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const user = await requireUser();
    const { edition } = await context.params;
    return NextResponse.json(await captainDraft(user, edition), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
