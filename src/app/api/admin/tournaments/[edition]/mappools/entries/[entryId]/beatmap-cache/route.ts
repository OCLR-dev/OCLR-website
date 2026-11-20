import { requireUser } from "@/lib/auth/user";
import { beatmapCacheWrite } from "@/lib/beatmap-cache-contract";
import { apiError, HttpError, requireSameOrigin } from "@/lib/http";
import {
  changeMappoolBeatmapCache,
  mappoolBeatmapCacheStatus,
} from "@/lib/mappool-beatmap-cache";

export const runtime = "nodejs";
type Context = { params: Promise<{ edition: string; entryId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: Context) {
  try {
    const actor = await requireUser();
    const { edition, entryId } = await params;
    return Response.json(
      await mappoolBeatmapCacheStatus(actor, edition, entryId),
      { headers },
    );
  } catch (error) {
    return apiError(error);
  }
}

async function readCommand(request: Request, signal: AbortSignal) {
  const type = request.headers.get("content-type");
  if (!type?.startsWith(`${beatmapCacheWrite.requestMediaType};`))
    throw new HttpError(415, "Send the beatmap cache form.");
  if (
    Number(request.headers.get("content-length")) >
    beatmapCacheWrite.maxBodyBytes
  )
    throw new HttpError(413, "Choose an .osz beatmap package up to 64 MiB.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  let form: FormData;
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > beatmapCacheWrite.maxBodyBytes) {
        abort();
        throw new HttpError(
          413,
          "Choose an .osz beatmap package up to 64 MiB.",
        );
      }
      chunks.push(value);
    }
    form = await new Response(Buffer.concat(chunks, size), {
      headers: { "Content-Type": type },
    }).formData();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (signal.aborted)
      throw new HttpError(
        504,
        "The beatmap package operation was interrupted.",
      );
    throw new HttpError(400, "Send the beatmap cache form.");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const version = form.get("expectedVersion");
  const parsed = beatmapCacheWrite.request.safeParse({
    ...Object.fromEntries(form),
    confirmed: form.get("confirmed") === "true",
    expectedVersion:
      typeof version === "string" && /^\d+$/.test(version)
        ? Number(version)
        : null,
  });
  if (!parsed.success || new Set(form.keys()).size !== [...form.keys()].length)
    throw new HttpError(
      400,
      "Confirm the current pool version and a valid beatmap cache operation.",
    );
  return parsed.data;
}

export async function POST(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition, entryId } = await params;
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(90_000),
    ]);
    const result = await changeMappoolBeatmapCache(
      actor,
      edition,
      entryId,
      () => readCommand(request, signal),
      signal,
    );
    return Response.json(result, {
      status: beatmapCacheWrite.successStatus,
      headers,
    });
  } catch (error) {
    return apiError(error);
  }
}
