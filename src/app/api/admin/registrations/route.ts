import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff-request";
import { listApplications } from "@/lib/staff-registration-reads";
import { apiError } from "@/lib/http";
async function readGET(request: NextRequest) {
  try {
    return NextResponse.json(
      await listApplications(
        await requireStaff(),
        Object.fromEntries(request.nextUrl.searchParams),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
