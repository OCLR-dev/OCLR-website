import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { NextResponse } from "next/server";
import { publicAwards } from "@/lib/award-reads";
import { apiError, HttpError } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const data = await publicAwards((await context.params).edition);
    if (!data) throw new HttpError(404, "Tournament not found.");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
