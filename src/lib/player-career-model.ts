import {
  mapResult,
  minimumCountedScore,
  placements,
  type MapPlay,
} from "./player-map-performance-model";

/** One team series in an edition, reduced to the fields career totals need. */
export type CareerSeries = {
  teamA: string | null;
  teamB: string | null;
  label: string | null;
  at: string | null;
  winnerTeamId: string | null;
  loserTeamId: string | null;
};

/** The teams that finished first, second and third in one edition. */
export type CareerPodium = {
  champion: string | null;
  runnerUp: string | null;
  third: string[];
};

/**
 * Everything one edition contributes to career totals. `plays` is null when
 * that edition's published statistics are unavailable; its podiums and series
 * still count.
 */
export type CareerEditionInput = {
  editionSlug: string;
  /** osu! UID to the team IDs the player appeared for in this edition. */
  roster: Map<number, string[]>;
  series: CareerSeries[];
  podium: CareerPodium;
  plays: MapPlay[] | null;
};

/** The 12 values the career ranking displays and sorts by. */
export type CareerTotals = {
  championships: number;
  runnerUps: number;
  thirdPlaces: number;
  seasons: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaceMaps: number;
  mapsPlayed: number;
  mapsWon: number;
  mapsLost: number;
  mapsTied: number;
  mapWinRate: number | null;
  averageAccuracy: number | null;
  longestWinStreak: number;
};

export function emptyCareerTotals(): CareerTotals {
  return {
    championships: 0,
    runnerUps: 0,
    thirdPlaces: 0,
    seasons: 0,
    firstPlaces: 0,
    secondPlaces: 0,
    thirdPlaceMaps: 0,
    mapsPlayed: 0,
    mapsWon: 0,
    mapsLost: 0,
    mapsTied: 0,
    mapWinRate: null,
    averageAccuracy: null,
    longestWinStreak: 0,
  };
}

function timeOf(at: string | null) {
  const parsed = Date.parse(at ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Sum every edition into per-player totals. Podiums and tournament appearances
 * come from the published rosters and series; map values come from the same
 * counted-play rules as the player profile (scores below 2000 are ignored,
 * maps are ranked by score, and accuracy only averages recorded values).
 */
export function careerTotals(
  editions: CareerEditionInput[],
): Map<number, CareerTotals> {
  const totals = new Map<number, CareerTotals>();
  const accuracy = new Map<number, { sum: number; count: number }>();
  const history = new Map<
    number,
    { outcome: "win" | "loss" | "draw"; at: string | null }[]
  >();

  const playerTotals = (osuId: number) => {
    let value = totals.get(osuId);
    if (!value) {
      value = emptyCareerTotals();
      totals.set(osuId, value);
    }
    return value;
  };

  for (const edition of editions) {
    for (const [osuId, teams] of edition.roster) {
      const value = playerTotals(osuId);
      value.seasons += 1;
      if (edition.podium.champion && teams.includes(edition.podium.champion))
        value.championships += 1;
      if (edition.podium.runnerUp && teams.includes(edition.podium.runnerUp))
        value.runnerUps += 1;
      if (edition.podium.third.some((team) => teams.includes(team)))
        value.thirdPlaces += 1;

      for (const series of edition.series) {
        const involved =
          (series.teamA !== null && teams.includes(series.teamA)) ||
          (series.teamB !== null && teams.includes(series.teamB));
        if (!involved) continue;
        const outcome =
          series.winnerTeamId === null
            ? "draw"
            : teams.includes(series.winnerTeamId)
              ? "win"
              : "loss";
        const rows = history.get(osuId);
        if (rows) rows.push({ outcome, at: series.at });
        else history.set(osuId, [{ outcome, at: series.at }]);
      }
    }

    if (!edition.plays) continue;
    const games = new Map<number, MapPlay[]>();
    for (const play of edition.plays) {
      if ((play.rawScore ?? play.score) < minimumCountedScore) continue;
      const game = games.get(play.gameId);
      if (game) game.push(play);
      else games.set(play.gameId, [play]);
    }
    for (const game of games.values()) {
      const ranks = placements(
        game.map((play) => ({ osuId: play.osuId, total: play.score })),
      );
      const results = new Map<string, ReturnType<typeof mapResult>>();
      for (const play of game) {
        const value = playerTotals(play.osuId);
        value.mapsPlayed += 1;
        const place = ranks.get(play.osuId);
        if (place === 1) value.firstPlaces += 1;
        else if (place === 2) value.secondPlaces += 1;
        else if (place === 3) value.thirdPlaceMaps += 1;

        let result = results.get(play.teamId);
        if (result === undefined) {
          result = mapResult(game, play.teamId);
          results.set(play.teamId, result);
        }
        if (result === "win") value.mapsWon += 1;
        else if (result === "loss") value.mapsLost += 1;
        else if (result === "tie") value.mapsTied += 1;

        if (play.accuracy !== null && Number.isFinite(play.accuracy)) {
          const entry = accuracy.get(play.osuId) ?? { sum: 0, count: 0 };
          entry.sum += play.accuracy;
          entry.count += 1;
          accuracy.set(play.osuId, entry);
        }
      }
    }
  }

  for (const [osuId, value] of totals) {
    const entry = accuracy.get(osuId);
    value.averageAccuracy = entry?.count ? entry.sum / entry.count : null;
    const decided = value.mapsWon + value.mapsLost;
    value.mapWinRate = decided > 0 ? value.mapsWon / decided : null;
    const rows = history.get(osuId);
    if (!rows) continue;
    rows.sort((left, right) => timeOf(left.at) - timeOf(right.at));
    let streak = 0;
    for (const row of rows) {
      streak = row.outcome === "win" ? streak + 1 : 0;
      if (streak > value.longestWinStreak) value.longestWinStreak = streak;
    }
  }

  return totals;
}
