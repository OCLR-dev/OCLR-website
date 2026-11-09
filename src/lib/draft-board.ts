import type { DraftData } from "./draft-data";
import type {
  CaptainBoard,
  DraftBoard,
  DraftIdentity,
  DraftTeam,
} from "./draft-types";
import { HttpError } from "./http-error";

export function availableDraftPool(data: DraftData) {
  return data.identities.filter(
    (p) => !data.members.some((m) => m.membership.userId === p.osuId),
  );
}
function board(data: DraftData): DraftBoard {
  const session = data.session!;
  const teamMap = new Map<string, DraftTeam>(
    data.teams.map(({ team, captainName }) => [
      team.id,
      {
        id: team.id,
        name: team.name,
        captain: { osuId: team.captainId, username: captainName },
      },
    ]),
  );
  const identityMap = new Map<number, DraftIdentity>(
    data.identities.map((p) => [p.osuId, p]),
  );
  return {
    sessionId: session.id,
    version: session.publicVersion + 1,
    state: session.state,
    turnIndex: session.turnIndex,
    turnCount: session.turnSequence.length,
    activeTeam: ["ready", "live", "paused"].includes(session.state)
      ? (teamMap.get(session.turnSequence[session.turnIndex]) ?? null)
      : null,
    picks: data.picks
      .filter((p) => !p.voidedAt)
      .map((p) => {
        const team = teamMap.get(p.teamId);
        const player = identityMap.get(p.playerId);
        if (!team || !player)
          throw new HttpError(
            409,
            "Draft identity integrity requires staff recovery.",
          );
        return { id: p.id, turnIndex: p.turnIndex, team, player };
      }),
    rosters: data.teams.map(({ team }) => ({
      team: teamMap.get(team.id)!,
      players: data.members
        .filter((m) => m.membership.teamId === team.id)
        .map((m) => ({ osuId: m.membership.userId, username: m.username })),
    })),
    pool: data.edition?.poolPublished ? availableDraftPool(data) : null,
  };
}
export function buildDraftSnapshots(
  data: DraftData,
  release = Boolean(data.session?.publicSnapshot),
) {
  const session = data.session!;
  const snapshot = board(data);
  const published =
    release &&
    data.teams.every((t) => t.team.identityPublished && t.captainPublished);
  const captainSnapshot: CaptainBoard = {
    ...snapshot,
    capacities: Object.fromEntries(
      data.teams.map(({ team }) => [team.id, team.capacity]),
    ),
    engineRevision: session.version,
    turnSequence: session.turnSequence,
    eligiblePool: availableDraftPool(data),
  };
  return {
    publicSnapshot: published ? snapshot : null,
    captainSnapshot,
    publicVersion: snapshot.version,
    publishedRevision: published ? session.version : -1,
  };
}
