import { createHash } from "node:crypto";
import type { HistoricalArchive } from "./historical-archive";

export function statisticsArchiveKey(a: HistoricalArchive) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        editionSlug: a.editionSlug,
        teams: a.teams.map(({ id, name }) => ({ id, name })),
        players: a.players.map(({ osuId, username, teamId, role, tier }) => ({
          osuId,
          username,
          teamId,
          role,
          tier,
        })),
        matches: a.matches.map(
          ({
            id,
            label,
            stage,
            teamA,
            teamB,
            scheduledAt,
            score,
            forfeitWinner,
            mpUrls,
          }) => ({
            id,
            label,
            stage,
            teamA,
            teamB,
            scheduledAt,
            score,
            forfeitWinner,
            mpUrls,
          }),
        ),
        pools: a.pools.map(({ id, maps }) => ({
          id,
          maps: maps.map(({ beatmapId, title, sourceTitle, slot }) => ({
            beatmapId,
            // Recovered display titles retain the original statistics identity.
            title: sourceTitle === undefined ? title : sourceTitle,
            slot,
          })),
        })),
      }),
    )
    .digest("hex");
}
