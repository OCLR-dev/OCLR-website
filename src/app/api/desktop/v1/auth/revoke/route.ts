import { revokeDesktopAuthWrite } from "@/lib/desktop-auth-write-contracts";
import {
  DesktopError,
  revokeDesktopAuthorization,
  desktopError,
} from "@/lib/desktop-auth";
import { readJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    if (request.headers.has("authorization"))
      throw new DesktopError(403, "INSUFFICIENT_SCOPE");
    await revokeDesktopAuthorization(
      await readJson(request, revokeDesktopAuthWrite.maxBodyBytes),
    );
    return new Response(null, {
      status: revokeDesktopAuthWrite.successStatus,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return desktopError(e);
  }
}
