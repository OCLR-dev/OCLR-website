import { NextResponse } from "next/server";
import { requireBrowserSession } from "@/lib/auth/user";
import { HttpError, apiError, readJson, requireSameOrigin } from "@/lib/http";
import { getLiruGachaStatus, updateLiruGacha } from "@/lib/liru-gacha";
import { updateLiruGachaWrite } from "@/lib/liru-gacha-write-contract";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await requireBrowserSession();
    return NextResponse.json(await getLiruGachaStatus(user.osuId), { headers });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireBrowserSession();
    const input = await readJson(request, updateLiruGachaWrite.maxBodyBytes);
    const parsed = updateLiruGachaWrite.request.safeParse(input);
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    return NextResponse.json(await updateLiruGacha(user.osuId, parsed.data), {
      headers,
    });
  } catch (error) {
    return apiError(error);
  }
}
