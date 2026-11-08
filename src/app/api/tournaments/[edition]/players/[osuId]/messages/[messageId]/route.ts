import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { changePlayerMessage } from "@/lib/player-messages";
import {
  deletePlayerMessageWrite,
  editPlayerMessageWrite,
} from "@/lib/player-message-write-contract";
type Context = {
  params: Promise<{ edition: string; osuId: string; messageId: string }>;
};
async function change(
  request: Request,
  context: Context,
  operation: "edit" | "delete",
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, osuId, messageId } = await context.params;
    const contract =
      operation === "edit" ? editPlayerMessageWrite : deletePlayerMessageWrite;
    return NextResponse.json(
      await changePlayerMessage(
        actor,
        edition,
        Number(osuId),
        messageId,
        operation,
        await readJson(request, contract.maxBodyBytes),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  return change(request, context, "edit");
}
export async function DELETE(request: Request, context: Context) {
  return change(request, context, "delete");
}
