import { apiError, HttpError } from "@/lib/http";
import { loadPublicMappoolReplay } from "@/lib/public-mappool-replays";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      edition: string;
      poolId: string;
      entryId: string;
      replayId: string;
      asset: string;
    }>;
  },
) {
  try {
    const { edition, poolId, entryId, replayId, asset } = await params;
    if (
      asset !== "replay.osr" &&
      asset !== "beatmap.osz" &&
      asset !== "skin.osk"
    )
      throw new HttpError(404, "The replay playback asset is missing.");
    const bytes = await loadPublicMappoolReplay(
      edition,
      poolId,
      entryId,
      replayId,
      asset,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
