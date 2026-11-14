import { archiveMatchPool } from "./archive-match-pool";
import { formatDate } from "./editions";
import {
  archiveWinner,
  recordedArchiveMatch,
  type HistoricalArchive,
} from "./historical-archive";
import type { EventMatch } from "./event-preview";

/** Adapt recorded evidence without inferring stages, pools or bracket edges. */
export function archiveEventMatches(
  archive: HistoricalArchive,
  matches: HistoricalArchive["matches"],
  href: (section: string, id?: string) => string,
  timeZone: string,
  locale: string,
  poolName: (name: string, id?: string) => string = (name) => name,
): EventMatch[] {
  return matches.map((m) => {
    const pool = archiveMatchPool(archive, m);
    return {
      id: m.id,
      label: m.label,
      round: m.stage,
      stage: m.stage,
      pool: pool ? poolName(pool.name, pool.id) : "—",
      poolHref: pool ? href("mappools", pool.id) : undefined,
      time: m.scheduledAt ? formatDate(m.scheduledAt, timeZone, locale) : "—",
      ...((m.roomOpenedAt ?? m.review?.startedAt)
        ? {
            roomOpenedAt: formatDate(
              (m.roomOpenedAt ?? m.review?.startedAt)!,
              timeZone,
              locale,
            ),
          }
        : {}),
      red: archive.teams.find((t) => t.id === m.teamA)!.name,
      blue: archive.teams.find((t) => t.id === m.teamB)!.name,
      redHref: href("teams", m.teamA),
      blueHref: href("teams", m.teamB),
      score: m.score,
      ...(m.review?.status === "pending"
        ? { reviewScore: m.review.workingScore }
        : {}),
      winner: archiveWinner(m),
      forfeit: m.forfeitWinner !== undefined,
      recorded: recordedArchiveMatch(m),
      redBan: m.bansA ?? undefined,
      blueBan: m.bansB ?? undefined,
      mps: m.mpUrls,
      vod: m.vodUrl ?? undefined,
      referee: m.referee ?? undefined,
      streamer: m.streamer ?? undefined,
      href: href("matches", m.id),
    };
  });
}
