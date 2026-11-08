import { NextResponse } from "next/server";
import { revalidateCommittedPath } from "@/lib/next-revalidation";
import { requireUser } from "@/lib/auth/user";
import { changeRegistrationParticipation } from "@/lib/staff";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";

import { removeRegistrationWrite } from "@/lib/registration-write-contract";

export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string; id: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, id } = await context.params;
    const result = await changeRegistrationParticipation(
      actor,
      edition,
      id,
      "remove",
      await readJson(request, removeRegistrationWrite.maxBodyBytes),
    );
    revalidateCommittedPath("/admin", "layout");
    revalidateCommittedPath("/players", "layout");
    revalidateCommittedPath(`/tournaments/${edition}`, "layout");
    revalidateCommittedPath("/dashboard");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
