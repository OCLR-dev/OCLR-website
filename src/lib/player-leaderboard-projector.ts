import maxCombos from "@/data/beatmap-max-combos.json";
import type { Edition } from "./editions";
import type { PublicArchiveStatistics } from "./archive-statistics";
import type {
  PlayerLeaderboardCore,
  PlayerLeaderboardRow,
} from "./player-leaderboard-model";
import { classifyPlayer } from "./player-class";
import { minimumCountedScore } from "./player-map-performance-model";
import { slotCategory } from "./mappool-model";
import { calculateMraV4, type MraV4Game, type MraV4Player } from "./mra-v4";
import { HttpError } from "./http-error";

type Accumulator = {
  osuId: number;
  username: string;
  team: string | null;
  lastSeason: number;
  teamSeason: number;
  wins: number;
  losses: number;
  draws: number;
  appearances: number;
  rwsSum: number;
  rwsCount: number;
  teamKeys: Set<string>;
};

const comboTable = maxCombos.combos as Record<string, number>;

function seasonNumber(slug: string) {
  const match = /(\d+)$/.exec(slug);
  return match ? Number(match[1]) : 0;
}

const POOL_MODS = new Set(["HD", "HR", "DT", "NC", "EZ", "FL"]);

function indices<T>(
  rows: T[],
  compare: (a: T, b: T) => number,
  set: (row: T, index: number) => void,
) {
  if (rows.length < 2) return;
  const sorted = [...rows].sort(compare);
  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (
      end + 1 < sorted.length &&
      compare(sorted[start], sorted[end + 1]) === 0
    )
      end++;
    const index = (start + end) / 2 / (sorted.length - 1);
    for (let i = start; i <= end; i++) set(sorted[i], index);
    start = end + 1;
  }
}

function poolMods(slot: string, plays: readonly { mods: readonly string[] }[]) {
  const category = slotCategory(slot);
  if (category === "HD") return ["HD"];
  if (category === "HR") return ["HR"];
  if (category === "DT") return ["DT"];
  // Free Mod and Tie Breaker have no single pool mod. Use the most common
  // difficulty-mod combination in the lobby for the guidance bonus.
  const counts = new Map<string, number>();
  for (const play of plays) {
    const mods = [
      ...new Set(
        play.mods
          .map((mod) => mod.trim().toUpperCase())
          .filter((mod) => POOL_MODS.has(mod)),
      ),
    ].sort();
    if (!mods.length) continue;
    const key = mods.join("+");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0].split("+") : [];
}

/**
 * Career-wide v4 leaderboard. It reads only published statistics snapshots and
 * skips maps without a verified maximum combo instead of inventing one.
 */
export async function projectPlayerLeaderboard(
  editions: readonly Edition[],
  readStatistics: (slug: string) => Promise<PublicArchiveStatistics>,
  strict = true,
): Promise<PlayerLeaderboardCore> {
  const players = new Map<number, Accumulator>();
  const games: MraV4Game[] = [];
  const seenGames = new Set<number>();
  // Every map a team appeared on, independent of which individual players
  // scored. Participation uses this denominator, not only the maps a player
  // personally appeared in.
  const teamMapCounts = new Map<string, number>();
  let available = 0;
  let unavailable = 0;
  let skippedMaps = 0;

  const ensure = (osuId: number, username: string, edition: string) => {
    const season = seasonNumber(edition);
    let row = players.get(osuId);
    if (!row) {
      row = {
        osuId,
        username,
        team: null,
        lastSeason: season,
        teamSeason: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        appearances: 0,
        rwsSum: 0,
        rwsCount: 0,
        teamKeys: new Set(),
      };
      players.set(osuId, row);
    } else if (season >= row.lastSeason) {
      row.username = username;
      row.lastSeason = season;
    }
    return row;
  };

  for (const edition of editions) {
    let statistics: PublicArchiveStatistics;
    try {
      statistics = await readStatistics(edition.slug);
    } catch (error) {
      if (strict && (!(error instanceof HttpError) || error.status !== 404))
        throw error;
      unavailable++;
      continue;
    }
    available++;
    const season = seasonNumber(edition.slug);
    const teamNames = new Map(
      statistics.teams.map((team) => [team.id, team.name]),
    );
    const roster = new Map(
      statistics.players.map((player) => [player.osuId, player.username]),
    );
    const byGame = new Map<number, typeof statistics.plays>();
    for (const play of statistics.plays) {
      const rows = byGame.get(play.gameId) ?? [];
      rows.push(play);
      byGame.set(play.gameId, rows);
    }

    for (const [gameId, plays] of byGame) {
      const teamTotals = new Map<string, number>();
      const teamIds = new Set<string>();
      for (const play of plays) {
        teamIds.add(play.teamId);
        teamTotals.set(
          play.teamId,
          (teamTotals.get(play.teamId) ?? 0) + play.score,
        );
      }
      if (teamIds.size !== 2) continue;
      const teams = [...teamIds].sort();
      const first = teamTotals.get(teams[0]) ?? 0;
      const second = teamTotals.get(teams[1]) ?? 0;
      const winner =
        first === second ? null : first > second ? teams[0] : teams[1];
      const winningTotal = winner ? (teamTotals.get(winner) ?? 0) : 0;

      for (const team of teams) {
        const teamName = teamNames.get(team) ?? null;
        const teamKey = `${edition.slug}:${team}`;
        teamMapCounts.set(teamKey, (teamMapCounts.get(teamKey) ?? 0) + 1);
        for (const play of plays) {
          if (play.teamId !== team) continue;
          const row = ensure(
            play.osuId,
            roster.get(play.osuId) ?? String(play.osuId),
            edition.slug,
          );
          row.teamKeys.add(teamKey);
          if (teamName && season >= row.teamSeason) {
            row.team = teamName;
            row.teamSeason = season;
          }
        }
      }

      // A player who was in the lobby without a countable score does not
      // contribute an RWS sample. Do not record their zero as a real share.
      const validPlays = plays.filter(
        (play) => play.score >= minimumCountedScore,
      );
      for (const play of validPlays) {
        const row = ensure(
          play.osuId,
          roster.get(play.osuId) ?? String(play.osuId),
          edition.slug,
        );
        row.appearances++;
        if (winner === null) row.draws++;
        else if (winner === play.teamId) row.wins++;
        else row.losses++;
        row.rwsCount++;
        row.rwsSum +=
          winner === play.teamId && winningTotal > 0
            ? play.score / winningTotal
            : 0;
      }

      const maxCombo = comboTable[String(plays[0].beatmapId)];
      if (!maxCombo || !Number.isSafeInteger(maxCombo) || maxCombo <= 0) {
        skippedMaps++;
        continue;
      }
      if (seenGames.has(gameId)) continue;
      seenGames.add(gameId);
      games.push({
        gameId,
        teamIds: teams,
        winnerTeamId: winner,
        maxCombo,
        poolMods: poolMods(plays[0].slot, plays),
        scores: plays.map((play) => ({
          userId: play.osuId,
          teamId: play.teamId,
          total: play.score,
          accuracy: play.accuracy,
          combo: play.combo,
          mods: play.mods,
        })),
      });
    }
  }

  const report = calculateMraV4(games);
  const ratings = new Map<number, MraV4Player>(
    report.players.map((player) => [player.userId, player]),
  );
  const rows: PlayerLeaderboardRow[] = [...players.values()].map((row) => {
    const rating = ratings.get(row.osuId);
    const mra = rating?.mra ?? 0;
    const rws = row.rwsCount ? row.rwsSum / row.rwsCount : null;
    const teamMaps = [...row.teamKeys].reduce(
      (total, key) => total + (teamMapCounts.get(key) ?? 0),
      0,
    );
    return {
      osuId: row.osuId,
      username: row.username,
      team: row.team,
      pp: null,
      mra,
      rws,
      classification: null,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      appearances: row.appearances,
      winRate:
        row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) : null,
      participation: teamMaps > 0 ? row.appearances / teamMaps : null,
      nm: rating?.powers.nm ?? 0,
      mod: rating?.powers.mod ?? 0,
      hd: rating?.powers.hd ?? 0,
      hr: rating?.powers.hr ?? 0,
      dt: rating?.powers.dt ?? 0,
    };
  });
  rows.sort(
    (a, b) =>
      b.mra - a.mra || (b.rws ?? -1) - (a.rws ?? -1) || a.osuId - b.osuId,
  );

  type RankedRow = {
    row: PlayerLeaderboardRow;
    rating: MraV4Player;
    eraIndex: number | null;
    draIndex: number | null;
    rwsIndex: number | null;
  };
  const ranked: RankedRow[] = [];
  for (const row of rows) {
    const rating = ratings.get(row.osuId);
    if (rating) {
      ranked.push({
        row,
        rating,
        eraIndex: null,
        draIndex: null,
        rwsIndex: null,
      });
    }
  }
  indices(
    ranked,
    (a, b) => b.rating.era - a.rating.era,
    (entry, index) => (entry.eraIndex = index),
  );
  indices(
    ranked,
    (a, b) => b.rating.dra - a.rating.dra,
    (entry, index) => (entry.draIndex = index),
  );
  const rwsRanked = ranked.filter((entry) => entry.row.rws !== null);
  indices(
    rwsRanked,
    (a, b) =>
      (b.row.rws ?? 0) - (a.row.rws ?? 0) || b.rating.dra - a.rating.dra,
    (entry, index) => (entry.rwsIndex = index),
  );
  for (const entry of ranked) {
    entry.row.classification = classifyPlayer(
      {
        appearances: entry.rating.appearances,
        eraIndex: entry.eraIndex,
        draIndex: entry.draIndex,
        rwsIndex: entry.rwsIndex,
      },
      ranked.length,
    );
  }

  return {
    players: rows,
    editions: available,
    unavailableEditions: unavailable,
    maps: report.mapCount,
    skippedMaps,
  };
}
