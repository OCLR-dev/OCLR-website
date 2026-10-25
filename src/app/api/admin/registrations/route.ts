import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff";
import { listApplications } from "@/lib/staff";
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
