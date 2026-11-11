import { afterEach, describe, expect, it, vi } from "vitest";
import { getDirectoryOtrRatings, getOtrRating } from "../../src/lib/otr-rating";

vi.mock("server-only", () => ({}));

const stats = {
  playerInfo: { id: 321, osuId: 1060 },
  ruleset: 0,
  rating: { ruleset: 0, rating: 1572.48 },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public o!TR player rating", () => {
  it("queries the exact osu! UID and ruleset and coalesces concurrent lookups", async () => {
    vi.stubEnv("OTR_API_KEY", "synthetic-key");
    const fetch = vi.fn(async () => Response.json(stats));
    vi.stubGlobal("fetch", fetch);

    const [first, second] = await Promise.all([
      getOtrRating(1060),
      getOtrRating(1060),
    ]);

    expect(first).toEqual({
      value: 1572.48,
      fetchedAt: expect.any(String),
      profileUrl: "https://otr.stagec.net/players/321?ruleset=0",
    });
    expect(second).toEqual(first);
    expect(await getOtrRating(1060)).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      new URL(
        "https://otr.stagec.net/api/players/1060/stats?keyType=osu&ruleset=0",
      ),
      expect.objectContaining({
        headers: { Authorization: "Bearer synthetic-key" },
        redirect: "error",
      }),
    );
  });

  it("rejects the wrong UID or ruleset and can retry after a provider failure", async () => {
    vi.stubEnv("OTR_API_KEY", "synthetic-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(stats))
        .mockResolvedValueOnce(
          Response.json({
            ...stats,
            playerInfo: { id: 321, osuId: 1061 },
            ruleset: 1,
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 429 }))
        .mockResolvedValueOnce(
          Response.json({ ...stats, playerInfo: { id: 321, osuId: 1061 } }),
        ),
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(getOtrRating(1061)).resolves.toBeNull();
    }
    await expect(getOtrRating(1061)).resolves.toMatchObject({ value: 1572.48 });
  });

  it("leaves a missing rating empty and skips lookups without a key", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        ...stats,
        playerInfo: { id: 321, osuId: 1062 },
        rating: null,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("OTR_API_KEY", "");
    await expect(getOtrRating(1062)).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("OTR_API_KEY", "synthetic-key");
    await expect(getOtrRating(1062)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shares profile ratings with the directory and deduplicates concurrent directory reads", async () => {
    vi.stubEnv("OTR_API_KEY", "synthetic-key");
    const fetch = vi.fn(async (url: URL) =>
      url.pathname === "/api/players/1063/stats"
        ? Response.json({
            ...stats,
            playerInfo: { id: 321, osuId: 1063 },
          })
        : new Response(null, { status: 404 }),
    );
    vi.stubGlobal("fetch", fetch);

    const rating = await getOtrRating(1063);
    const [first, second] = await Promise.all([
      getDirectoryOtrRatings([1063, 1064, 1063]),
      getDirectoryOtrRatings([1064, 1063]),
    ]);

    expect(first).toEqual({ 1063: rating?.value });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
