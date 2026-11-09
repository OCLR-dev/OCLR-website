import { NextResponse } from "next/server";
import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { scheduleWorkspace } from "@/lib/schedule-reads";
import { scheduleRequestWrite } from "@/lib/scheduling-write-contracts";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ edition: string }> },
) {
  try {
    const actor = await requireUser();
    const { edition } = await params;
    return NextResponse.json(await scheduleWorkspace(actor, edition), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition } = await params;
    const input = await readJson(request, scheduleRequestWrite.maxBodyBytes);
    const { scheduleCommand } = await import("@/lib/schedule");
    const saved = await scheduleCommand(actor, edition, input);
    revalidateCommittedPath(`/tournaments/${edition}`, "layout");
    revalidateCommittedPath(`/admin/tournaments/${edition}`, "layout");
    return NextResponse.json(saved, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
