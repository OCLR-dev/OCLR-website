import { updateSiteAppearanceWrite } from "@/lib/admin-operations-write-contracts";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { siteSettingsForAdmin, updateSiteSettings } from "@/lib/site-settings";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";

async function readGET() {
  try {
    return NextResponse.json(await siteSettingsForAdmin(await requireUser()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(
      await updateSiteSettings(
        await requireUser(),
        await readJson(request, updateSiteAppearanceWrite.maxBodyBytes),
      ),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
