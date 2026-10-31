import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { scheduleCommand, scheduleWorkspace } from "@/lib/schedule";
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
    await scheduleCommand(actor, edition, await readJson(request));
    revalidatePath(`/tournaments/${edition}`, "layout");
    revalidatePath(`/admin/tournaments/${edition}`, "layout");
    return NextResponse.json(
      { saved: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
