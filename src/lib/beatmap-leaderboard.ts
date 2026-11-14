import { archiveArtworkSetIds } from "./archive-artwork";
import { parseArchiveTitle } from "./archive-map-metadata";
import { publicArchiveStatistics } from "./archive-statistics-reads";
import { getPublicEditions } from "./content";
import { remoteMode } from "./data-source";
import type { Edition } from "./editions";
import { eventMapKey } from "./event-statistics-model";
import { fitBeatmapDifficulty, type FittedPlay } from "./fitted-difficulty";
import { publicMappools } from "./mappool-reads";
import { minimumCountedScore } from "./player-map-performance-model";
import type { Appearance } from "./preferences";

/** One beatmap, aggregated across every published edition it appeared in. */
export type BeatmapLeaderboardRow = {
  beatmapId: number;
  /** osu! beatmapset ID used for cover and list artwork. */
  beatmapSetId: number | null;
  title: string;
  /** Display label such as `HD2`; a lone tiebreaker map stays `TB`. */
  slot: string;
  /** Season of the edition whose pool owns `slot`. */
  season: string | null;
  /** Edition name used when the season has no theme label. */
  editionName: string;
  /** Season theme the owning edition configures, if any. */
  appearance: Appearance | null;
  /** Round (live pool) or pool name (archive) that owns `slot`. */
  round: string;
  /** Whether `round` is a stored archive pool name or a live round name. */
  archive: boolean;
  /** Stored pool id for archive rows, empty for live rounds. */
  roundId: string;
  stars: number | null;
  /** Star rating corrected by the fitted-difficulty model. */
  fittedStars: number | null;
  /** Signed correction the model applies to `stars`; null without a rating. */
  fittedOffset: number | null;
  picks: number | null;
  bans: number | null;
  plays: number;
  averageAccuracy: number | null;
  averageCombo: number | null;
};

export type BeatmapLeaderboard = {
  maps: BeatmapLeaderboardRow[];
  editions: number;
  unavailableEditions: string[];
};

type PoolMap = {
  beatmapId: number;
  beatmapSetId: number | null;
  title: string;
  difficulty: string | null;
  slot: string;
  round: string;
  archive: boolean;
  roundId: string;
  stars: number | null;
};

type BeatmapAccumulator = {
  beatmapId: number;
  beatmapSetId: number | null;
  title: string;
  difficulty: string | null;
  slot: string;
  season: string | null;
  editionName: string;
  appearance: Appearance | null;
  round: string;
  archive: boolean;
  roundId: string;
  stars: number | null;
  /** Stored season number; the newest pooled appearance supplies the labels. */
  priority: number;
  pickKnown: boolean;
  pickFixtures: Set<string>;
  banKnown: boolean;
  bans: number;
  plays: number;
  accuracySum: number;
  accuracyCount: number;
  comboSum: number;
  comboCount: number;
};

const TB_CATEGORY = "TB";

function slotCategory(slot: string): string {
  return slot.trim().toUpperCase().replace(/\d+$/, "");
}

/** Hide the position of a tiebreaker only when the pool holds a single map. */
function displaySlot(slot: string, tiebreakers: number): string {
  return slotCategory(slot) === TB_CATEGORY && tiebreakers === 1
    ? TB_CATEGORY
    : slot;
}

function seasonPriority(season: string | null): number {
  const match = season?.match(/(\d+)/);
  return match ? Number(match[1]) : -1;
}

function archiveMaps(edition: Edition): PoolMap[] {
  const maps: PoolMap[] = [];
  for (const pool of edition.archive?.pools ?? []) {
    const tiebreakers = pool.maps.filter(
      (map) => slotCategory(map.slot) === TB_CATEGORY,
    ).length;
    for (const map of pool.maps) {
      if (map.beatmapId === null) continue;
      const parsed = parseArchiveTitle(map.title);
      maps.push({
        beatmapId: map.beatmapId,
        beatmapSetId: map.beatmapSetId ?? null,
        title: parsed?.title ?? map.title ?? "",
        difficulty: parsed?.difficulty ?? null,
        slot: displaySlot(map.slot, tiebreakers),
        round: pool.name,
        archive: true,
        roundId: pool.id,
        stars: Number.isFinite(map.stars) ? map.stars : null,
      });
    }
  }
  return maps;
}

async function liveMaps(edition: Edition): Promise<PoolMap[]> {
  const pools = await publicMappools(edition.slug);
  const maps: PoolMap[] = [];
  for (const pool of pools) {
    const tiebreakers = pool.entries.filter(
      (entry) => entry.category === TB_CATEGORY,
    ).length;
    for (const entry of pool.entries) {
      const slot = `${entry.category}${entry.position}`;
      maps.push({
        beatmapId: entry.beatmapId,
        beatmapSetId: entry.metadata.setId,
        title: entry.metadata.title,
        difficulty: entry.metadata.difficulty ?? null,
        slot: displaySlot(slot, tiebreakers),
        round: pool.roundName?.trim() || pool.name,
        archive: false,
        roundId: "",
        stars: Number.isFinite(entry.metadata.stars)
          ? entry.metadata.stars
          : null,
      });
    }
  }
  return maps;
}

function accumulator(
  rows: Map<number, BeatmapAccumulator>,
  beatmapId: number,
): BeatmapAccumulator {
  const existing = rows.get(beatmapId);
  if (existing) return existing;
  const created: BeatmapAccumulator = {
    beatmapId,
    beatmapSetId: null,
    title: "",
    difficulty: null,
    slot: "",
    season: null,
    editionName: "",
    appearance: null,
    round: "",
    archive: false,
    roundId: "",
    stars: null,
    priority: -1,
    pickKnown: false,
    pickFixtures: new Set(),
    banKnown: false,
    bans: 0,
    plays: 0,
    accuracySum: 0,
    accuracyCount: 0,
    comboSum: 0,
    comboCount: 0,
  };
  rows.set(beatmapId, created);
  return created;
}

function mergeMap(
  row: BeatmapAccumulator,
  map: PoolMap,
  edition: Edition,
  priority: number,
) {
  if (priority > row.priority) {
    row.priority = priority;
    if (map.beatmapSetId !== null) row.beatmapSetId = map.beatmapSetId;
    if (map.title) row.title = map.title;
    if (map.difficulty) row.difficulty = map.difficulty;
    if (map.slot) {
      row.slot = map.slot;
      row.round = map.round;
      row.archive = map.archive;
      row.roundId = map.roundId;
      row.season = edition.season;
      row.editionName = edition.name;
      row.appearance = edition.defaultAppearance ?? null;
    }
    if (map.stars !== null) row.stars = map.stars;
    return;
  }
  if (priority < row.priority) return;
  // The first pool appearance in a season owns the slot; later pools only
  // fill metadata the first one lacked.
  if (row.beatmapSetId === null && map.beatmapSetId !== null)
    row.beatmapSetId = map.beatmapSetId;
  if (!row.title && map.title) row.title = map.title;
  if (!row.difficulty && map.difficulty) row.difficulty = map.difficulty;
  if (!row.slot && map.slot) {
    row.slot = map.slot;
    if (map.round) {
      row.round = map.round;
      row.archive = map.archive;
      row.roundId = map.roundId;
    }
    if (!row.editionName) {
      row.season = edition.season;
      row.editionName = edition.name;
      row.appearance = edition.defaultAppearance ?? null;
    }
  }
  if (row.stars === null && map.stars !== null) row.stars = map.stars;
}

/**
 * Build the beatmap ranking from published editions. Every edition's published
 * mappools supply identity and stars, while its public statistics supply
 * counted scores plus fixture picks and bans. No projection is saved, so a
 * missing edition is reported instead of shrinking the ranking silently.
 */
export async function beatmapLeaderboard(): Promise<BeatmapLeaderboard> {
  const editions = await getPublicEditions();
  const unavailable = new Set<string>();
  const rows = new Map<number, BeatmapAccumulator>();
  /**
   * Fixtures that actually played a map. A play is itself evidence that the
   * map was picked, which keeps older snapshots without selections from
   * reporting an unknown pick count.
   */
  const playedFixtures = new Map<number, Set<string>>();
  /** Counted plays per map, reduced to the guidance-score inputs. */
  const guidancePlays = new Map<number, FittedPlay[]>();

  const results = await Promise.all(
    editions.map(async (edition) => {
      try {
        const [statistics, maps] = await Promise.all([
          publicArchiveStatistics(edition.slug),
          edition.archive
            ? Promise.resolve(archiveMaps(edition))
            : liveMaps(edition),
        ]);
        return { edition, statistics, maps };
      } catch {
        unavailable.add(edition.slug);
        return null;
      }
    }),
  );

  for (const result of results) {
    if (!result) continue;
    const priority = seasonPriority(result.edition.season);
    for (const map of result.maps) {
      mergeMap(accumulator(rows, map.beatmapId), map, result.edition, priority);
    }
  }

  for (const result of results) {
    if (!result) continue;
    const { statistics } = result;
    const editionSlug = result.edition.slug;

    for (const play of statistics.plays) {
      if (
        Number.isSafeInteger(play.beatmapId) &&
        play.beatmapId > 0 &&
        play.fixtureId
      ) {
        const fixtures =
          playedFixtures.get(play.beatmapId) ?? new Set<string>();
        fixtures.add(`${editionSlug}:${play.fixtureId}`);
        playedFixtures.set(play.beatmapId, fixtures);
      }
      const score = play.rawScore ?? play.score;
      if (!Number.isFinite(score) || score < minimumCountedScore) continue;
      if (!Number.isSafeInteger(play.beatmapId) || play.beatmapId <= 0)
        continue;
      const row = accumulator(rows, play.beatmapId);
      const parsed = parseArchiveTitle(play.title);
      if (!row.title && parsed?.title) row.title = parsed.title;
      if (!row.difficulty && parsed?.difficulty)
        row.difficulty = parsed.difficulty;
      if (!row.slot && play.slot) row.slot = play.slot;
      row.plays += 1;
      const guided = guidancePlays.get(play.beatmapId) ?? [];
      guided.push({
        gameId: play.gameId,
        slot: play.slot,
        accuracy: play.accuracy,
        combo: play.combo,
        mods: play.mods,
        editionSlug,
      });
      guidancePlays.set(play.beatmapId, guided);
      if (play.accuracy !== null && Number.isFinite(play.accuracy)) {
        row.accuracySum += play.accuracy;
        row.accuracyCount += 1;
      }
      if (play.combo !== null && Number.isFinite(play.combo)) {
        row.comboSum += play.combo;
        row.comboCount += 1;
      }
    }

    for (const fixture of statistics.poolFixtures ?? []) {
      if (!fixture.maps) continue;
      const picks = fixture.picks;
      const bans = fixture.bans ?? [];
      // A ban list with an unknown side cannot tell us whether this map was
      // banned, so that fixture leaves the ban count unknown.
      const bansKnown = bans.every((side) => side.maps !== null);
      for (const map of fixture.maps) {
        if (map.mapId === null || !Number.isSafeInteger(map.mapId)) continue;
        if (map.mapId <= 0) continue;
        const row = accumulator(rows, map.mapId);
        const key = eventMapKey(map);
        if (picks !== null) {
          row.pickKnown = true;
          if (picks.includes(key))
            row.pickFixtures.add(`${editionSlug}:${fixture.id}`);
        }
        if (bansKnown) {
          row.banKnown = true;
          for (const side of bans) {
            if (side.maps?.includes(key)) row.bans += 1;
          }
        }
      }
    }
  }

  // Historical imports usually omit the beatmapset ID even though artwork is
  // available from osu!. Resolve the missing IDs in one cached lookup; artwork
  // is optional, so a provider failure leaves the rows intact.
  if (!remoteMode()) {
    const missing = [...rows.values()]
      .filter((row) => row.beatmapSetId === null)
      .map((row) => row.beatmapId);
    if (missing.length > 0) {
      try {
        const setIds = await archiveArtworkSetIds(missing);
        for (const row of rows.values()) {
          if (row.beatmapSetId !== null) continue;
          const setId = setIds[row.beatmapId];
          if (setId !== null && setId !== undefined) row.beatmapSetId = setId;
        }
      } catch {
        // Artwork is supplemental; keep the ranking usable without it.
      }
    }
  }

  const fits = fitBeatmapDifficulty(
    [...rows.values()].map((row) => ({
      beatmapId: row.beatmapId,
      stars: row.stars,
    })),
    guidancePlays,
  );

  const maps = [...rows.values()].map((row): BeatmapLeaderboardRow => {
    const played = playedFixtures.get(row.beatmapId);
    if (played) {
      row.pickKnown = true;
      for (const fixtureId of played) row.pickFixtures.add(fixtureId);
    }
    const fit = fits.get(row.beatmapId);
    return {
      beatmapId: row.beatmapId,
      beatmapSetId: row.beatmapSetId,
      title: row.title || `#${row.beatmapId}`,
      difficulty: row.difficulty,
      slot: row.slot || "—",
      season: row.season,
      editionName: row.editionName,
      appearance: row.appearance,
      round: row.round,
      archive: row.archive,
      roundId: row.roundId,
      stars: row.stars,
      // Maps without enough counted plays keep their stored star rating.
      fittedStars: row.stars === null ? null : (fit?.fittedStars ?? row.stars),
      fittedOffset: row.stars === null ? null : (fit?.offset ?? 0),
      picks: row.pickKnown ? row.pickFixtures.size : null,
      bans: row.banKnown ? row.bans : null,
      plays: row.plays,
      averageAccuracy: row.accuracyCount
        ? row.accuracySum / row.accuracyCount
        : null,
      averageCombo: row.comboCount ? row.comboSum / row.comboCount : null,
    };
  });

  maps.sort(
    (left, right) =>
      (right.fittedStars ?? -1) - (left.fittedStars ?? -1) ||
      right.plays - left.plays ||
      left.title.localeCompare(right.title, "en") ||
      left.beatmapId - right.beatmapId,
  );

  return {
    maps,
    editions: results.filter(Boolean).length,
    unavailableEditions: [...unavailable].sort(),
  };
}
