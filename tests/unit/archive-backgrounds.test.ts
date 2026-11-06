import { describe, expect, it } from "vitest";
import backgrounds from "../../src/data/archive-background-supplements.json";
import { archivePoolMetadata } from "../../src/lib/archive-map-metadata";
import { beatmapCoverSources } from "../../src/lib/beatmap-artwork";
import { beatmapLinks } from "../../src/lib/beatmap-links";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { statisticsArchive } from "../fixtures/archive-statistics";

describe("background-only historical alternatives", () => {
  it("uses each exact reviewed target without changing identity, metrics, downloads or official actions", () => {
    for (const target of backgrounds) {
      const map = {
        ...statisticsArchive.pools[0].maps[0],
        beatmapId: target.beatmapId,
        slot: target.slot,
        originalId: 17,
        stars: 4,
        bpm: 123,
        drainSeconds: 120,
        cs: 0,
        ar: 8,
        od: 7,
        downloadMirror: "https://example.com/original.osz",
      };
      const pool = {
        ...statisticsArchive.pools[0],
        id: target.poolId,
        maps: [map],
      };
      const before = structuredClone(pool);
      const result = archivePoolMetadata(pool, target.editionSlug);
      expect(result.pool.maps[0]).toMatchObject({
        ...map,
        backgroundSetId: target.backgroundSetId,
      });
      expect(pool).toEqual(before);
      expect(result.setIds[target.beatmapId]).not.toBe(target.backgroundSetId);
      expect(
        beatmapLinks(
          result.pool.maps[0].beatmapId,
          result.setIds[target.beatmapId],
        ).web,
      ).toBe("https://osu.ppy.sh/beatmaps/" + target.beatmapId);
      for (const [slug, id, slot, bid] of [
        ["other", target.poolId, target.slot, target.beatmapId],
        [target.editionSlug, "other", target.slot, target.beatmapId],
        [target.editionSlug, target.poolId, "NM9", target.beatmapId],
        [target.editionSlug, target.poolId, target.slot, 42],
      ] as const) {
        expect(
          archivePoolMetadata(
            { ...pool, id, maps: [{ ...map, slot, beatmapId: bid }] },
            slug,
          ).pool.maps[0].backgroundSetId,
        ).toBeUndefined();
      }
      expect(
        archivePoolMetadata(
          { ...pool, maps: [{ ...map, backgroundSetId: 42 }] },
          target.editionSlug,
        ).pool.maps[0].backgroundSetId,
      ).toBe(42);
    }
    expect(backgrounds.some((b) => b.beatmapId === 776326)).toBe(false);
  });
  it("gives a recovered local cover priority, then the explicit background, with original artwork fallbacks", () => {
    expect(
      beatmapCoverSources({
        setId: 1,
        backgroundSetId: 2,
        fallbackSetId: 3,
        coverPath: "/archive/beatmaps/1/cover.jpg",
      }),
    ).toEqual([
      "/archive/beatmaps/1/cover.jpg",
      "https://assets.ppy.sh/beatmaps/2/covers/cover.jpg",
      "https://assets.ppy.sh/beatmaps/1/covers/cover.jpg",
      "https://assets.ppy.sh/beatmaps/3/covers/cover.jpg",
    ]);
    expect(
      beatmapCoverSources({ setId: 1, backgroundSetId: 1, fallbackSetId: -1 }),
    ).toEqual(["https://assets.ppy.sh/beatmaps/1/covers/cover.jpg"]);
  });
  it("roundtrips the optional saved field and rejects invalid set identities", () => {
    const archive = structuredClone(statisticsArchive);
    archive.pools[0].maps[0].backgroundSetId = 743685;
    expect(
      historicalArchiveSchema.parse(archive).pools[0].maps[0].backgroundSetId,
    ).toBe(743685);
    for (const value of [0, -1, 1.5, 2147483648, "743685"]) {
      const invalid = structuredClone(archive);
      Object.assign(invalid.pools[0].maps[0], { backgroundSetId: value });
      expect(historicalArchiveSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
