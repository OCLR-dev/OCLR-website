import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  projectPublicPools,
  snapshotSchema,
} from "../../src/lib/beatmap-similarity-model";
import { fileFeatures } from "../../scripts/beatmap-similarity-data";
import {
  compareBeatmaps,
  describePools,
} from "../../src/lib/beatmap-similarity-ranking";
import type { DifficultySnapshot } from "../../src/lib/mappool-model";
import { assertTestDatabase } from "../database";

const fetchedAt = "2026-11-21T00:00:00Z";
const checksum = "a".repeat(32);
const base = { stars: 6, bpm: 180, duration: 120, ar: 9, od: 9, cs: 4, hp: 5 };

function summary(edition: string, maps?: unknown[], published = true) {
  return {
    data: {
      revision: 1,
      edition: {
        slug: edition,
        published,
        archive: maps && { pools: [{ id: "final", name: "Final", maps }] },
      },
    },
  };
}

function archivedMap(
  beatmapId: number,
  slot: string,
  props?: Partial<typeof base>,
  setId?: number,
  version?: Partial<DifficultySnapshot>,
) {
  return {
    slot,
    beatmapId,
    beatmapSetId: setId,
    title: "Synthetic " + beatmapId,
    difficultySnapshot: {
      beatmapId,
      ruleset: "osu",
      checksum,
      fetchedAt,
      base: { ...base, ...props },
      variants: {},
      ...version,
    } satisfies DifficultySnapshot,
  };
}

it("uses public snapshots, derives DT from official attributes and excludes ambiguous, stale and unpublished rows", () => {
  const dt = {
    configuration: "DT",
    mods: ["DT"],
    ruleset: "osu",
    stars: 7,
    maxCombo: 200,
    values: { aim_difficulty: 3, speed_difficulty: 4 },
    fetchedAt,
  } as const;
  const map = archivedMap(20, "DT1", undefined, 2, {
    variants: { DT: { ...dt, mods: ["DT"] } },
  });
  const archived = projectPublicPools(
    "s9",
    summary("s9", [
      map,
      { ...map, slot: "FM1" },
      { ...map, slot: "TB1" },
      archivedMap(21, "DT2"),
      { ...map, slot: "DT3", beatmapId: 22 },
      { ...map, slot: "NM1", beatmapId: null },
    ]),
  );
  expect(archived.slots.map((slot) => slot.excluded)).toEqual([
    undefined,
    "unresolved-slot-mod",
    "unresolved-slot-mod",
    "missing-mod-attributes",
    "missing-snapshot",
    "missing-bid",
  ]);
  expect(archived.slots[0].values).toMatchObject({
    bpm: 270,
    duration: 80,
    stars: 7,
    aim: 3,
    speed: 4,
  });
  expect(archived.slots[0].values.ar).toBeGreaterThan(base.ar);
  expect(() => projectPublicPools("s9", summary("s9", [], false))).toThrow();

  const native = {
    id: "pool",
    name: "Pool",
    roundName: "Final",
    publishedAt: fetchedAt,
    entries: [
      {
        category: "DT",
        position: 1,
        beatmapId: 20,
        metadata: {
          setId: 2,
          title: "Synthetic",
          artist: "Test",
          difficulty: "Extra",
          mode: "osu",
          checksum: "b".repeat(32),
          difficultySnapshot: map.difficultySnapshot,
        },
      },
    ],
  };
  expect(
    projectPublicPools("s10", summary("s10"), { data: [native] }).slots[0]
      .excluded,
  ).toBe("unverified-version");
  expect(
    projectPublicPools("s10", summary("s10"), {
      data: [{ ...native, publishedAt: null }],
    }).slots,
  ).toEqual([]);
});

it("only uses matching public .osu bytes and reports clock-sensitive note density", () => {
  const times = Array.from({ length: 100 }, (_, i) => i * 600 + (i % 2) * 100);
  const bytes = Buffer.from(
    [
      "osu file format v14",
      "[General]",
      "Mode: 0",
      "[Metadata]",
      "BeatmapID:20",
      "BeatmapSetID:2",
      "[HitObjects]",
      ...times.map((time) => "256,192," + time + ",1,0,0:0:0:0:"),
    ].join("\r\n"),
  );
  const hash = createHash("md5").update(bytes).digest("hex");
  expect(fileFeatures(bytes, 20, checksum, 1)).toBeUndefined();
  expect(fileFeatures(bytes, 21, hash, 1)).toBeUndefined();
  const normal = fileFeatures(bytes, 20, hash, 1);
  const fast = fileFeatures(bytes, 20, hash, 1.5);
  expect(normal).toMatchObject({ setId: 2, rhythmChangeShare: 1 });
  expect(fast!.sustainedDensity).toBeGreaterThan(normal!.sustainedDensity!);
});

const s9 = projectPublicPools(
  "s9",
  summary("s9", [
    archivedMap(1, "NM1", {}, 1),
    archivedMap(2, "NM2", { duration: 240, ar: 10, cs: 6, hp: 8 }, 2),
    archivedMap(5, "NM3", {}, 5),
    archivedMap(6, "NM4", {}, 6, { base: { ...base, cs: null } }),
    archivedMap(8, "NM5", {}, 8, {
      checksum: "b".repeat(32),
      fetchedAt: "2026-11-19T00:00:00Z",
    }),
  ]),
);
const s10 = projectPublicPools(
  "s10",
  summary("s10", [
    archivedMap(1, "NM1", {}, 1),
    archivedMap(3, "NM2", { stars: 6.1, bpm: 182 }, 3),
    archivedMap(4, "NM3", { stars: 6.15, duration: 140, ar: 8, od: 8 }, 3),
    archivedMap(7, "NM4", { stars: 9 }, 7),
    archivedMap(8, "NM5", { stars: 9 }, 8),
  ]),
);
const snapshot = snapshotSchema.parse({
  version: 1,
  capturedAt: fetchedAt,
  sources: [s9.source, s10.source],
  slots: [...s9.slots, ...s10.slots],
});

it("keeps missing values visible in the round distribution", () => {
  const data = describePools(snapshot, "s9:final");
  expect(data.rounds[0]).toMatchObject({
    slots: 5,
    features: { cs: { n: 4, missing: 1, median: 4 } },
  });
  expect(data.coverage[0].categories[0].exclusions).toEqual({
    "incomplete-base": 1,
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("pgvector ordering", () => {
  let db: Client;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    assertTestDatabase(url);
    db = new Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => db?.end());

  it("uses one filtered candidate cohort for both orders and only one difficulty per set", async () => {
    const result = await compareBeatmaps(db, snapshot, {
      bid: 1,
      mod: "NM",
      profile: "base",
      repeat: 1,
      maxStars: 7,
    });
    expect(result.input.sources.map((source) => source.edition)).toEqual([
      "s10",
      "s9",
    ]);
    expect(result.candidateCount).toBe(4);
    expect(result.candidateGroups).toBe(3);
    expect(result.vector.map((row) => row.bid)).toEqual([5, 3, 2]);
    expect(result.baseline.map((row) => row.bid)).toEqual([2, 5, 4]);
    expect(result.vector[1].differences[0]).toMatchObject({
      feature: "bpm",
      delta: 2,
    });

    const targets = await compareBeatmaps(db, snapshot, {
      bid: 1,
      mod: "NM",
      profile: "base",
      repeat: 1,
      maxStars: 7,
      pool: "s9:final",
      candidateEdition: "s10",
    });
    expect(targets.vector.map((row) => row.bid)).toEqual([3]);
    expect(targets.baseline.map((row) => row.bid)).toEqual([4]);
  });
});
