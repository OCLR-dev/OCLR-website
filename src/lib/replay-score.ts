import type { ReplayPerformance, ReplaySummary } from "./replay-model";

export const TARGET_PRACTICE = 1 << 23;
const scoreV2 = 1 << 29;
const silverMods = (1 << 3) | (1 << 10) | (1 << 20); // HD, FL, FI
type Grade = NonNullable<ReplayPerformance["grade"]>;
type Judgements = readonly [
  great: number,
  good: number,
  meh: number,
  geki: number,
  katu: number,
  miss: number,
];

function ratioGrade(
  great: number,
  meh: number,
  miss: number,
  total: number,
): Grade {
  if (great === total) return "SS";
  const ratio = great / total;
  if (ratio > 0.9 && miss === 0 && meh / total <= 0.01) return "S";
  if (ratio > 0.9 || (miss === 0 && ratio > 0.8)) return "A";
  if (ratio > 0.8 || (miss === 0 && ratio > 0.7)) return "B";
  return ratio > 0.6 ? "C" : "D";
}

function accuracyGrade(accuracy: number, mode: "fruits" | "mania"): Grade {
  const [s, a, b, c] =
    mode === "fruits" ? [0.98, 0.94, 0.9, 0.85] : [0.95, 0.9, 0.8, 0.7];
  if (accuracy === 1) return "SS";
  if (accuracy > s) return "S";
  if (accuracy > a) return "A";
  if (accuracy > b) return "B";
  return accuracy > c ? "C" : "D";
}

/** Stable grading and accuracy use the file's recorded judgements. */
export function replayPerformance(
  mode: ReplaySummary["mode"],
  mods: number,
  [great, good, meh, geki, katu, miss]: Judgements,
  score: number,
  fullCombo: boolean,
): ReplayPerformance {
  const unavailable = { score, fullCombo, accuracy: null, grade: null };
  // Target Practice needs the number of targets from the original map.
  if (mods & TARGET_PRACTICE) return unavailable;

  const hits = great + good + meh;
  let total: number;
  let points: number;
  let maximum: number;
  switch (mode) {
    case "osu":
      total = hits + miss;
      points = 6 * great + 2 * good + meh;
      maximum = 6 * total;
      break;
    case "taiko":
      total = great + good + miss;
      points = 2 * great + good;
      maximum = 2 * total;
      break;
    case "fruits":
      total = hits + katu + miss;
      points = hits;
      maximum = total;
      break;
    case "mania": {
      const perfectWeight = mods & scoreV2 ? 305 : 300;
      total = hits + geki + katu + miss;
      points =
        great * 300 + good * 100 + meh * 50 + geki * perfectWeight + katu * 200;
      maximum = total * perfectWeight;
      break;
    }
  }
  if (!maximum) return unavailable;

  const accuracy = points / maximum;
  let grade =
    mode === "osu" || mode === "taiko"
      ? ratioGrade(great, mode === "taiko" ? 0 : meh, miss, total)
      : accuracyGrade(accuracy, mode);
  if (mods & silverMods) {
    if (grade === "SS") grade = "SSH";
    else if (grade === "S") grade = "SH";
  }
  return { score, fullCombo, accuracy, grade };
}
