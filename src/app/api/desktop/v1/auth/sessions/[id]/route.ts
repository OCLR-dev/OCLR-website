import { deleteDesktopSessionWrite } from "@/lib/desktop-auth-write-contracts";
import { revokeDesktopSession, desktopError } from "@/lib/desktop-auth";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/http";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    await revokeDesktopSession(await requireUser(), (await context.params).id);
    return new Response(null, {
      status: deleteDesktopSessionWrite.successStatus,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return desktopError(e);
  }
}
