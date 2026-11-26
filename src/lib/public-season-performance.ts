import {
  approvedRatingGames,
  type RatingReader,
} from "./approved-rating-games";
import { publicCompetition } from "./public-competition";
import { fixtureRatingIdentities } from "./rating-data";
import { readTournament } from "./tournament-reads";
import type { RatingGame } from "./yumu-rating";

/** The same publication and participant boundary for public series and per-map analysis. */
export async function publicSeasonPerformance(
  slug: string,
  reader: RatingReader,
) {
  if (!(await readTournament(slug, reader, true))) return null;
  const competition = await publicCompetition(slug, reader);
  if (!competition?.databaseAuthority) return null;
  const fixtures = competition.fixtures.filter(
    (f) => f.status !== "cancelled" && f.stage !== "exhibition",
  );
  const teams = new Map<string, string>();
  for (const { result, home, away } of fixtures) {
    if (!result || !home.team || !away.team) continue;
    teams.set(home.team.id, home.team.name);
    teams.set(away.team.id, away.team.name);
  }
  const { names, visible } = await fixtureRatingIdentities(slug, reader, [
    ...teams.keys(),
  ]);
  const byFixture = Map.groupBy(
    teams.size
      ? await approvedRatingGames(slug, reader, { includeReviewedPool: true })
      : [],
    (game) => game.fixtureId,
  );
  const games = fixtures.flatMap((fixture) => {
    const result = fixture.result;
    if (!result) return [];
    const sides = [fixture.home.team?.id, fixture.away.team?.id].filter(
      (id): id is string => !!id,
    );
    const ids = new Set(result.games.map((g) => g.gameId));
    const source = (byFixture.get(fixture.id) ?? []).filter(
      (g) => g.revision === result.revision && ids.has(g.gameId),
    );
    const withheld =
      sides.length !== 2 ||
      sides[0] === sides[1] ||
      source.some((g) => g.scores.some((s) => !visible(s.userId, sides)));
    return result.games.flatMap((published) => {
      const copies = source.filter((g) => g.gameId === published.gameId);
      const items: {
        fixture: typeof fixture;
        gameId: number;
        sides: string[];
        rating: RatingGame | null;
      }[] = [];
      if (withheld || !copies.length)
        return [{ fixture, gameId: published.gameId, sides, rating: null }];
      for (const g of copies) {
        const valid =
          !g.problem &&
          g.roundId === fixture.roundId &&
          g.teamIds.length === 2 &&
          sides.every((id) => g.teamIds.includes(id)) &&
          g.winnerTeamId === published.winnerTeamId &&
          (g.beatmapId ?? null) === published.beatmapId;
        items.push({
          fixture,
          gameId: g.gameId,
          sides,
          rating: valid ? g : null,
        });
      }
      return items;
    });
  });
  return { fixtures, names, teams, games };
}
