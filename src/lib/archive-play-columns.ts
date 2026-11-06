import { getTableColumns } from "drizzle-orm";
import { archiveReadPlays } from "@/db/schema";
import type { StatisticsPlay } from "./archive-statistics-model";

const { payload: _payload, ...columns } = getTableColumns(archiveReadPlays);
void _payload;
export const archivePlayColumns = columns;
type PlayRow = Omit<typeof archiveReadPlays.$inferSelect, "payload">;

/** Preserve the saved projection's optional-field presence without its JSONB. */
export function archivePlayFromColumns(row: PlayRow): StatisticsPlay {
  if (row.osuId === null || row.teamId === null || row.beatmapId === null)
    throw new Error("Incomplete typed public play");
  const has = (key: string) => row.optionalFields.includes(key);
  return {
    fixtureId: row.fixtureId,
    mpId: row.mpId,
    gameId: row.gameId,
    stage: row.stage,
    beatmapId: row.beatmapId,
    title: row.title,
    slot: row.slot,
    at: row.playedAt,
    osuId: row.osuId,
    teamId: row.teamId,
    ...(has("winnerTeamId") && row.winnerTeamId !== null
      ? { winnerTeamId: row.winnerTeamId }
      : {}),
    score: row.score,
    ...(has("rawScore") ? { rawScore: row.rawScore } : {}),
    ...(has("scoreMultiplier") ? { scoreMultiplier: row.scoreMultiplier } : {}),
    scoringType: row.scoringType,
    accuracy: row.accuracy,
    combo: row.combo,
    passed: row.passed,
    mods: row.mods,
    hits: has("hits")
      ? {
          great: row.hitGreat,
          ok: row.hitOk,
          meh: row.hitMeh,
          miss: row.hitMiss,
        }
      : undefined,
    relative: row.relative,
  };
}
