import { exchangeDesktopAuthWrite } from "@/lib/desktop-auth-write-contracts";
import {
  DesktopError,
  exchangeDesktopAuthorization,
  desktopResponse,
  desktopError,
} from "@/lib/desktop-auth";
import { readJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    if (request.headers.has("authorization"))
      throw new DesktopError(403, "INSUFFICIENT_SCOPE");
    const result = await exchangeDesktopAuthorization(
      await readJson(request, exchangeDesktopAuthWrite.maxBodyBytes),
    );
    return desktopResponse(result, exchangeDesktopAuthWrite.successStatus);
  } catch (e) {
    return desktopError(e);
  }
}
