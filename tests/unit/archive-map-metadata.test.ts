import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  archivePoolMetadata,
  missingArchiveText,
} from "../../src/lib/archive-map-metadata";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import snapshot from "../../src/data/archive-beatmaps.json";

function archive(season: string) {
  return historicalArchiveSchema.parse(
    JSON.parse(readFileSync(`docs/imports/${season}-archive.json`, "utf8")),
  );
}

describe("historical map metadata supplementation", () => {
  it("recognizes spreadsheet errors without treating literal titles as errors", () => {
    for (const value of [null, "#N/A", " N/A ", "#REF!", "#VALUE!"])
      expect(missingArchiveText(value)).toBe(true);
    for (const value of ["N/A - Song [Hard]", "Error", "0"])
      expect(missingArchiveText(value)).toBe(false);
  });
  it("repairs the S4 formula-error title using the exact difficulty ID without mutating sources", () => {
    const pool = archive("s4").pools[0];
    const original = structuredClone(pool);
    const result = archivePoolMetadata(pool, "s4");
    expect(pool).toEqual(original);
    const map = result.pool.maps[0];
    expect(map.beatmapId).toBe(2076750);
    expect(map.title).toContain("[Extra]");
    expect(map.title).not.toContain("#N/A");
    expect(map.supplemented).toContain("title");
    expect(map.metadataSource).toBe("https://osu.ppy.sh/beatmaps/2076750");
    expect(result.setIds[2076750]).toBe(993100);
  });
  it("preserves source statistics including zero and mod-adjusted historical values", () => {
    const pool = archive("s4").pools[0];
    pool.maps[0] = {
      ...pool.maps[0],
      title: "Original title",
      mapper: "Historical mapper",
      stars: 0,
      bpm: 288,
      drainSeconds: 130,
      ar: 10,
      cs: 6,
      od: 10,
    };
    const map = archivePoolMetadata(pool, "s4").pool.maps[0];
    expect(map).toMatchObject(pool.maps[0]);
    expect(map.supplemented).toBeUndefined();
  });
  it("does not substitute a different map or silently enrich other editions", () => {
    const pool = archive("s4").pools[0];
    pool.maps[0] = { ...pool.maps[0], beatmapId: 999999999 };
    expect(archivePoolMetadata(pool, "s4").pool.maps[0]).toMatchObject({
      title: null,
      stars: null,
    });
    const result = archivePoolMetadata(archive("s4").pools[0], "s7");
    expect(result.setIds).toEqual({});
    expect(result.pool.maps[0].supplemented).toBeUndefined();
  });
  it("covers every available S4–S6 slot and records any unavailable map explicitly", () => {
    expect(snapshot.pending).toEqual([]);
    const fields = [
      "title",
      "mapper",
      "stars",
      "bpm",
      "drainSeconds",
      "cs",
      "ar",
      "od",
    ] as const;
    for (const season of ["s4", "s5", "s6-confirmed"]) {
      const source = archive(season);
      for (const pool of source.pools) {
        const result = archivePoolMetadata(pool, source.editionSlug);
        for (const [index, map] of result.pool.maps.entries()) {
          expect(map.beatmapId).toBe(pool.maps[index].beatmapId);
          if ((snapshot.unavailable as number[]).includes(map.beatmapId!))
            continue;
          for (const field of fields)
            expect(
              map[field],
              `${season}/${pool.id}/${map.slot}/${field}`,
            ).not.toBeNull();
        }
      }
    }
  });
  it("keeps only finite official values and canonical provenance in the snapshot", () => {
    for (const [id, map] of Object.entries(snapshot.maps)) {
      expect(map.beatmapId).toBe(Number(id));
      expect(map.source).toBe(`https://osu.ppy.sh/beatmaps/${id}`);
      expect(Date.parse(map.fetchedAt)).not.toBeNaN();
      expect(map.setId).toBeGreaterThan(0);
      for (const key of [
        "stars",
        "bpm",
        "drainSeconds",
        "cs",
        "ar",
        "od",
      ] as const) {
        expect(Number.isFinite(map[key])).toBe(true);
        expect(map[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
