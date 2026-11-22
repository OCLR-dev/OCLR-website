import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
const map = (id: number) => ({
  id,
  beatmapset_id: 42,
  version: "Synthetic Difficulty",
  difficulty_rating: 4.5,
  bpm: 180,
  total_length: 123,
  beatmapset: {
    title: `Synthetic Song ${id}`,
    artist: "Synthetic Artist",
    creator: "Synthetic Mapper",
  },
});
describe("bounded shared beatmap preview/Save cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  async function setup() {
    const { osuApi } = await import("../../src/lib/osu-api");
    vi.mocked(osuApi)
      .mockReset()
      .mockImplementation(async (path) => map(Number(path.split("/").at(-1))));
    const { fetchBeatmap } = await import("../../src/lib/osu-beatmaps");
    return { api: vi.mocked(osuApi), fetchBeatmap };
  }
  it("deduplicates requests, preserves actual fetch time and refreshes only after expiration", async () => {
    const { api, fetchBeatmap } = await setup();
    const [one, same] = await Promise.all([
      fetchBeatmap(123),
      fetchBeatmap(123),
    ]);
    expect(one).toEqual(same);
    await vi.advanceTimersByTimeAsync(59999);
    expect(await fetchBeatmap(123)).toEqual(one);
    expect(api).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    const updated = await fetchBeatmap(123);
    expect(updated.fetchedAt).not.toBe(one.fetchedAt);
    expect(updated.fingerprint).toBe(one.fingerprint);
    expect(api).toHaveBeenCalledTimes(2);
  });
  it("bounds cache size and simultaneous distinct requests while coalescing identical IDs", async () => {
    const { api, fetchBeatmap } = await setup();
    for (let id = 1; id <= 201; id++) await fetchBeatmap(id);
    await fetchBeatmap(201);
    expect(api).toHaveBeenCalledTimes(201);
    await fetchBeatmap(1);
    expect(api).toHaveBeenCalledTimes(202);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.mockImplementation(async (path) => {
      await wait;
      return map(Number(path.split("/").at(-1)));
    });
    const pending = Array.from({ length: 6 }, (_, i) => fetchBeatmap(300 + i));
    const duplicate = fetchBeatmap(300);
    await expect(fetchBeatmap(400)).rejects.toMatchObject({ status: 429 });
    release();
    expect(await duplicate).toEqual((await Promise.all(pending))[0]);
    expect(api).toHaveBeenCalledTimes(208);
  });
  it("cools down failures without returning expired metadata as verified data, then safely recovers", async () => {
    const { api, fetchBeatmap } = await setup();
    const good = await fetchBeatmap(123);
    await vi.advanceTimersByTimeAsync(60001);
    const { HttpError } = await import("../../src/lib/http");
    api.mockRejectedValue(new HttpError(429, "Rate limited"));
    await expect(fetchBeatmap(123)).rejects.toMatchObject({ status: 429 });
    await expect(fetchBeatmap(123)).rejects.toMatchObject({ status: 429 });
    expect(api).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60001);
    api.mockResolvedValue({ ...map(123), difficulty_rating: 5 });
    const refreshed = await fetchBeatmap(123);
    expect(refreshed.metadata.stars).toBe(5);
    expect(refreshed.fingerprint).not.toBe(good.fingerprint);
  });
  it("rejects invalid IDs and incomplete metadata without caching fabricated values", async () => {
    const { api, fetchBeatmap } = await setup();
    for (const id of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      await expect(fetchBeatmap(id)).rejects.toMatchObject({ status: 400 });
    expect(api).not.toHaveBeenCalled();
    for (const invalid of [
      { ...map(123), bpm: null },
      { ...map(123), beatmapset: { ...map(123).beatmapset, title: " " } },
      { ...map(123), beatmapset: null },
      { ...map(123), difficulty_rating: "4.5" },
      { ...map(123), id: 456 },
    ]) {
      api.mockResolvedValue(invalid);
      await expect(fetchBeatmap(123)).rejects.toMatchObject({ status: 502 });
      await vi.advanceTimersByTimeAsync(10001);
    }
    api.mockResolvedValue(map(123));
    expect((await fetchBeatmap(123)).metadata.title).toBe("Synthetic Song 123");
  });
});

describe("official batch lookup", () => {
  afterEach(() => vi.restoreAllMocks());
  it("deduplicates IDs, isolates malformed/missing rows and reuses verified single snapshots", async () => {
    vi.resetModules();
    const { osuApi } = await import("../../src/lib/osu-api");
    vi.mocked(osuApi)
      .mockReset()
      .mockResolvedValue({
        beatmaps: [
          {
            ...map(123),
            owners: [
              { id: 111, username: "Synthetic Guest One" },
              { id: 222, username: "Synthetic Guest Two" },
            ],
          },
          { ...map(456), owners: [] },
        ],
      });
    const { fetchBeatmaps, fetchBeatmap } =
      await import("../../src/lib/osu-beatmaps");
    const rows = await fetchBeatmaps([123, 456, 123, 789]);
    expect(rows.get(123)).toMatchObject({
      beatmapId: 123,
      metadata: { mapper: "Synthetic Guest One, Synthetic Guest Two" },
    });
    expect(rows.get(456)).toMatchObject({
      metadata: { mapper: map(456).beatmapset.creator },
    });
    expect(rows.get(789)).toMatchObject({ status: 502 });
    expect(osuApi).toHaveBeenCalledWith(
      "/beatmaps?ids[]=123&ids[]=456&ids[]=789",
    );
    await fetchBeatmap(123);
    expect(osuApi).toHaveBeenCalledTimes(1);
    await expect(
      fetchBeatmaps(Array.from({ length: 51 }, (_, i) => i + 1)),
    ).rejects.toMatchObject({ status: 400 });
  });
});
