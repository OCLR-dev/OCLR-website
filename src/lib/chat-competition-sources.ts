import { HttpError } from "./http-error";
import { publicCompetition } from "./public-competition";
import { slotLabel } from "./mappool-model";
import { publicMappools } from "./mappool-reads";
import { recordedArchiveMatch } from "./historical-archive";
import type { ChatSource } from "./chat-retrieval";
import type { Edition } from "./editions";

import type { FixtureStatus } from "./fixture-status";

type Match = {
  status?: FixtureStatus;
  id: string;
  label: string;
  teams: string;
  timeZone: string;
  pool?: string;
  time: string | null;
  score: string | null;
  cancelled?: boolean;
};
export function isUpcomingMatch(match: Match, now: number) {
  return (
    (!match.status || match.status === "scheduled") &&
    !match.score &&
    match.time !== null &&
    Date.parse(match.time) >= now
  );
}
export async function matches(edition: Edition): Promise<Match[]> {
  const archive = edition.archive;
  if (archive) {
    const teams = new Map(archive.teams.map((t) => [t.id, t.name]));
    return archive.matches.filter(recordedArchiveMatch).map((m) => ({
      id: m.id,
      label: m.stage + " " + m.label,
      teams: [teams.get(m.teamA), teams.get(m.teamB)].join(" / "),
      time: m.scheduledAt,
      timeZone: edition.timeZone,
      score: m.score?.join("–") ?? "forfeit",
    }));
  }
  const competition = await publicCompetition(edition.slug);
  if (!competition) throw new HttpError(404, "Tournament not found.");
  return competition.fixtures.map((f) => ({
    id: f.id,
    label: f.roundName + " " + f.label,
    teams: f.home.label + " / " + f.away.label,
    time: f.confirmed ? f.scheduledAt : null,
    timeZone: f.timeZone,
    pool: f.pool?.name,
    score: f.result ? [f.result.homeWins, f.result.awayWins].join("–") : null,
    status: f.status,
    cancelled: f.status === "cancelled",
  }));
}

export function scheduleOverview(
  edition: Edition,
  fixtures: Match[],
): ChatSource {
  return {
    url: `/tournaments/${edition.slug}/schedule`,
    title: "Published match schedule",
    text: JSON.stringify({
      publishedMatches: fixtures.length,
      matchesWithPublishedTime: fixtures.filter((match) => match.time !== null)
        .length,
      publishedResults: fixtures.filter((match) => match.score !== null).length,
    }),
  };
}

export function matchSource(edition: Edition, match: Match): ChatSource {
  return {
    url: `/tournaments/${edition.slug}/matches/${encodeURIComponent(match.id)}`,
    title: `${match.label} · ${match.teams}`,
    text: JSON.stringify({
      category: "match schedule result",
      teams: match.teams,
      scheduledAt: match.time,
      timeZone: match.timeZone,
      status: match.status,
      mappool: match.pool,
      publishedScore: match.score,
      cancelled: match.status === "cancelled" || match.cancelled === true,
    }),
  };
}

export async function poolSources(edition: Edition): Promise<ChatSource[]> {
  const pools = edition.archive
    ? edition.archive.pools.map((p) => ({
        id: p.id,
        name: p.name,
        maps: p.maps.map((m) =>
          [
            m.slot,
            m.title,
            m.mapper,
            m.beatmapId,
            m.bpm && m.bpm + " BPM",
            m.stars && m.stars + "★",
            ...Object.entries({
              AR: m.ar,
              OD: m.od,
              CS: m.cs,
              HP: m.hp,
              seconds: m.drainSeconds,
            })
              .filter(([, v]) => v != null)
              .map(([k, v]) => k + " " + v),
          ]
            .filter(Boolean)
            .join(" "),
        ),
      }))
    : (await publicMappools(edition.slug)).map((p) => ({
        id: p.id,
        name: p.roundName + " " + p.name,
        maps: p.entries.map((e) =>
          [
            slotLabel(e.category, e.position),
            e.metadata.artist,
            e.metadata.title,
            e.metadata.difficulty,
            e.metadata.mapper,
            e.beatmapId,
            ...Object.entries({
              stars: e.metadata.stars,
              BPM: e.metadata.bpm,
              seconds: e.metadata.duration,
              AR: e.metadata.ar,
              OD: e.metadata.od,
              CS: e.metadata.cs,
              HP: e.metadata.hp,
            })
              .filter(([, v]) => v != null)
              .map(([k, v]) => k + " " + v),
          ].join(" "),
        ),
      }));
  const url = `/tournaments/${edition.slug}/mappools`;
  return [
    {
      url,
      title: "Published mappools",
      text: JSON.stringify({
        publishedPools: pools.length,
        publishedSlots: pools.reduce(
          (count, pool) => count + pool.maps.length,
          0,
        ),
        pools: pools.slice(0, 24).map(({ name, maps }) => ({
          name,
          slots: maps.length,
        })),
      }),
    },
    ...pools.flatMap((pool) =>
      pool.maps.map((text) => ({
        url: `${url}/${encodeURIComponent(pool.id)}`,
        title: pool.name,
        text,
      })),
    ),
  ];
}
