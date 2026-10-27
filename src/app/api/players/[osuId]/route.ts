import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { frontendProfile } from "@/lib/frontend-data";
import { apiError, HttpError } from "@/lib/http";
async function readGET(
  request: Request,
  { params }: { params: Promise<{ osuId: string }> },
) {
  try {
    if (request.headers.has("authorization"))
      throw new HttpError(403, "Use a browser session for this operation.");
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((key) => key !== "edition") ||
      query.getAll("edition").length > 1 ||
      (query.has("edition") && !/^[a-z0-9-]+$/.test(query.get("edition")!))
    )
      throw new HttpError(
        400,
        "Choose valid API query parameters without duplicates.",
      );
    const result = await frontendProfile(
      (await params).osuId,
      query.get("edition") ?? undefined,
    );
    // A known identity remains a valid resource when provider statistics fail.
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
