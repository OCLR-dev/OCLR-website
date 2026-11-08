import { refreshStaffProfileWrite } from "@/lib/admin-operations-write-contracts";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { staffPlayerProfile } from "@/lib/player-profiles";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(
      await staffPlayerProfile(
        await requireUser(),
        await readJson(request, refreshStaffProfileWrite.maxBodyBytes),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
