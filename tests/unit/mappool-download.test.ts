import { describe, expect, it } from "vitest";
import downloads from "../../src/data/archive-map-downloads.json";
import {
  downloadMirrorSchema,
  safeDownloadMirror,
} from "../../src/lib/mappool-download";
import { archivePoolMetadata } from "../../src/lib/archive-map-metadata";
import { statisticsArchive } from "../fixtures/archive-statistics";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";

describe("saved map download mirrors", () => {
  it("accepts credential-free HTTPS links and rejects unsafe schemes and malformed URLs", () => {
    expect(downloadMirrorSchema.parse(` ${downloads[0].downloadMirror} `)).toBe(
      downloads[0].downloadMirror,
    );
    for (const value of [
      undefined,
      "",
      "bad",
      "//github.com/map.osz",
      "http://github.com/map.osz",
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://user:secret@github.com/map.osz",
      "https://git\nhub.com/map.osz",
    ]) {
      expect(safeDownloadMirror(value)).toBeNull();
    }
  });
  it("enriches only the exact reviewed historical slots without changing saved records or authored mirrors", () => {
    for (const row of downloads) {
      const pool = {
        ...statisticsArchive.pools[0],
        id: row.poolId,
        maps: [
          {
            ...statisticsArchive.pools[0].maps[0],
            slot: row.slot,
            beatmapId: row.beatmapId,
          },
        ],
      };
      const saved = structuredClone(pool);
      expect(
        archivePoolMetadata(pool, row.editionSlug).pool.maps[0].downloadMirror,
      ).toBe(row.downloadMirror);
      expect(pool).toEqual(saved);
      for (const [season, id, slot, beatmapId] of [
        ["other", row.poolId, row.slot, row.beatmapId],
        [row.editionSlug, "other", row.slot, row.beatmapId],
        [row.editionSlug, row.poolId, "NM9", row.beatmapId],
        [row.editionSlug, row.poolId, row.slot, 42],
      ] as const) {
        expect(
          archivePoolMetadata(
            { ...pool, id, maps: [{ ...pool.maps[0], slot, beatmapId }] },
            season,
          ).pool.maps[0].downloadMirror,
        ).toBeUndefined();
      }
      const authored = "https://example.com/reviewed.osz";
      expect(
        archivePoolMetadata(
          { ...pool, maps: [{ ...pool.maps[0], downloadMirror: authored }] },
          row.editionSlug,
        ).pool.maps[0].downloadMirror,
      ).toBe(authored);
    }
  });
  it("preserves mirrors in the saved archive contract and rejects unsafe links", () => {
    const archive = structuredClone(statisticsArchive);
    archive.pools[0].maps[0].downloadMirror = downloads[0].downloadMirror;
    expect(
      historicalArchiveSchema.parse(archive).pools[0].maps[0].downloadMirror,
    ).toBe(downloads[0].downloadMirror);
    archive.pools[0].maps[0].downloadMirror = "javascript:alert(1)";
    expect(historicalArchiveSchema.safeParse(archive).success).toBe(false);
  });
});
