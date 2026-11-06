import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { archivePoolMetadata } from "../../src/lib/archive-map-metadata";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import files from "../../src/data/archive-file-supplements.json";

const source = historicalArchiveSchema.parse(
  JSON.parse(readFileSync("docs/imports/s6-confirmed-archive.json", "utf8")),
);
const entry = files.s6[0];
describe("S6 exact file recovery", () => {
  it("fills older saved maps from the exact file while retaining historical values and statistics identity", () => {
    const before = structuredClone(source);
    const pool = before.pools.find((p) => p.id === entry.poolId)!;
    const row = pool.maps.find((m) => m.slot === "NM3")!;
    delete row.beatmapSetId;
    delete row.coverPath;
    row.cs = row.ar = row.od = null;
    const saved = structuredClone(before);
    const key = statisticsArchiveKey(before);
    const display = archivePoolMetadata(pool, "s6");
    expect(display.pool.maps.find((m) => m.slot === "NM3")).toMatchObject({
      beatmapId: 2314568,
      beatmapSetId: 1034526,
      coverPath: entry.coverPath,
      title: row.title,
      mapper: "HeTo",
      stars: 6.35,
      bpm: 209,
      drainSeconds: 216,
      cs: 4,
      ar: 9.5,
      od: 9.1,
      archivalSource: entry.source,
    });
    expect(display.setIds[2314568]).toBe(1034526);
    expect(before).toEqual(saved);
    expect(statisticsArchiveKey(before)).toBe(key);
    row.cs = 0;
    row.ar = 8;
    row.od = 7;
    expect(
      archivePoolMetadata(pool, "s6").pool.maps.find((m) => m.slot === "NM3"),
    ).toMatchObject({ cs: 0, ar: 8, od: 7 });
    for (const [season, poolId, slot, bid] of [
      ["s5", entry.poolId, "NM3", 2314568],
      ["s6", "gs", "NM3", 2314568],
      ["s6", entry.poolId, "NM2", 2314568],
      ["s6", entry.poolId, "NM3", 42],
    ] as const) {
      const result = archivePoolMetadata(
        { ...pool, id: poolId, maps: [{ ...row, slot, beatmapId: bid }] },
        season,
      ).pool.maps[0];
      expect(result.coverPath).toBeUndefined();
      expect(result.beatmapSetId).toBeUndefined();
    }
  });
  it("accepts the saved local asset through the archive contract and rejects arbitrary URLs/traversal", () => {
    for (const path of [
      "https://example.com/cover.jpg",
      "//example.com/cover.jpg",
      "/archive/beatmaps/../cover.jpg",
      "/archive/beatmaps/2314568/cover.svg",
    ]) {
      const invalid = structuredClone(source);
      invalid.pools[0].maps[0].coverPath = path;
      expect(historicalArchiveSchema.safeParse(invalid).success).toBe(false);
    }
    expect(historicalArchiveSchema.parse(source)).toEqual(source);
  });
});

describe("S2 exact file recovery", () => {
  it("recovers the missing record without mutating saved input or another slot", () => {
    const entry = files.s2[0];
    const map = {
      slot: "NM2",
      beatmapId: 1009329,
      title: "#N/A",
      mapper: null,
      stars: null,
      bpm: null,
      drainSeconds: null,
      cs: null,
      ar: null,
      od: null,
      source: "captain's qualifier mappool!B5:H5",
    };
    const pool = {
      id: entry.poolId,
      name: "Qualifier",
      source: "source",
      maps: [map],
    };
    const before = structuredClone(pool);
    const display = archivePoolMetadata(pool, "s2");
    expect(display.pool.maps[0]).toMatchObject({
      ...entry.attributes,
      coverPath: entry.coverPath,
      beatmapSetId: 403096,
    });
    expect(display.setIds[1009329]).toBe(403096);
    expect(pool).toEqual(before);
    const preserved = { ...pool, maps: [{ ...map, stars: 6 }] };
    expect(archivePoolMetadata(preserved, "s2").pool.maps[0].stars).toBe(6);
    expect(
      archivePoolMetadata({ ...pool, id: "gs" }, "s2").pool.maps[0].coverPath,
    ).toBeUndefined();
  });
});
