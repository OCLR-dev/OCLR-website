import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { publicBracket } from "@/lib/brackets";
import { getPublicEdition } from "@/lib/content";
import { apiError, HttpError } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const { edition } = await context.params;
    if (!(await getPublicEdition(edition)))
      throw new HttpError(404, "Edition not found.");
    return NextResponse.json(
      { bracket: await publicBracket(edition) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
