import { remoteMode } from "@/lib/data-source";
import { frontendLegacyPlayers } from "@/lib/frontend-legacy";
import { NextResponse } from "next/server";
import { publicPlayers } from "@/lib/players";
import { apiError, HttpError } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if ([...new Set(query.keys())].some((key) => query.getAll(key).length > 1))
      throw new HttpError(400, "Choose one tournament, search and page.");
    return NextResponse.json(
      await (remoteMode() ? frontendLegacyPlayers : publicPlayers)(
        Object.fromEntries(query),
      ),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
