import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  fixtures,
  mappoolEntries,
  mappools,
  tournamentRounds,
  tournamentStages,
} from "@/db/schema";
import { approvedRatingGames } from "./approved-rating-games";
import { publicArchiveStatistics } from "./archive-statistics";
import { remoteMode } from "./data-source";
import { HttpError } from "./http";
import { slotLabel } from "./mappool-model";
import type { PublishedPlayer } from "./players";
import type { RatingGame } from "./yumu-rating";

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
  accuracy: number | null;
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
function placements(
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
function mapResult(game: MapPlay[], teamId: string): PlayerMapRow["result"] {
  const totals = new Map<string, number>();
  for (const play of game)
    totals.set(play.teamId, (totals.get(play.teamId) ?? 0) + play.score);
  if (totals.size < 2) return null;
  const explicit = game.find((play) => play.winnerTeamId)?.winnerTeamId;
  if (explicit) return explicit === teamId ? "win" : "loss";
  const ranked = [...totals].sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === ranked[1][1]) return "tie";
  return ranked[0][0] === teamId ? "win" : "loss";
}

/**
 * Ranks each recorded map and measures every participant against that map's
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
  for (const play of plays)
    games.set(play.gameId, [...(games.get(play.gameId) ?? []), play]);
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
      });
    }
  }
  rows.sort(
    (a, b) => (b.at ?? "").localeCompare(a.at ?? "") || b.gameId - a.gameId,
  );
  const rated = rows.filter((row) => finite(row.effectiveRating));
  let teamMaps = 0;
  for (const game of games.values())
    if (game.some((play) => teamIds.has(play.teamId))) teamMaps++;
  return {
    maps: rows,
    averagePlacement: placementAverage(rows),
    firstPlaces: rows.filter((row) => row.placement === 1).length,
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

/**
 * DEMO: reads only the public archive statistics projection for each season the
 * player appears in. Seasons without published MP statistics report an empty,
 * explicitly unavailable record instead of zero-valued performance.
 */
export async function playerMapPerformance(
  participation: PublishedPlayer[],
): Promise<PlayerMapPerformance> {
  const groups = new Map<string, PublishedPlayer[]>();
  for (const player of participation)
    groups.set(player.editionSlug, [
      ...(groups.get(player.editionSlug) ?? []),
      player,
    ]);
  const editions = await Promise.all(
    [...groups].map(([slug, people]) => editionPerformance(slug, people)),
  );
  return summarizeMapPerformance(editions);
}

async function editionPerformance(
  slug: string,
  people: PublishedPlayer[],
): Promise<PlayerMapEdition> {
  // Coaches are not part of the playing roster; their seasons still appear.
  const roster = people.filter(
    (p) => p.participation !== "coach" && p.role !== "coach",
  );
  const base: PlayerMapEdition = {
    editionSlug: slug,
    editionName: people[0]?.editionName ?? slug,
    maps: [],
    averagePlacement: null,
    firstPlaces: 0,
    averageAccuracy: null,
    averageEffectiveRating: null,
    ratedMaps: 0,
    teamMaps: 0,
    mapsWon: 0,
    mapsLost: 0,
    mapsTied: 0,
    unavailable: false,
  };
  const osuId = roster[0]?.osuId ?? people[0]?.osuId;
  if (osuId === undefined) return base;
  const rosterTeams = [
    ...new Set(roster.flatMap((p) => (p.team ? [p.team.id] : []))),
  ];
  try {
    const statistics = await publicArchiveStatistics(slug);
    return {
      ...base,
      ...mapPerformance(statistics.plays, osuId, rosterTeams),
    };
  } catch (error) {
    // Archived seasons without a published statistics projection fall back to
    // approved live results instead of hiding the season entirely.
    if (!(error instanceof HttpError) || error.status !== 404)
      return { ...base, unavailable: true };
  }
  return liveEditionPerformance(slug, base, osuId, rosterTeams);
}

/** Approved live results (fixture → games → per-player scores) as map plays. */
export function liveMapPlays(
  games: RatingGame[],
  stageByFixture: Map<string, string>,
  slots: Map<string, string>,
): MapPlay[] {
  return games.flatMap((game) => {
    if (game.problem || !game.at) return [];
    const stage = stageByFixture.get(game.fixtureId) ?? "unknown";
    const slot = slots.get(`${game.roundId}:${game.beatmapId}`) ?? "—";
    const title =
      [game.beatmap?.artist, game.beatmap?.title, game.beatmap?.difficulty]
        .filter(Boolean)
        .join(" - ") || `MP #${game.gameId}`;
    return game.scores.map((score) => ({
      fixtureId: game.fixtureId,
      gameId: game.gameId,
      stage,
      title,
      slot,
      at: game.at,
      osuId: score.userId,
      teamId: score.teamId,
      winnerTeamId: game.winnerTeamId,
      score: score.total,
      accuracy: score.accuracy ?? null,
    }));
  });
}

async function fixtureStages(slug: string) {
  const rows = await db()
    .select({ id: fixtures.id, kind: tournamentStages.kind })
    .from(fixtures)
    .innerJoin(
      tournamentRounds,
      and(
        eq(tournamentRounds.id, fixtures.roundId),
        eq(tournamentRounds.editionSlug, fixtures.editionSlug),
      ),
    )
    .innerJoin(
      tournamentStages,
      and(
        eq(tournamentStages.id, tournamentRounds.stageId),
        eq(tournamentStages.editionSlug, fixtures.editionSlug),
      ),
    )
    .where(eq(fixtures.editionSlug, slug));
  return new Map(rows.map((row) => [row.id, row.kind]));
}

async function poolSlots(slug: string) {
  const rows = await db()
    .select({
      roundId: mappools.roundId,
      category: mappoolEntries.category,
      position: mappoolEntries.position,
      beatmapId: mappoolEntries.beatmapId,
    })
    .from(mappoolEntries)
    .innerJoin(mappools, eq(mappoolEntries.poolId, mappools.id))
    .where(eq(mappools.editionSlug, slug));
  const slots = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.roundId}:${row.beatmapId}`;
    if (!slots.has(key)) slots.set(key, slotLabel(row.category, row.position));
  }
  return slots;
}

async function liveEditionPerformance(
  slug: string,
  base: PlayerMapEdition,
  osuId: number,
  rosterTeams: string[],
): Promise<PlayerMapEdition> {
  // The remote read contract exposes per-player map scores only inside a single
  // public fixture; there is no edition-wide resource yet, so a remote frontend
  // stays archive-only instead of fanning out one request per fixture.
  if (remoteMode()) return { ...base, unavailable: true };
  try {
    const [games, stages, slots] = await Promise.all([
      approvedRatingGames(slug, db()),
      fixtureStages(slug),
      poolSlots(slug),
    ]);
    return {
      ...base,
      ...mapPerformance(liveMapPlays(games, stages, slots), osuId, rosterTeams),
    };
  } catch {
    return { ...base, unavailable: true };
  }
}
