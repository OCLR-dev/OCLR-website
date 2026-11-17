import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import {
  deleteLiruGalleryMessageWrite,
  editLiruGalleryMessageWrite,
} from "@/lib/liru-gallery-message-write-contract";
import { changeLiruGalleryMessage } from "@/lib/liru-gallery-messages";

type Context = { params: Promise<{ messageId: string }> };

async function change(
  request: Request,
  context: Context,
  operation: "edit" | "delete",
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { messageId } = await context.params;
    const contract =
      operation === "edit"
        ? editLiruGalleryMessageWrite
        : deleteLiruGalleryMessageWrite;
    const input = await readJson(request, contract.maxBodyBytes);
    return NextResponse.json(
      await changeLiruGalleryMessage(actor, messageId, operation, input),
      {
        headers: { "Cache-Control": "no-store" },
      },
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
