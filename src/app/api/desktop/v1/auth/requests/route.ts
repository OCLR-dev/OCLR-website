import { requestDesktopAuthWrite } from "@/lib/desktop-auth-write-contracts";
import {
  DesktopError,
  createDesktopAuthorization,
  desktopResponse,
  desktopError,
} from "@/lib/desktop-auth";
import { readJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    if (request.headers.has("authorization"))
      throw new DesktopError(403, "INSUFFICIENT_SCOPE");
    const result = await createDesktopAuthorization(
      await readJson(request, requestDesktopAuthWrite.maxBodyBytes),
    );
    return desktopResponse(result, requestDesktopAuthWrite.successStatus);
  } catch (e) {
    return desktopError(e);
  }
}
