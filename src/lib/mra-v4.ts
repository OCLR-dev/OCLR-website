/**
 * YumuRating MRA v4.
 *
 * Unlike the score-only v1 policy, v4 compares each score with a guidance
 * score built from the map's average combo/accuracy and its maximum combo.
 * Every included score contributes one raw rating (RRA); the final MRA is
 * 70% scaled rating and 30% damage rating.
 */
export const MRA_V4_POLICY = "yumu-mra-v4";

export type MraV4ModPower = "nm" | "mod" | "hd" | "hr" | "dt";

export type MraV4Score = {
  userId: number;
  teamId: string;
  total: number;
  accuracy: number | null;
  combo: number | null;
  mods: readonly string[];
};

export type MraV4Game = {
  gameId: number;
  teamIds: readonly string[];
  winnerTeamId: string | null;
  maxCombo: number;
  /** The map's pool mod, used for the guidance-score bonus. */
  poolMods: readonly string[];
  scores: readonly MraV4Score[];
};

export type MraV4Player = {
  userId: number;
  /** Scores that entered at least one rating calculation. */
  appearances: number;
  ara: number;
  tra: number;
  sra: number;
  dra: number;
  era: number;
  mra: number;
  powers: Record<MraV4ModPower, number>;
};

export type MraV4Report = {
  policy: typeof MRA_V4_POLICY;
  players: MraV4Player[];
  playerCount: number;
  scoreCount: number;
  mapCount: number;
  skippedMaps: number;
};

const MOD_BONUS: Record<string, number> = {
  HD: 1.04,
  DT: 1.23,
  NC: 1.23,
  HR: 1.09,
  EZ: 0.75,
  FL: 1.2,
};

const DIFFICULTY_MODS = new Set(["HD", "HR", "DT", "NC", "EZ", "FL"]);

export const MRA_V4_MIN_ACCURACY = 0.001;
export const MRA_V4_MIN_COMBO = 10;

function accuracy(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  // Older imported rows occasionally store percentages instead of fractions.
  const normalized = value > 1 && value <= 100 ? value / 100 : value;
  return normalized <= 1 ? normalized : null;
}

function combo(value: number | null) {
  return value !== null && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function modSet(mods: readonly string[]) {
  return new Set(mods.map((mod) => mod.trim().toUpperCase()).filter(Boolean));
}

function modBonus(mods: Iterable<string>) {
  let bonus = 1;
  for (const mod of mods) bonus *= MOD_BONUS[mod] ?? 1;
  return bonus;
}

function hasMod(mods: Set<string>, power: MraV4ModPower) {
  const difficulty = [...mods].some((mod) => DIFFICULTY_MODS.has(mod));
  switch (power) {
    case "nm":
      return !difficulty;
    case "mod":
      return difficulty;
    case "hd":
      return mods.has("HD");
    case "hr":
      return mods.has("HR");
    case "dt":
      return mods.has("DT") || mods.has("NC");
  }
}

type PreparedGame = {
  scores: {
    score: MraV4Score;
    accuracy: number;
    combo: number;
    mods: Set<string>;
  }[];
  guidance: number;
};

function prepare(game: MraV4Game, power?: MraV4ModPower): PreparedGame | null {
  if (
    !Number.isSafeInteger(game.gameId) ||
    game.gameId <= 0 ||
    !Number.isSafeInteger(game.maxCombo) ||
    game.maxCombo <= 0 ||
    game.teamIds.length !== 2 ||
    new Set(game.teamIds).size !== 2
  )
    return null;
  const scores = game.scores.flatMap((score) => {
    const acc = accuracy(score.accuracy);
    const value = combo(score.combo);
    if (
      !Number.isSafeInteger(score.userId) ||
      score.userId <= 0 ||
      !Number.isFinite(score.total) ||
      score.total < 0 ||
      acc === null ||
      acc < MRA_V4_MIN_ACCURACY ||
      value === null ||
      value < MRA_V4_MIN_COMBO
    )
      return [];
    return [
      {
        score,
        accuracy: acc,
        combo: Math.min(value, game.maxCombo),
        mods: modSet(score.mods),
      },
    ];
  });
  const eligible = power
    ? scores.filter((row) => hasMod(row.mods, power))
    : scores;
  if (!eligible.length) return null;
  const averageCombo =
    eligible.reduce((sum, row) => sum + row.combo, 0) / eligible.length;
  const averageAccuracy =
    eligible.reduce((sum, row) => sum + row.accuracy, 0) / eligible.length;
  const guidance =
    (700_000 * (averageCombo / game.maxCombo) +
      300_000 * Math.pow(averageAccuracy, 8)) *
    modBonus(game.poolMods);
  if (!Number.isFinite(guidance) || guidance <= 0) return null;
  return { scores: eligible, guidance };
}

function rate(
  games: readonly MraV4Game[],
  power?: MraV4ModPower,
): Map<number, Omit<MraV4Player, "powers">> {
  const rows = new Map<number, { rras: number[] }>();
  for (const game of games) {
    const prepared = prepare(game, power);
    if (!prepared) continue;
    for (const row of prepared.scores) {
      const expected =
        700_000 * (row.combo / game.maxCombo) +
        300_000 * Math.pow(row.accuracy, 8);
      const rra = expected / prepared.guidance;
      const value = rows.get(row.score.userId) ?? { rras: [] };
      value.rras.push(rra);
      rows.set(row.score.userId, value);
    }
  }
  if (!rows.size) return new Map();
  const count = rows.size;
  const entries = [...rows].map(([userId, value]) => {
    const tra = value.rras.reduce((sum, rra) => sum + rra, 0);
    return {
      userId,
      rras: value.rras,
      ara: tra / value.rras.length,
      tra,
      appearances: value.rras.length,
    };
  });
  const sumAra = entries.reduce((sum, row) => sum + row.ara, 0);
  const totalScores = entries.reduce((sum, row) => sum + row.appearances, 0);
  const scaled = entries.map((row) => ({
    ...row,
    sra: sumAra > 0 ? (row.ara * count) / sumAra : 0,
  }));
  const minSra = Math.min(...scaled.map((row) => row.sra));
  const miu = 2 / (1 + Math.exp(0.5 - 0.25 * count)) - 1;
  const denominator = 1 - minSra * miu;
  const rated = new Map<number, Omit<MraV4Player, "powers">>();
  for (const row of scaled) {
    const era =
      denominator > 0
        ? (row.sra - minSra * miu) / denominator
        : row.sra;
    const dra = totalScores > 0 ? (row.tra * count) / totalScores : 0;
    rated.set(row.userId, {
      userId: row.userId,
      appearances: row.appearances,
      ara: row.ara,
      tra: row.tra,
      sra: row.sra,
      dra,
      era,
      mra: 0.7 * era + 0.3 * dra,
    });
  }
  return rated;
}

export function calculateMraV4(input: readonly MraV4Game[]): MraV4Report {
  const games = new Map<number, MraV4Game>();
  for (const game of input) {
    if (!games.has(game.gameId)) games.set(game.gameId, game);
  }
  const unique = [...games.values()];
  const overall = rate(unique);
  const mod = rate(unique, "mod");
  const nm = rate(unique, "nm");
  const hd = rate(unique, "hd");
  const hr = rate(unique, "hr");
  const dt = rate(unique, "dt");
  const players: MraV4Player[] = [];
  for (const [userId, row] of overall) {
    players.push({
      ...row,
      powers: {
        nm: nm.get(userId)?.mra ?? 0,
        mod: mod.get(userId)?.mra ?? 0,
        hd: hd.get(userId)?.mra ?? 0,
        hr: hr.get(userId)?.mra ?? 0,
        dt: dt.get(userId)?.mra ?? 0,
      },
    });
  }
  players.sort((a, b) => b.mra - a.mra || a.userId - b.userId);
  const prepared = unique.filter((game) => prepare(game) !== null);
  return {
    policy: MRA_V4_POLICY,
    players,
    playerCount: players.length,
    scoreCount: players.reduce((sum, row) => sum + row.appearances, 0),
    mapCount: prepared.length,
    skippedMaps: unique.length - prepared.length,
  };
}
