import { withFrontendReadRequest } from "@/lib/frontend-read-context";
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
      await updateSiteSettings(await requireUser(), await readJson(request)),
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
