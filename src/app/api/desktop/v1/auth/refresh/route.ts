import { refreshDesktopAuthWrite } from "@/lib/desktop-auth-write-contracts";
import {
  DesktopError,
  refreshDesktopAuthorization,
  desktopResponse,
  desktopError,
} from "@/lib/desktop-auth";
import { readJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    if (request.headers.has("authorization"))
      throw new DesktopError(403, "INSUFFICIENT_SCOPE");
    const result = await refreshDesktopAuthorization(
      await readJson(request, refreshDesktopAuthWrite.maxBodyBytes),
    );
    return desktopResponse(result, refreshDesktopAuthWrite.successStatus);
  } catch (e) {
    return desktopError(e);
  }
}
