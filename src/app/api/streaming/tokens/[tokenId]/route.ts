import { requireBrowserSession } from "@/lib/auth/user";
import { revokeStreamingToken } from "@/lib/streaming-api";
import { apiError, requireSameOrigin } from "@/lib/http";
import { revokeStreamingAccessWrite } from "@/lib/streaming-write-contract";
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  try {
    requireSameOrigin(request);
    return Response.json(
      await revokeStreamingToken(
        await requireBrowserSession(),
        (await params).tokenId,
      ),
      {
        status: revokeStreamingAccessWrite.successStatus,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
