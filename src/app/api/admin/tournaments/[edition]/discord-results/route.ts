import { requireUser } from "@/lib/auth/user";
import { updateDiscordResultSettingsWrite } from "@/lib/discord-result-contract";
import { saveDiscordResultSettings } from "@/lib/discord-result-settings";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition } = await params;
    const input = await readJson(
      request,
      updateDiscordResultSettingsWrite.maxBodyBytes,
    );
    const saved = await saveDiscordResultSettings(actor, edition, input);
    return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
