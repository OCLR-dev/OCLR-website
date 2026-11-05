import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeOsuProfile,
  parseOsuProfile,
} from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { safeSavedOsuProfile } from "../../src/lib/read-api-contract";
describe("official osu! user profiles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("parses the organizer example, stable numeric IDs and explicit modes", () => {
    expect(parseOsuProfile("https://osu.ppy.sh/users/651307/osu")).toEqual({
      osuId: 651307,
      mode: "osu",
      canonicalUrl: "https://osu.ppy.sh/users/651307/osu",
    });
    for (const input of [
      "651307",
      "https://osu.ppy.sh/users/651307",
      "https://osu.ppy.sh/users/651307/",
    ])
      expect(parseOsuProfile(input).mode).toBe("osu");
    for (const mode of ["osu", "taiko", "fruits", "mania"])
      expect(
        parseOsuProfile(`https://osu.ppy.sh/users/651307/${mode}`).mode,
      ).toBe(mode);
    expect(parseOsuProfile("651307", "mania").mode).toBe("mania");
  });
  it.each([
    "0",
    "01",
    "-1",
    "+12",
    "1e3",
    "1.2",
    "9007199254740993",
    "NaN",
    "peppy",
    "",
    "http://osu.ppy.sh/users/1",
    "https://example.com/users/1",
    "https://osu.ppy.sh.evil/users/1",
    "https://user@osu.ppy.sh/users/1",
    "https://osu.ppy.sh:443/users/1",
    "https://osu.ppy.sh/users/1?mode=mania",
    "https://osu.ppy.sh/users/1#osu",
    "https://osu.ppy.sh/users/1/unknown",
    "https://osu.ppy.sh/users/01",
    "https://osu.ppy.sh/users/%31",
    "https://osu.ppy.sh/a/../users/1",
    "https://osu.ppy.sh/users/1/osu/extra",
  ])("rejects noncanonical or unsafe input %s", (input) =>
    expect(() => parseOsuProfile(input)).toThrow(),
  );
  it("rejects conflicting or unsupported modes", () => {
    expect(() => parseOsuProfile("1", "standard")).toThrow();
    expect(() =>
      parseOsuProfile("https://osu.ppy.sh/users/1/mania", "osu"),
    ).toThrow();
  });
  it("normalizes mode-specific public metadata and exact scores without collecting the complete user object", () => {
    const p = normalizeOsuProfile(
      profileResponse,
      260001,
      "osu",
      "2026-10-20T00:00:00Z",
    );
    expect(p).toMatchObject({
      username: "Synthetic Profile Player",
      ruleset: "osu",
      defaultRuleset: "mania",
      countryName: "Taiwan",
      lastSeenAt: null,
      fetchedAt: "2026-10-20T00:00:00Z",
      statistics: {
        pp: 1234.56,
        accuracy: 97.25,
        rankedScore: "9007199254740993",
        totalScore: "987654321",
        playTimeSeconds: 123456,
      },
    });
    expect(JSON.stringify(p)).not.toMatch(
      /PRIVATE_CONTACT|HISTORY|discord|account_history/,
    );
  });
  it("tolerates null, missing and malformed optional fields without inventing zero or losing numeric precision", () => {
    const p = normalizeOsuProfile(
      {
        id: 1,
        username: "Synthetic",
        country: null,
        statistics: {
          pp: null,
          total_score: 9007199254740992,
          ranked_score: "9007199254740995",
          play_count: "wrong",
          hit_accuracy: 101,
        },
      },
      1,
      "mania",
    );
    expect(p.statistics).toMatchObject({
      globalRank: null,
      pp: null,
      playCount: null,
      accuracy: null,
      totalScore: null,
      rankedScore: "9007199254740995",
      level: null,
    });
    expect(p.avatarUrl).toBeNull();
    expect(
      normalizeOsuProfile(
        { id: 1, username: "Synthetic", statistics: null },
        1,
        "osu",
      ).statistics.pp,
    ).toBeNull();
    const zero = normalizeOsuProfile(
      { id: 1, username: "Synthetic", statistics: { pp: 0, play_count: 0 } },
      1,
      "osu",
    );
    expect(zero.statistics.pp).toBe(0);
  });
  it("rejects mismatched identities/modes, malformed essential data and closed users", () => {
    for (const value of [
      { ...profileResponse, id: 2 },
      { ...profileResponse, username: "" },
      { ...profileResponse, statistics: { mode: "mania" } },
      {},
    ])
      expect(() => normalizeOsuProfile(value, 260001, "osu")).toThrow();
    expect(() =>
      normalizeOsuProfile(
        { ...profileResponse, is_deleted: true },
        260001,
        "osu",
      ),
    ).toThrow(/unavailable/);
    expect(() =>
      normalizeOsuProfile(
        { ...profileResponse, is_restricted: true },
        260001,
        "osu",
      ),
    ).toThrow(/unavailable/);
  });
  it("keeps the reported global rank percentage for tier colours", () => {
    const withPercent = {
      ...profileResponse,
      statistics: {
        ...profileResponse.statistics,
        global_rank: 44981,
        global_rank_percent: 0.014208208485188478,
      },
    };
    expect(
      normalizeOsuProfile(withPercent, 260001, "osu").statistics
        .globalRankPercent,
    ).toBeCloseTo(0.0142, 4);
    expect(
      normalizeOsuProfile(profileResponse, 260001, "osu").statistics
        .globalRankPercent,
    ).toBeNull();
    expect(
      normalizeOsuProfile(
        {
          ...profileResponse,
          statistics: {
            ...profileResponse.statistics,
            global_rank_percent: 3,
          },
        },
        260001,
        "osu",
      ).statistics.globalRankPercent,
    ).toBeNull();
  });

  it("keeps the requested ruleset's daily rank history and the dates of ranked days", () => {
    const p = normalizeOsuProfile(profileResponse, 260001, "osu");
    expect(p.rankHistory).toEqual({
      mode: "osu",
      data: [16200, 15500, 15000],
      dayOffsets: [-3, -1, 0],
    });
    expect(safeSavedOsuProfile(p, 260001, "osu")?.rankHistory).toEqual(
      p.rankHistory,
    );
    const legacy = {
      ...p,
      rankHistory: { mode: "osu", data: [16200, 15500, 15000] },
    };
    expect(safeSavedOsuProfile(legacy, 260001, "osu")?.rankHistory).toEqual(
      legacy.rankHistory,
    );
    expect(
      normalizeOsuProfile(profileResponse, 260001, "mania").rankHistory,
    ).toBeNull();
    expect(
      normalizeOsuProfile(
        { ...profileResponse, rank_history: { mode: "osu", data: "nope" } },
        260001,
        "osu",
      ).rankHistory,
    ).toBeNull();
    expect(
      normalizeOsuProfile(
        { ...profileResponse, rank_history: undefined },
        260001,
        "osu",
      ).rankHistory,
    ).toBeNull();
  });
  it("preserves leading and trailing unranked days without drawing them", () => {
    const p = normalizeOsuProfile(
      {
        ...profileResponse,
        rank_history: { mode: "osu", data: [null, 16200, 0, 15000, null] },
      },
      260001,
      "osu",
    );
    expect(p.rankHistory).toEqual({
      mode: "osu",
      data: [16200, 15000],
      dayOffsets: [-3, -1],
    });
    expect(
      normalizeOsuProfile(
        {
          ...profileResponse,
          rank_history: { mode: "osu", data: [null, null] },
        },
        260001,
        "osu",
      ).rankHistory,
    ).toBeNull();
  });
  it("limits remote images to approved HTTPS osu! image services", () => {
    const p = normalizeOsuProfile(
      {
        ...profileResponse,
        avatar_url: "https://evil.example/pixel",
        cover: { url: "javascript:alert(1)" },
      },
      260001,
      "osu",
    );
    expect(p.avatarUrl).toBeNull();
    expect(p.coverUrl).toBeNull();
  });
  it("extends only the fixed official user endpoint using the shared public-token transport", async () => {
    vi.resetModules();
    vi.stubEnv("OSU_CLIENT_ID", "123");
    vi.stubEnv("OSU_CLIENT_SECRET", "synthetic-test-secret");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "synthetic-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(profileResponse)));
    vi.stubGlobal("fetch", fetch);
    const { osuApi } = await import("../../src/lib/osu-api");
    for (const path of [
      "/users/1/osu?key=username",
      "/users/1/osu?key=id&url=evil",
      "/users/1/unknown",
      "/users/@someone/osu?key=id",
      "/users/1/osu/extra?key=id",
    ])
      await expect(osuApi(path)).rejects.toMatchObject({ status: 400 });
    await osuApi("/users/260001/osu?key=id");
    expect(fetch.mock.calls[1][0]).toBe(
      "https://osu.ppy.sh/api/v2/users/260001/osu?key=id",
    );
    expect((fetch.mock.calls[0][1].body as URLSearchParams).get("scope")).toBe(
      "public",
    );
    expect(fetch.mock.calls[1][1].redirect).toBe("error");
  });
});

describe("explicit username provider transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("encodes a current username in the fixed @ path, including a numeric name", async () => {
    vi.resetModules();
    vi.stubEnv("OSU_CLIENT_ID", "123");
    vi.stubEnv("OSU_CLIENT_SECRET", "synthetic-secret");
    const fetch = vi.fn().mockImplementation(async (url: string) =>
      Response.json(
        url.endsWith("/oauth/token")
          ? {
              access_token: "synthetic-token",
              token_type: "Bearer",
              expires_in: 3600,
            }
          : profileResponse,
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { osuApi } = await import("../../src/lib/osu-api");
    await osuApi("/users/@%5BSpace%20Name%5D/osu");
    await osuApi("/users/@12345/osu");
    expect(fetch.mock.calls.map((r) => r[0])).toEqual([
      "https://osu.ppy.sh/oauth/token",
      "https://osu.ppy.sh/api/v2/users/@%5BSpace%20Name%5D/osu",
      "https://osu.ppy.sh/api/v2/users/@12345/osu",
    ]);
    for (const path of [
      "/users/@name/osu?key=id",
      "/users/@name/../matches/1",
      "/users/@name/osu#fragment",
      "/users/@name/mania",
      "/users/@/osu",
    ])
      await expect(osuApi(path)).rejects.toMatchObject({ status: 400 });
  });
});
