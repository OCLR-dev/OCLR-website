import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { mappoolWorkspace, mappoolCommand } from "@/lib/mappools";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
async function readGET(
  _request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    const user = await requireUser();
    const { edition } = await context.params;
    return NextResponse.json(await mappoolWorkspace(user, edition), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ edition: string }> },
) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const { edition } = await context.params;
    const result = await mappoolCommand(user, edition, await readJson(request));
    revalidatePath(`/admin/tournaments/${edition}`, "layout");
    revalidatePath(`/tournaments/${edition}`, "layout");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
