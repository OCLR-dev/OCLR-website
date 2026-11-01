import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import {
  assertDirectPlayerWorkspace,
  playerTimetableCommand,
  playerTimetableWorkspace,
} from "@/lib/player-workspace";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ edition: string }> },
) {
  try {
    assertDirectPlayerWorkspace();
    const actor = await requireUser(),
      { edition } = await params;
    const player = new URL(request.url).searchParams.get("player");
    return NextResponse.json(
      await playerTimetableWorkspace(
        actor,
        edition,
        player === null ? actor.osuId : Number(player),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ edition: string }> },
) {
  try {
    assertDirectPlayerWorkspace();
    requireSameOrigin(request);
    const actor = await requireUser(),
      { edition } = await params;
    const result = await playerTimetableCommand(
      actor,
      edition,
      await readJson(request),
    );
    revalidatePath(`/tournaments/${edition}/player/availability`);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
