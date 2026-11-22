import type { BeatmapAttributes, BeatmapMetadata } from "./mappool-model";
import type { ReplaySummary } from "./replay-model";

const difficultyModFlags: Partial<Record<string, number>> = {
  EZ: 1 << 1,
  HD: 1 << 3,
  HR: 1 << 4,
  DT: 1 << 6,
  HT: 1 << 8,
};
const nightcore = 1 << 9;
// The legacy osu! mods from NF through PF and ScoreV2 leave the hit object
// and slider tick counts unchanged. Other rulesets need matching attributes.
const osuComboPreservingMods = ((1 << 15) - 1) | (1 << 29);

export function replayBeatmapMaxCombo(
  { beatmapId, metadata }: { beatmapId: number; metadata: BeatmapMetadata },
  replay: ReplaySummary,
) {
  const achieved = replay.performance?.maxCombo;
  const checksum = metadata.checksum?.toLowerCase();
  const replayChecksum = replay.beatmapMd5.toLowerCase();
  if (
    achieved === undefined ||
    (checksum && checksum !== replayChecksum) ||
    (metadata.mode && metadata.mode !== replay.mode)
  )
    return undefined;

  const snapshot = metadata.difficultySnapshot;
  const matchesSnapshot =
    snapshot?.beatmapId === beatmapId &&
    snapshot.ruleset === replay.mode &&
    snapshot.checksum?.toLowerCase() === replayChecksum;
  const candidates = [
    checksum ? metadata.attributes : undefined,
    ...Object.values(matchesSnapshot ? (snapshot.variants ?? {}) : {}),
  ].filter(
    (a): a is BeatmapAttributes & { maxCombo: number } =>
      a?.ruleset === replay.mode &&
      Array.isArray(a.mods) &&
      typeof a.maxCombo === "number" &&
      Number.isSafeInteger(a.maxCombo) &&
      a.maxCombo > 0,
  );
  const mods =
    replay.mods & nightcore
      ? (replay.mods & ~nightcore) | (1 << 6)
      : replay.mods;
  const matching = candidates.find(
    (a) =>
      a.mods.every((mod) => Object.hasOwn(difficultyModFlags, mod)) &&
      a.mods.reduce((mask, mod) => mask | difficultyModFlags[mod]!, 0) === mods,
  );
  const sameOsuCombo =
    replay.mode === "osu" && (replay.mods & ~osuComboPreservingMods) === 0;
  const maximum = (matching ?? (sameOsuCombo ? candidates[0] : undefined))
    ?.maxCombo;
  return maximum !== undefined && maximum >= achieved ? maximum : undefined;
}
