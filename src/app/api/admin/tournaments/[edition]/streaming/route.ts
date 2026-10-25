import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { streamingWorkspace } from "@/lib/streaming";
import { apiError } from "@/lib/http";
async function readGET(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const actor = await requireUser();
    const { edition } = await context.params;
    return NextResponse.json(
      await streamingWorkspace(
        actor,
        edition,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
