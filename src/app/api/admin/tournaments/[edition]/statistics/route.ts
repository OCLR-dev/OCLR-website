import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { statisticsWorkspace } from "@/lib/archive-statistics-reads";
import { changeHistoricalStatisticsWrite } from "@/lib/results-publication-write-contracts";
type Context = { params: Promise<{ edition: string }> };
async function readGET(request: Request, context: Context) {
  try {
    return NextResponse.json(
      await statisticsWorkspace(
        await requireUser(),
        (await context.params).edition,
        new URL(request.url).searchParams.get("fixture") ?? "",
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition } = await context.params;
    const input = await readJson(
      request,
      changeHistoricalStatisticsWrite.maxBodyBytes,
    );
    const { statisticsCommand } = await import("@/lib/archive-statistics");
    return NextResponse.json(await statisticsCommand(actor, edition, input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
