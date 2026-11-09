import {
  requireDesktopUser,
  desktopResponse,
  desktopError,
} from "@/lib/desktop-auth";
import { readJson } from "@/lib/http";
import { refereeIrcRelay } from "@/lib/referee-irc-relay";
import { refereeRelayWrite } from "@/lib/referee-relay-contract";
export async function POST(
  request: Request,
  context: { params: Promise<{ fixtureId: string }> },
) {
  try {
    const actor = await requireDesktopUser(request, refereeRelayWrite.scope);
    const { fixtureId } = await context.params;
    return desktopResponse(
      await refereeIrcRelay(
        actor,
        fixtureId,
        await readJson(request, refereeRelayWrite.maxBodyBytes),
      ),
      refereeRelayWrite.successStatus,
      "Referee",
    );
  } catch (e) {
    return desktopError(e);
  }
}
