import { beforeEach, describe, expect, it, vi } from "vitest";
import { beatmapCoverUrl } from "../../src/lib/beatmap-artwork";
const fetchBeatmaps = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/osu-beatmaps", () => ({ fetchBeatmaps }));
beforeEach(() => {
  vi.resetModules();
  fetchBeatmaps.mockReset();
});
describe("official archive artwork", () => {
  it("uses only valid set IDs and never substitutes difficulty IDs", () => {
    expect(beatmapCoverUrl(42)).toBe(
      "https://assets.ppy.sh/beatmaps/42/covers/cover.jpg",
    );
    for (const id of [null, undefined, 0, -1, 1.2, NaN])
      expect(beatmapCoverUrl(id)).toBeNull();
  });
  it("resolves independently, caches failures, shares work and preserves source records", async () => {
    const rows = new Map<number, Error | { metadata: { setId: number } }>([
      [3786810, { metadata: { setId: 1843515 } }],
      [4914171, new Error("missing")],
    ]);
    fetchBeatmaps.mockResolvedValue(rows);
    const { archiveArtworkSetIds } =
      await import("../../src/lib/archive-artwork");
    const ids = [3786810, 4914171, null, 3786810];
    const results = await Promise.all([
      archiveArtworkSetIds(ids),
      archiveArtworkSetIds(ids),
    ]);
    expect(results[0]).toEqual({ 3786810: 1843515, 4914171: null });
    expect(results[1]).toEqual(results[0]);
    await archiveArtworkSetIds(ids);
    expect(fetchBeatmaps).toHaveBeenCalledTimes(1);
    expect(ids).toEqual([3786810, 4914171, null, 3786810]);
  });
  it("bounds official API batches and tolerates provider failure", async () => {
    fetchBeatmaps.mockRejectedValue(new Error("offline"));
    const { archiveArtworkSetIds } =
      await import("../../src/lib/archive-artwork");
    const ids = Array.from({ length: 76 }, (_, i) => i + 1);
    const result = await archiveArtworkSetIds(ids);
    expect(Object.values(result).every((v) => v === null)).toBe(true);
    expect(fetchBeatmaps.mock.calls.map(([batch]) => batch.length)).toEqual([
      50, 26,
    ]);
  });
  it("distinguishes confirmed 404 from missing rows and transient failures, including cached results", async () => {
    const { HttpError } = await import("../../src/lib/http");
    fetchBeatmaps.mockResolvedValue(
      new Map([
        [11, new HttpError(404, "Missing")],
        [12, new HttpError(502, "Offline")],
        [13, new HttpError(429, "Busy")],
      ]),
    );
    const { archiveArtworkLookup } =
      await import("../../src/lib/archive-artwork");
    const first = await archiveArtworkLookup([11, 12, 13, 14]);
    expect(first.missingBeatmapIds).toEqual([11]);
    expect(await archiveArtworkLookup([11, 12, 13, 14])).toEqual(first);
    expect(fetchBeatmaps).toHaveBeenCalledTimes(1);
  });
  it("does not declare any edits missing during a provider outage", async () => {
    fetchBeatmaps.mockRejectedValue(new Error("Offline"));
    const { archiveArtworkLookup } =
      await import("../../src/lib/archive-artwork");
    expect((await archiveArtworkLookup([11])).missingBeatmapIds).toEqual([]);
  });
});
