import { NextResponse } from "next/server";
import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { practiceWrite } from "@/lib/player-workspace-contracts";
import {
  assertDirectPlayerWorkspace,
  playerPracticeCommand,
  playerPracticeWorkspace,
} from "@/lib/player-workspace";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ edition: string }> },
) {
  try {
    assertDirectPlayerWorkspace();
    const actor = await requireUser(),
      { edition } = await params;
    const pool = new URL(request.url).searchParams.get("pool") ?? undefined;
    return NextResponse.json(
      await playerPracticeWorkspace(actor, edition, pool),
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
    const result = await playerPracticeCommand(
      actor,
      edition,
      await readJson(request, practiceWrite.maxBodyBytes),
    );
    revalidateCommittedPath(`/tournaments/${edition}/player/practice`);
    return NextResponse.json(practiceWrite.response.parse(result), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
