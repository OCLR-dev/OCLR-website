import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { manageOsuImagesWrite } from "@/lib/admin-operations-write-contracts";
import { manageOsuImages } from "@/lib/osu-image-cache";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const command = await readJson(request, manageOsuImagesWrite.maxBodyBytes);
    return Response.json(await manageOsuImages(actor, command), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
