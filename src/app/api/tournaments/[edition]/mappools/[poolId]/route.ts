import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { publicMappools } from "@/lib/mappools";
import { apiError, HttpError } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string; poolId: string }> },
) {
  try {
    const { edition, poolId } = await context.params;
    const [pool] = await publicMappools(edition, poolId);
    if (!pool) throw new HttpError(404, "Published mappool not found.");
    return NextResponse.json(pool, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
