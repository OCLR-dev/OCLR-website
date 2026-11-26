import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { fixtures, tournamentRounds, tournamentStages } from "@/db/schema";
import { approvedRatingGames } from "./approved-rating-games";
import { publicArchiveStatistics } from "./archive-statistics-reads";
import { getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { HttpError } from "./http-error";
import type { PublishedPlayer } from "./players";
import type { RatingGame } from "./yumu-rating";

export * from "./player-map-performance-model";
import {
  mapPerformance,
  summarizeMapPerformance,
  type MapPlay,
  type PlayerMapEdition,
  type PlayerMapPerformance,
} from "./player-map-performance-model";
import { relationalArchiveMapPerformance } from "./archive-map-performance";

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
  // Saved-read resources share a connection; nested transaction savepoints must be serial.
  const editions: PlayerMapEdition[] = [];
  for (const [slug, people] of groups)
    editions.push(await editionPerformance(slug, people));
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
    secondPlaces: 0,
    thirdPlaces: 0,
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
    const aggregated = await relationalArchiveMapPerformance(
      slug,
      osuId,
      rosterTeams,
    );
    if (aggregated !== undefined) return { ...base, ...aggregated };
    const plays = await publicSeasonMapPlays(slug);
    return plays
      ? { ...base, ...mapPerformance(plays, osuId, rosterTeams) }
      : { ...base, unavailable: true };
  } catch {
    return { ...base, unavailable: true };
  }
}

/** Approved live results (fixture → games → per-player scores) as map plays. */
export function liveMapPlays(
  games: RatingGame[],
  stageByFixture: Map<string, string>,
): MapPlay[] {
  return games.flatMap((game) => {
    const at = game.playedAt ?? game.at;
    if (game.problem || !at) return [];
    const stage = stageByFixture.get(game.fixtureId) ?? "unknown";
    const slot = game.slot ?? "—";
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
      at,
      osuId: score.userId,
      teamId: score.teamId,
      winnerTeamId: game.winnerTeamId,
      score: score.total,
      rawScore: score.unadjustedTotal ?? score.rawTotal,
      scoreMultiplier: score.scoreMultiplier,
      accuracy: score.accuracy ?? null,
      mods: score.mods ?? [],
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

/** Shared public score inputs for the profile and batched chat history. */
export async function publicSeasonMapPlays(
  slug: string,
): Promise<MapPlay[] | null> {
  try {
    return (await publicArchiveStatistics(slug)).plays;
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }
  // Remote read resources have no edition-wide live map breakdown.
  if (remoteMode() || !(await getPublicEdition(slug))) return null;
  const games = await approvedRatingGames(slug, db());
  return games.length ? liveMapPlays(games, await fixtureStages(slug)) : [];
}
