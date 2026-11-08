import { queueAdminBackupWrite } from "@/lib/admin-operations-write-contracts";
import {
  backupActor,
  operatorRequest,
  BackupServiceError,
} from "@/lib/admin-backups";
import { apiError, HttpError, requireSameOrigin } from "@/lib/http";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(request: Request) {
  try {
    const actor = await backupActor(),
      id = new URL(request.url).searchParams.get("download");
    if (id && !/^[a-f0-9-]{36}$/.test(id))
      throw new HttpError(400, "Invalid request.");
    const data = await operatorRequest(
      id ? "/download/" + id : "/jobs",
      "GET",
      actor.osuId,
    );
    return new Response(new Uint8Array(data), {
      headers: {
        ...headers,
        "Content-Type": id ? "application/octet-stream" : "application/json",
        ...(id
          ? { "Content-Disposition": `attachment; filename="${id}.oclr"` }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof BackupServiceError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers },
      );
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await backupActor();
    const url = new URL(request.url);
    const action = queueAdminBackupWrite.query.action.safeParse(
      url.searchParams.get("action"),
    );
    if (!action.success) throw new HttpError(400, "Invalid request.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    if (reader)
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > queueAdminBackupWrite.maxBodyBytes) {
            await reader.cancel();
            throw new HttpError(413, "Backup file is too large.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    const query = new URLSearchParams({ action: action.data });
    for (const key of ["source", "confirm"])
      if (url.searchParams.has(key)) query.set(key, url.searchParams.get(key)!);
    const data = await operatorRequest(
      "/jobs?" + query,
      "POST",
      actor.osuId,
      Buffer.concat(chunks),
    );
    return new Response(new Uint8Array(data), {
      status: queueAdminBackupWrite.successStatus,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof BackupServiceError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers },
      );
    return apiError(error);
  }
}
