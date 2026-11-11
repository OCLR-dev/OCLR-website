import { slotCategory, type MappoolCategory } from "./mappool-model";

/**
 * Player map-performance DEMO model.
 *
 * Two public sources feed this model, both limited to reviewed or published
 * results:
 * - historical seasons read the published archive statistics projection
 *   (unpublished snapshots, review-pending imports and excluded scores never
 *   appear);
 * - live seasons read the approved result revisions shared with ratings and
 *   awards, so a published fixture result is enough.
 *
 * Deliberately absent from the output are relative score, maximum combo, miss
 * totals, pass rate, team score share, failed-score counts and any score-system
 * grouping; those are not comparable across maps or seasons.
 */

/** The minimal per-map score shape shared by archive statistics and approved results. */
export type MapPlay = {
  fixtureId: string;
  gameId: number;
  stage: string;
  title: string;
  slot: string;
  at: string | null;
  osuId: number;
  /** Team the score belongs to, when the source records one. */
  teamId: string;
  /** Winning team for this map, when the source already resolved it. */
  winnerTeamId?: string | null;
  score: number;
  rawScore?: number | null;
  scoreMultiplier?: number | null;
  accuracy: number | null;
  /** Mods recorded for this score; merged with lobby mods where available. */
  mods?: string[];
};

export type PlayerMapRow = {
  fixtureId: string;
  gameId: number;
  stage: string;
  title: string;
  slot: string;
  at: string | null;
  /** Competition rank on this map (1, 1, 3 for tied scores); null when unknown. */
  placement: number | null;
  accuracy: number | null;
  /**
   * Result of the map for this player's team. Null when the source does not
   * establish a winner or the player's team is unknown.
   */
  result: "win" | "loss" | "tie" | null;
  /**
   * Team size inferred from the map's score count: seven or more scores are a
   * 4v4 map, five or six are a 3v3 map. Null when the map cannot be classified.
   */
  teamSize: 3 | 4 | null;
  /** Mappool category the slot belongs to; null when the slot is unknown. */
  category: MappoolCategory | null;
  /** Mods recorded for this score, with NF and CL retained for callers to filter. */
  mods: string[];
  /**
   * Effective rating: own score ÷ that map's mean score across every recorded
   * player. Null when the map mean is missing, zero or otherwise unusable.
   */
  effectiveRating: number | null;
};

export type PlayerMapEdition = {
  editionSlug: string;
  editionName: string;
  maps: PlayerMapRow[];
  averagePlacement: number | null;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  averageAccuracy: number | null;
  averageEffectiveRating: number | null;
  /** Maps that produced a usable effective rating (map mean > 0). */
  ratedMaps: number;
  /** Maps the player's team(s) appeared in during the edition. */
  teamMaps: number;
  /** Personal map record for maps with a known team result. */
  mapsWon: number;
  mapsLost: number;
  mapsTied: number;
  /** The edition's public statistics projection could not be read. */
  unavailable: boolean;
};

export type PlayerMapPerformance = {
  mapsPlayed: number;
  averagePlacement: number | null;
  /** Average competition placement on maps with five or six scores (3v3). */
  averagePlacement3v3: number | null;
  /** Average competition placement on maps with seven or more scores (4v4). */
  averagePlacement4v4: number | null;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  averageAccuracy: number | null;
  averageEffectiveRating: number | null;
  ratedMaps: number;
  /** Maps the player's team(s) appeared in across every edition. */
  teamMaps: number;
  /** Personal map record across every edition. */
  mapsWon: number;
  mapsLost: number;
  mapsTied: number;
  editions: PlayerMapEdition[];
};

/** The part of the map record the career summary needs. */
export type PersonalMapRecord = Pick<
  PlayerMapPerformance,
  "mapsPlayed" | "mapsWon" | "mapsLost" | "mapsTied"
>;

const mean = (values: number[]) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

const finite = (value: number | null): value is number =>
  value !== null && Number.isFinite(value);

const placementAverage = (rows: PlayerMapRow[]) =>
  mean(rows.flatMap((row) => (row.placement === null ? [] : [row.placement])));

/** A map with at least seven scores is 4v4; five or six scores is 3v3. */
function mapTeamSize(scoreCount: number): 3 | 4 | null {
  if (scoreCount >= 7) return 4;
  if (scoreCount >= 5) return 3;
  return null;
}

/** Competition ranking (1, 1, 3), matching standings and the statistics views. */
export function placements(
  scores: { osuId: number; total: number }[],
): Map<number, number> {
  const ranked = [...scores].sort((a, b) => b.total - a.total);
  const result = new Map<number, number>();
  for (const score of ranked) {
    if (result.has(score.osuId)) continue;
    const rank =
      ranked.findIndex((candidate) => candidate.total === score.total) + 1;
    result.set(score.osuId, rank);
  }
  return result;
}

/**
 * Resolves a map's winning team. Approved live results carry the winner;
 * published archive snapshots are compared by team score totals.
 */
export function mapResult(
  game: MapPlay[],
  teamId: string,
): PlayerMapRow["result"] {
  const explicit = game.find((play) => play.winnerTeamId)?.winnerTeamId;
  if (explicit) return explicit === teamId ? "win" : "loss";
  const totals = new Map<string, number>();
  for (const play of game)
    totals.set(
      play.teamId,
      (totals.get(play.teamId) ?? 0) + (play.rawScore ?? play.score),
    );
  if (totals.size < 2) return null;
  const ranked = [...totals].sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === ranked[1][1]) return "tie";
  return ranked[0][0] === teamId ? "win" : "loss";
}

/**
 * A player who was in the lobby but never played still leaves a negligible
 * recorded total. That is not a result: it must not become a map row, enter a
 * map's average for effective rating, or inflate the 3v3/4v4 inference.
 */
export const minimumCountedScore = 2000;

/**
 * Ranks each counted map and measures every participant against that map's
 * field. A map whose mean score is zero or unusable contributes a placement
 * but never an effective rating.
 */
/** The per-edition fields a ranked play set produces; callers add identity. */
export type MapPerformanceFields = Omit<
  PlayerMapEdition,
  "editionSlug" | "editionName" | "unavailable"
>;

export function mapPerformance(
  plays: MapPlay[],
  osuId: number,
  rosterTeams: Iterable<string> = [],
): MapPerformanceFields {
  const games = new Map<number, MapPlay[]>();
  for (const play of plays) {
    if ((play.rawScore ?? play.score) < minimumCountedScore) continue;
    games.set(play.gameId, [...(games.get(play.gameId) ?? []), play]);
  }
  const rows: PlayerMapRow[] = [];
  const teamIds = new Set<string>(rosterTeams);
  for (const [gameId, game] of games) {
    if (!game.some((play) => play.osuId === osuId)) continue;
    for (const play of game) if (play.osuId === osuId) teamIds.add(play.teamId);
    const totals = game.map((play) => ({
      osuId: play.osuId,
      total: play.score,
    }));
    const ranks = placements(totals);
    const average = mean(totals.map((total) => total.total));
    const usableAverage =
      average !== null && Number.isFinite(average) && average > 0;
    const teamSize = mapTeamSize(game.length);
    for (const play of game) {
      if (play.osuId !== osuId) continue;
      const ratio = usableAverage ? play.score / average! : null;
      rows.push({
        fixtureId: play.fixtureId,
        gameId,
        stage: play.stage,
        title: play.title,
        slot: play.slot,
        at: play.at,
        placement: ranks.get(play.osuId) ?? null,
        accuracy: play.accuracy,
        result: mapResult(game, play.teamId),
        effectiveRating: finite(ratio) ? ratio : null,
        teamSize,
        category: slotCategory(play.slot),
        mods: [...new Set(play.mods ?? [])].sort(),
      });
    }
  }
  let teamMaps = 0;
  for (const game of games.values())
    if (game.some((play) => teamIds.has(play.teamId))) teamMaps++;
  return finishMapPerformance(rows, teamMaps);
}

/** Shared ordering and summary arithmetic for source and SQL-ranked maps. */
export function finishMapPerformance(
  rows: PlayerMapRow[],
  teamMaps: number,
): MapPerformanceFields {
  rows.sort(
    (a, b) => (b.at ?? "").localeCompare(a.at ?? "") || b.gameId - a.gameId,
  );
  const rated = rows.filter((row) => finite(row.effectiveRating));
  return {
    maps: rows,
    averagePlacement: placementAverage(rows),
    firstPlaces: rows.filter((row) => row.placement === 1).length,
    secondPlaces: rows.filter((row) => row.placement === 2).length,
    thirdPlaces: rows.filter((row) => row.placement === 3).length,
    averageAccuracy: mean(
      rows.flatMap((row) => (row.accuracy === null ? [] : [row.accuracy])),
    ),
    averageEffectiveRating: mean(rated.map((row) => row.effectiveRating!)),
    ratedMaps: rated.length,
    teamMaps,
    mapsWon: rows.filter((row) => row.result === "win").length,
    mapsLost: rows.filter((row) => row.result === "loss").length,
    mapsTied: rows.filter((row) => row.result === "tie").length,
  };
}

export function summarizeMapPerformance(
  editions: PlayerMapEdition[],
): PlayerMapPerformance {
  const sorted = [...editions].sort((a, b) => {
    const left = a.maps.at(-1)?.at ?? "";
    const right = b.maps.at(-1)?.at ?? "";
    return (
      left.localeCompare(right) || a.editionSlug.localeCompare(b.editionSlug)
    );
  });
  const rows = sorted.flatMap((edition) => edition.maps);
  const rated = rows.filter((row) => finite(row.effectiveRating));
  return {
    mapsPlayed: rows.length,
    averagePlacement: placementAverage(rows),
    averagePlacement3v3: placementAverage(
      rows.filter((row) => row.teamSize === 3),
    ),
    averagePlacement4v4: placementAverage(
      rows.filter((row) => row.teamSize === 4),
    ),
    firstPlaces: rows.filter((row) => row.placement === 1).length,
    secondPlaces: rows.filter((row) => row.placement === 2).length,
    thirdPlaces: rows.filter((row) => row.placement === 3).length,
    averageAccuracy: mean(
      rows.flatMap((row) => (row.accuracy === null ? [] : [row.accuracy])),
    ),
    averageEffectiveRating: mean(rated.map((row) => row.effectiveRating!)),
    ratedMaps: rated.length,
    teamMaps: sorted.reduce((total, edition) => total + edition.teamMaps, 0),
    mapsWon: rows.filter((row) => row.result === "win").length,
    mapsLost: rows.filter((row) => row.result === "loss").length,
    mapsTied: rows.filter((row) => row.result === "tie").length,
    editions: sorted,
  };
}
