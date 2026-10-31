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
  /** The edition's public statistics projection could not be read. */
  unavailable: boolean;
};

export type PlayerMapPerformance = {
  mapsPlayed: number;
  averagePlacement: number | null;
  firstPlaces: number;
  averageAccuracy: number | null;
  averageEffectiveRating: number | null;
  ratedMaps: number;
  editions: PlayerMapEdition[];
};

const mean = (values: number[]) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

const finite = (value: number | null): value is number =>
  value !== null && Number.isFinite(value);

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
 * Ranks each recorded map and measures every participant against that map's
 * field. A map whose mean score is zero or unusable contributes a placement
 * but never an effective rating.
 */
export function mapPerformance(plays: MapPlay[], osuId: number) {
  const games = new Map<number, MapPlay[]>();
  for (const play of plays)
    games.set(play.gameId, [...(games.get(play.gameId) ?? []), play]);
  const rows: PlayerMapRow[] = [];
  for (const [gameId, game] of games) {
    if (!game.some((play) => play.osuId === osuId)) continue;
    const totals = game.map((play) => ({
      osuId: play.osuId,
      total: play.score,
    }));
    const ranks = placements(totals);
    const average = mean(totals.map((total) => total.total));
    const usableAverage =
      average !== null && Number.isFinite(average) && average > 0;
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
        effectiveRating: finite(ratio) ? ratio : null,
      });
    }
  }
  rows.sort(
    (a, b) => (b.at ?? "").localeCompare(a.at ?? "") || b.gameId - a.gameId,
  );
  const rated = rows.filter((row) => finite(row.effectiveRating));
  return {
    rows,
    averagePlacement: mean(
      rows.flatMap((row) => (row.placement === null ? [] : [row.placement])),
    ),
    firstPlaces: rows.filter((row) => row.placement === 1).length,
    averageAccuracy: mean(
      rows.flatMap((row) => (row.accuracy === null ? [] : [row.accuracy])),
    ),
    averageEffectiveRating: mean(rated.map((row) => row.effectiveRating!)),
    ratedMaps: rated.length,
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
    averagePlacement: mean(
      rows.flatMap((row) => (row.placement === null ? [] : [row.placement])),
    ),
    firstPlaces: rows.filter((row) => row.placement === 1).length,
    averageAccuracy: mean(
      rows.flatMap((row) => (row.accuracy === null ? [] : [row.accuracy])),
    ),
    averageEffectiveRating: mean(rated.map((row) => row.effectiveRating!)),
    ratedMaps: rated.length,
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
    unavailable: false,
  };
  const osuId = roster[0]?.osuId ?? people[0]?.osuId;
  if (osuId === undefined) return base;
  try {
    const statistics = await publicArchiveStatistics(slug);
    return { ...base, ...mapPerformance(statistics.plays, osuId) };
  } catch (error) {
    // Archived seasons without a published statistics projection fall back to
    // approved live results instead of hiding the season entirely.
    if (!(error instanceof HttpError) || error.status !== 404)
      return { ...base, unavailable: true };
  }
  return liveEditionPerformance(slug, base, osuId);
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
      ...mapPerformance(liveMapPlays(games, stages, slots), osuId),
    };
  } catch {
    return { ...base, unavailable: true };
  }
}
