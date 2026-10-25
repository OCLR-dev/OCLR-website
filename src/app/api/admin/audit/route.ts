import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { auditLog } from "@/lib/audit";
import { apiError } from "@/lib/http";
async function readGET(request: Request) {
  try {
    return NextResponse.json(
      await auditLog(
        await requireUser(),
        Object.fromEntries(new URL(request.url).searchParams),
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
