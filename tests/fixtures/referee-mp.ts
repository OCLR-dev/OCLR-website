import { createHash } from "node:crypto";
import type { RefereeWorkspace } from "../../src/lib/referee";
import {
  OPEN_MATCH_WARNING,
  type MatchSource,
} from "../../src/lib/match-model";
export function mpSource(
  w: RefereeWorkspace,
  options: { gameId?: number; matchId?: number; tie?: boolean } = {},
): MatchSource {
  const pick = w.projection.activeSelections.findLast((s) => s.kind !== "ban")!;
  const time = Date.parse(w.events.find((e) => e.id === pick.id)!.createdAt);
  const game = {
    id: options.gameId ?? 880001,
    beatmapId: pick.beatmapId,
    startTime: new Date(time + 1000).toISOString(),
    endTime: new Date(time + 2000).toISOString(),
    mode: w.rules!.mode,
    teamType: w.rules!.teamType,
    scoringType: w.rules!.scoringType,
    mods: ["NF"],
    scores: w.teams.flatMap((team, index) =>
      team.members!.slice(0, w.rules!.playersPerTeam).map((p, slot) => ({
        osuId: p.osuId,
        total: index === 0 || options.tie ? 900 : 500,
        team: index === 0 ? ("blue" as const) : ("red" as const),
        slot: index * 8 + slot,
        passed: true,
        mods: [],
        accuracy: 1,
        combo: 100,
        providerFields: {},
        problems: [],
      })),
    ),
    problems: [],
    beatmap: null,
  };
  const value: MatchSource = {
    schemaVersion: 1,
    apiVersion: "20220705",
    fetchedAt: new Date(time + 4000).toISOString(),
    fingerprint: "a".repeat(64),
    match: {
      id: options.matchId ?? 880001,
      title: "Synthetic MP sync",
      startTime: new Date(time).toISOString(),
      endTime: null,
    },
    firstEventId: 1,
    latestEventId: 1,
    currentGameId: null,
    pages: 1,
    complete: true,
    warnings: [OPEN_MATCH_WARNING],
    events: [
      {
        id: 1,
        at: game.endTime,
        type: "other",
        actorOsuId: null,
        gameId: game.id,
      },
    ],
    games: [game],
  };
  return fingerprint(value);
}
export function fingerprint(source: MatchSource) {
  source.fingerprint = createHash("sha256")
    .update(JSON.stringify(source.games))
    .digest("hex");
  return source;
}
