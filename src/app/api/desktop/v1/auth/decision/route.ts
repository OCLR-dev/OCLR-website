import { decideDesktopAuthWrite } from "@/lib/desktop-auth-write-contracts";
import {
  approveDesktopAuthorization,
  desktopError,
  DesktopError,
} from "@/lib/desktop-auth";
import { requireSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/auth/user";
async function readDecisionForm(request: Request) {
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim() !==
      decideDesktopAuthWrite.requestMediaType ||
    Number(request.headers.get("content-length") ?? 0) > decideDesktopAuthWrite.maxBodyBytes
  )
    throw new DesktopError(400, "INVALID_REQUEST");
  const reader = request.body?.getReader();
  if (!reader) throw new DesktopError(400, "INVALID_REQUEST");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > decideDesktopAuthWrite.maxBodyBytes) {
        await reader.cancel();
        throw new DesktopError(400, "INVALID_REQUEST");
      }
      chunks.push(value);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DesktopError(400, "INVALID_REQUEST");
  } finally {
    reader.releaseLock();
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const form = await readDecisionForm(request);
    if (
      form.size !== 2 ||
      form.getAll("request_id").length !== 1 ||
      form.getAll("decision").length !== 1
    )
      throw new DesktopError(400, "INVALID_REQUEST");
    const parsed = decideDesktopAuthWrite.request.safeParse(
      Object.fromEntries(form),
    );
    if (!parsed.success) throw new DesktopError(400, "INVALID_REQUEST");
    const url = await approveDesktopAuthorization(
      actor,
      parsed.data.request_id,
      parsed.data.decision === "approve",
    );
    return new Response(null, {
      status: decideDesktopAuthWrite.successStatus,
      headers: {
        Location: url,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return desktopError(e);
  }
}
