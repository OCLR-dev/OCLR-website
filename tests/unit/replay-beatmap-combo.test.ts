import { expect, it } from "vitest";
import type {
  BeatmapAttributes,
  BeatmapMetadata,
} from "../../src/lib/mappool-model";
import { replayBeatmapMaxCombo } from "../../src/lib/replay-beatmap-combo";
import type { ReplaySummary } from "../../src/lib/replay-model";

const checksum = "a".repeat(32);
const attributes: BeatmapAttributes = {
  configuration: "NM",
  mods: [],
  ruleset: "osu",
  maxCombo: 1275,
  stars: 6.26,
  values: {},
  fetchedAt: "2026-11-20T00:00:00Z",
};
const metadata: BeatmapMetadata = {
  checksum,
  mode: "osu",
  setId: 100,
  title: "Synthetic beatmap",
  artist: "Synthetic artist",
  difficulty: "Extra",
  mapper: "Synthetic mapper",
  stars: 6.26,
  bpm: 185,
  duration: 133,
  attributes,
};
const performance = {
  maxCombo: 1234,
  score: 100000,
  accuracy: 0.98,
  grade: "A",
  fullCombo: false,
} as const;
const replay: ReplaySummary = {
  format: "stable",
  version: 20261118,
  beatmapMd5: checksum,
  playerName: "Synthetic player",
  mode: "osu",
  mods: 0,
  performance,
};
const entry = { beatmapId: 101, metadata };

it("uses the map maximum for compatible stable osu! mods", () => {
  expect(replayBeatmapMaxCombo(entry, replay)).toBe(1275);
  expect(
    replayBeatmapMaxCombo(entry, { ...replay, mods: (1 << 29) | (1 << 3) }),
  ).toBe(1275);
});

it("prefers a matching saved Nightcore-equivalent variant for another ruleset", () => {
  const dt: BeatmapAttributes = {
    ...attributes,
    configuration: "DT",
    mods: ["DT"],
    ruleset: "taiko",
    maxCombo: 1300,
  };
  const taikoEntry = {
    ...entry,
    metadata: {
      ...metadata,
      mode: "taiko",
      attributes: { ...attributes, ruleset: "taiko" },
      difficultySnapshot: {
        checksum,
        ruleset: "taiko",
        beatmapId: 101,
        fetchedAt: attributes.fetchedAt,
        base: {
          stars: 6.26,
          bpm: 185,
          duration: 133,
          ar: null,
          od: null,
          cs: null,
          hp: null,
        },
        variants: { DT: dt },
      },
    },
  } satisfies typeof entry;
  const taikoReplay = { ...replay, mode: "taiko" } as const;
  expect(
    replayBeatmapMaxCombo(taikoEntry, { ...taikoReplay, mods: 1 << 9 }),
  ).toBe(1300);
  expect(
    replayBeatmapMaxCombo(taikoEntry, { ...taikoReplay, mods: 1 << 1 }),
  ).toBeUndefined();
});

it("omits a denominator without comparable saved attributes", () => {
  for (const summary of [
    { ...replay, beatmapMd5: "b".repeat(32) },
    { ...replay, mods: 1 << 23 },
    { ...replay, performance: { ...performance, maxCombo: 1500 } },
  ]) {
    expect(replayBeatmapMaxCombo(entry, summary)).toBeUndefined();
  }
  expect(
    replayBeatmapMaxCombo(
      { ...entry, metadata: { ...metadata, attributes: undefined } },
      replay,
    ),
  ).toBeUndefined();
});
