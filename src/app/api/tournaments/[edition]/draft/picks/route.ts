import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { pickPlayer } from "@/lib/draft";
import { pickPlayerWrite } from "@/lib/draft-setup-write-contracts";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition } = await context.params;
    return NextResponse.json(
      await pickPlayer(
        actor,
        edition,
        await readJson(request, pickPlayerWrite.maxBodyBytes),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
