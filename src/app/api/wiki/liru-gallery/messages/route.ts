import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { postLiruGalleryMessageWrite } from "@/lib/liru-gallery-message-write-contract";
import {
  postLiruGalleryMessage,
  publicLiruGalleryMessages,
} from "@/lib/liru-gallery-messages";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return NextResponse.json(
      await withFrontendReadRequest(publicLiruGalleryMessages),
      { headers },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const input = await readJson(
      request,
      postLiruGalleryMessageWrite.maxBodyBytes,
    );
    return NextResponse.json(await postLiruGalleryMessage(actor, input), {
      status: postLiruGalleryMessageWrite.successStatus,
      headers,
    });
  } catch (error) {
    return apiError(error);
  }
}
