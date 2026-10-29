import { currentUser, requireUser } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin, HttpError } from "@/lib/http";
import { readChess, writeChess } from "@/lib/ocl-chess";
import { remoteMode } from "@/lib/data-source";
function available() {
  if (remoteMode()) throw new HttpError(503, "The canvas is unavailable.");
}
export async function GET() {
  try {
    available();
    return Response.json(await readChess(await currentUser()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
async function write(request: Request, admin: boolean) {
  try {
    available();
    requireSameOrigin(request);
    return Response.json(
      await writeChess(
        await requireUser(),
        await readJson(request, 2048),
        admin,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  return write(request, false);
}
export async function PATCH(request: Request) {
  return write(request, true);
}
