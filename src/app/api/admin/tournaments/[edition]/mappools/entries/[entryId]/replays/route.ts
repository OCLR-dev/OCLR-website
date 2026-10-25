import { withFrontendReadRequest } from "@/lib/frontend-read-context";
import { requireUser } from "@/lib/auth/user";
import {
  authorizeReplayUpload,
  uploadMappoolReplay,
  replayList,
} from "@/lib/mappool-replays";
import { apiError, requireSameOrigin, HttpError } from "@/lib/http";
import { REPLAY_MAX_BYTES } from "@/lib/replay-model";
type Context = { params: Promise<{ edition: string; entryId: string }> };
export const runtime = "nodejs";
async function readGET(_request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { edition, entryId } = await context.params;
    return Response.json(await replayList(user, edition, entryId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(),
      { edition, entryId } = await context.params;
    await authorizeReplayUpload(user, edition, entryId);
    const type = request.headers.get("content-type");
    if (!type?.startsWith("multipart/form-data;"))
      throw new HttpError(415, "Send a replay file using the upload form.");
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "A request body is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > REPLAY_MAX_BYTES + 16384) {
          await reader.cancel();
          throw new HttpError(413, "Choose a stable .osr replay up to 8 MiB.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let form: FormData;
    try {
      form = await new Response(Buffer.concat(chunks), {
        headers: { "Content-Type": type },
      }).formData();
    } catch {
      throw new HttpError(
        400,
        "The replay upload was interrupted or invalid. Retry the file.",
      );
    }
    if (
      [...form.keys()].some(
        (k) =>
          !["file", "expectedVersion", "description", "confirmed"].includes(k),
      ) ||
      ["file", "expectedVersion", "description", "confirmed"].some(
        (k) => form.getAll(k).length !== 1,
      )
    )
      throw new HttpError(400, "Send one replay file per upload.");
    const file = form.get("file"),
      description = form.get("description");
    if (!(file instanceof File) || typeof description !== "string")
      throw new HttpError(400, "Send one replay file per upload.");
    const result = await uploadMappoolReplay(
      user,
      edition,
      entryId,
      {
        expectedVersion: Number(form.get("expectedVersion")),
        confirmed: form.get("confirmed") === "true",
      },
      file.name,
      description,
      Buffer.from(await file.arrayBuffer()),
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(...args: Parameters<typeof readGET>) {
  return withFrontendReadRequest(() => readGET(...args));
}
