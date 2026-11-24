import { requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { HttpError } from "@/lib/http-error";
import { manageOsuImagesWrite } from "@/lib/admin-operations-write-contracts";
import { manageOsuImages } from "@/lib/osu-image-cache";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const parsed = manageOsuImagesWrite.request.safeParse(
      await readJson(request, manageOsuImagesWrite.maxBodyBytes),
    );
    if (!parsed.success)
      throw new HttpError(400, "Invalid image cache settings or ID.");
    return Response.json(await manageOsuImages(actor, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
