import type { HistoricalArchive } from "./historical-archive";
import {
  selectedStatisticsGames,
  statisticsFixtures,
  type StatisticsSnapshot,
} from "./archive-statistics-model";
import { eventMapKey, type EventMapIdentity } from "./event-statistics-model";
import type { EventScore } from "./event-statistics";

export type EventPoolFixture = {
  id: string;
  round: string;
  teams: string[];
  maps: EventMapIdentity[] | null;
  picks: string[] | null;
  bans: { team: string; maps: string[] | null }[];
};

// Only call with validated public snapshots. Draft pool selections never establish
// eligibility. An explicit archive pool and published selections must agree.
export function archivePoolFixtures(
  archive: HistoricalArchive,
  published: { fixtureId: string; snapshot: StatisticsSnapshot }[],
): EventPoolFixture[] {
  return statisticsFixtures(archive).map((fixture) => {
    const snapshots = published
      .filter((s) => s.fixtureId === fixture.id)
      .map((s) => s.snapshot);
    const ids = [...new Set(snapshots.map((s) => s.poolId))];
    if (fixture.poolId && !ids.length) ids.push(fixture.poolId);
    const pools = ids.map((id) => archive.pools.find((p) => p.id === id));
    const known =
      ids.length > 0 &&
      pools.every(Boolean) &&
      (!fixture.poolId || ids.every((id) => id === fixture.poolId));
    const maps = known
      ? [
          ...new Map(
            pools.flatMap((pool) =>
              pool!.maps.map((map) => {
                const identity = {
                  round: fixture.stage,
                  slot: map.slot,
                  mapId: map.beatmapId,
                  title: map.title ?? "#" + map.beatmapId,
                };
                return [eventMapKey(identity), identity] as const;
              }),
            ),
          ).values(),
        ]
      : null;
    const teams = [fixture.teamA, fixture.teamB].map(
      (id) => archive.teams.find((t) => t.id === id)!.name,
    );
    const picks =
      known && snapshots.length
        ? snapshots.flatMap((snapshot) =>
            selectedStatisticsGames(snapshot).flatMap((game) => {
              const map = maps!.find(
                (m) =>
                  m.mapId === game.beatmapId &&
                  archive.pools
                    .find((p) => p.id === snapshot.poolId)
                    ?.maps.some(
                      (m2) =>
                        m2.slot === m.slot && m2.beatmapId === game.beatmapId,
                    ),
              );
              return map ? [eventMapKey(map)] : [];
            }),
          )
        : null;
    function bans(raw: string | null): string[] | null {
      if (!maps || !raw) return null;
      const slots = raw
        .trim()
        .toUpperCase()
        .split(/[\s,，、/;；]+/);
      if (!slots.length || new Set(slots).size !== slots.length) return null;
      const keys: string[] = [];
      for (const slot of slots) {
        const candidates = maps.filter((m) => m.slot === slot);
        // Same slot with different beatmaps across pools is ambiguous.
        if (candidates.length !== 1 || candidates[0].mapId === null)
          return null;
        keys.push(eventMapKey(candidates[0]));
      }
      return keys;
    }
    return {
      id: fixture.id,
      round: fixture.stage,
      teams,
      maps,
      picks: picks && [...new Set(picks)],
      bans: [fixture.bansA, fixture.bansB].map((raw, i) => ({
        team: teams[i],
        maps: bans(raw),
      })),
    };
  });
}

export function eventMappoolRows(
  scores: EventScore[],
  fixtures: EventPoolFixture[] | undefined,
  round = "",
  team = "",
  slot = "",
) {
  const scope = fixtures?.filter(
    (f) => (!round || f.round === round) && (!team || f.teams.includes(team)),
  );
  const identities = new Map<string, EventMapIdentity>();
  for (const s of scores)
    if ((!round || s.round === round) && (!team || s.team === team))
      identities.set(eventMapKey(s), s);
  for (const f of scope ?? [])
    for (const m of f.maps ?? []) identities.set(eventMapKey(m), m);
  return [...identities]
    .filter(([key]) => !slot || key === slot)
    .map(([key, map]) => {
      const p = scores.filter(
        (s) => eventMapKey(s) === key && (!team || s.team === team),
      );
      const applicable =
        scope?.filter((f) => f.maps?.some((m) => eventMapKey(m) === key)) ?? [];
      const unknown =
        scope?.filter((f) => f.round === map.round && f.maps === null).length ??
        0;
      const picked = applicable.filter((f) => f.picks !== null);
      const banSides = (f: EventPoolFixture) =>
        f.bans.filter((b) => !team || b.team === team);
      const banned = applicable.filter((f) =>
        banSides(f).every((b) => b.maps !== null),
      );
      const bans = applicable.reduce(
        (n, f) =>
          n +
          banSides(f).reduce(
            (sum, b) => sum + (b.maps?.filter((k) => k === key).length ?? 0),
            0,
          ),
        0,
      );
      const picks = new Set([
        ...p.map((s) => s.fixture),
        ...picked.filter((f) => f.picks!.includes(key)).map((f) => f.id),
      ]).size;
      const complete =
        fixtures !== undefined &&
        applicable.length > 0 &&
        unknown === 0 &&
        map.mapId !== null;
      return {
        key,
        map,
        plays: p,
        picks: fixtures && !picked.length && !p.length ? null : picks,
        pickRate:
          fixtures === undefined && p[0]?.poolMatches
            ? picks / p[0].poolMatches
            : complete && picked.length === applicable.length
              ? picks / applicable.length
              : null,
        bans:
          fixtures === undefined
            ? (p[0]?.bans ?? null)
            : banned.length || bans > 0
              ? bans
              : null,
        banRate:
          fixtures === undefined &&
          p[0]?.bans !== undefined &&
          p[0]?.poolMatches
            ? p[0].bans / p[0].poolMatches
            : complete && banned.length === applicable.length
              ? bans / applicable.length
              : null,
        applicable: fixtures ? applicable.length : null,
        unknown: fixtures ? unknown : null,
        pickCoverage: fixtures
          ? `${picked.length} / ${applicable.length}`
          : null,
        banCoverage: fixtures
          ? `${banned.length} / ${applicable.length}`
          : null,
      };
    });
}
