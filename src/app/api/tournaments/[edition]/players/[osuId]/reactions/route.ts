import { localBrowserUser, requireBrowserSession } from "@/lib/auth/user";
import { remoteMode } from "@/lib/data-source";
import { apiError, HttpError, readJson, requireSameOrigin } from "@/lib/http";
import { setPlayerReactionWrite } from "@/lib/player-reaction-write-contract";
import {
  readPlayerReactions,
  setPlayerReaction,
} from "@/lib/tournament-player-reactions";

type Context = { params: Promise<{ edition: string; osuId: string }> };
const headers = { "Cache-Control": "private, no-store" };

async function target({ params }: Context) {
  const { edition, osuId } = await params;
  const id = Number(osuId);
  if (
    !setPlayerReactionWrite.parameters.osuId.safeParse(osuId).success ||
    !Number.isSafeInteger(id)
  )
    throw new HttpError(400, "Invalid request.");
  return { edition, id };
}

export async function GET(_request: Request, context: Context) {
  try {
    if (remoteMode()) throw new HttpError(403, "Developer access is read-only.");
    const { edition, id } = await target(context);
    const viewer = await localBrowserUser();
    const rows = await readPlayerReactions(edition, viewer?.osuId, id);
    return Response.json(
      rows.map(({ id, count, selected }) => ({ id, count, selected })),
      { headers },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireBrowserSession();
    const { edition, id } = await target(context);
    const input = await readJson(request, setPlayerReactionWrite.maxBodyBytes);
    return Response.json(
      await setPlayerReaction(actor.osuId, edition, id, input),
      {
        status: setPlayerReactionWrite.successStatus,
        headers,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
