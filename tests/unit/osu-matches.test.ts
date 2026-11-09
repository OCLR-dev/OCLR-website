import { beforeEach, describe, expect, it, vi } from "vitest";
import { osuApi } from "../../src/lib/osu-api";
import { fetchMatchSource, parseMatchId } from "../../src/lib/osu-matches";
import { compareMatchSources } from "../../src/lib/match-source";
import { HttpError } from "../../src/lib/http";
import {
  syntheticApiGame,
  syntheticEvent,
  syntheticMatchId,
  syntheticPage,
} from "../fixtures/match";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
beforeEach(() => vi.mocked(osuApi).mockReset());
describe("official MP history normalization", () => {
  it("retains legacy and modern hit counts without replacing unavailable values with zero", async () => {
    const game = syntheticApiGame(1);
    const scores = game.scores.map((s, i) => ({
      ...s,
      statistics:
        i === 0
          ? { count_300: 90, count_100: 5, count_50: 1, count_miss: 0 }
          : i === 1
            ? { great: 90, ok: 5, meh: 1, miss: 3 }
            : i === 2
              ? { count_miss: 1, miss: 2 }
              : {},
    }));
    vi.mocked(osuApi).mockResolvedValue(
      syntheticPage([syntheticEvent(1, { ...game, scores })], {
        latest_event_id: 1,
      }),
    );
    const source = await fetchMatchSource(syntheticMatchId);
    expect(source.games[0].scores[0].hitCounts).toEqual({
      great: 90,
      ok: 5,
      meh: 1,
      miss: 0,
    });
    expect(source.games[0].scores[1].hitCounts?.miss).toBe(3);
    expect(source.games[0].scores[2].hitCounts?.miss).toBeNull();
    expect(source.games[0].scores[3].hitCounts?.great).toBeNull();
  });
  it("bounds a slow paginated provider without returning a falsely complete source", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    vi.mocked(osuApi).mockImplementation(async () => {
      clock.mockReturnValue(121_000);
      return syntheticPage([syntheticEvent(1)], { latest_event_id: 3 });
    });
    try {
      await expect(fetchMatchSource(syntheticMatchId)).rejects.toMatchObject({
        status: 503,
      });
    } finally {
      clock.mockRestore();
    }
  });
  it("accepts only IDs and canonical official match URLs", () => {
    for (const input of [
      "117427458",
      "https://osu.ppy.sh/community/matches/117427458",
    ])
      expect(parseMatchId(input)).toBe(117427458);
    for (const input of [
      "0",
      "-1",
      "1e2",
      "9007199254740993",
      "https://example.com/community/matches/1",
      "https://osu.ppy.sh.evil.example/community/matches/1",
      "https://osu.ppy.sh@evil.example/community/matches/1",
      "https://osu.ppy.sh/community/matches/1?url=https://example.com",
      "https://osu.ppy.sh/community/matches/1#score",
      "https://osu.ppy.sh/beatmaps/1",
      "file:///community/matches/1",
    ])
      expect(() => parseMatchId(input)).toThrow();
  });
  it("retrieves more than 100 events in ascending pages with stable provenance and minimal provider data", async () => {
    const events = Array.from({ length: 205 }, (_, i) =>
      syntheticEvent(
        i + 1,
        [100, 150, 205].includes(i + 1) ? syntheticApiGame(i + 1) : undefined,
      ),
    );
    vi.mocked(osuApi).mockImplementation(async (path) => {
      const after = Number(
        new URL(`https://osu.ppy.sh/api/v2${path}`).searchParams.get("after"),
      );
      return syntheticPage(events.filter((e) => e.id > after).slice(0, 100), {
        first_event_id: 1,
        latest_event_id: 205,
      });
    });
    const source = await fetchMatchSource(syntheticMatchId);
    expect(source.complete).toBe(true);
    expect(source.pages).toBe(3);
    expect(source.events).toHaveLength(205);
    expect(source.games.map((g) => g.id)).toEqual([100, 150, 205]);
    expect(vi.mocked(osuApi).mock.calls.map((c) => c[0])).toEqual([
      `/matches/${syntheticMatchId}?after=0&limit=100`,
      `/matches/${syntheticMatchId}?after=100&limit=100`,
      `/matches/${syntheticMatchId}?after=200&limit=100`,
    ]);
    expect(source.players).toEqual([
      { osuId: 1001, username: "Synthetic Provider" },
    ]);
    expect(JSON.stringify(source)).not.toMatch(
      /unrelated_profile|DO_NOT_PERSIST/,
    );
    expect((await fetchMatchSource(syntheticMatchId)).fingerprint).toBe(
      source.fingerprint,
    );
  });
  it("allows global event-ID gaps but bounds endless pagination without a falsely complete source", async () => {
    vi.mocked(osuApi).mockResolvedValueOnce(
      syntheticPage(
        [
          syntheticEvent(10, syntheticApiGame(1)),
          syntheticEvent(500, syntheticApiGame(2)),
        ],
        { first_event_id: 10, latest_event_id: 500 },
      ),
    );
    expect((await fetchMatchSource(syntheticMatchId)).complete).toBe(true);
    vi.mocked(osuApi).mockImplementation(async (path) => {
      const after = Number(
        new URL(`https://osu.ppy.sh/api/v2${path}`).searchParams.get("after"),
      );
      return syntheticPage([syntheticEvent(after + 1)], {
        first_event_id: 1,
        latest_event_id: 1000,
      });
    });
    const bounded = await fetchMatchSource(syntheticMatchId);
    expect(bounded.pages).toBe(100);
    expect(bounded.complete).toBe(false);
  });
  it("deduplicates overlapping events and repeated game records without duplicating scores", async () => {
    const game = syntheticApiGame(1);
    const events = [
      syntheticEvent(1, game),
      syntheticEvent(2, game),
      syntheticEvent(3),
    ];
    vi.mocked(osuApi)
      .mockResolvedValueOnce(
        syntheticPage(events.slice(0, 2), {
          first_event_id: 1,
          latest_event_id: 3,
        }),
      )
      .mockResolvedValueOnce(
        syntheticPage(events.slice(1), {
          first_event_id: 1,
          latest_event_id: 3,
        }),
      );
    const source = await fetchMatchSource(syntheticMatchId);
    expect(source.complete).toBe(true);
    expect(source.events).toHaveLength(3);
    expect(source.games).toHaveLength(1);
    expect(source.games[0].scores).toHaveLength(4);
  });
  it("supports legacy/current score fields and mod representations without guessing conflicting scores", async () => {
    const game = syntheticApiGame(1);
    const raw = game as unknown as { scores: Record<string, unknown>[] };
    raw.scores[0] = {
      user_id: 1001,
      score: 200,
      passed: true,
      mods: ["HD"],
      match: { team: "blue", slot: 0, pass: true },
    };
    raw.scores[1].mods = [{ acronym: "HD", settings: {} }];
    raw.scores[3].mods = [{ acronym: "DT", settings: { speed_change: 1.2 } }];
    raw.scores[2].total_score = 999;
    vi.mocked(osuApi).mockResolvedValue(
      syntheticPage([syntheticEvent(1, game)]),
    );
    const source = await fetchMatchSource(syntheticMatchId);
    expect(source.games[0].scores[0].total).toBe(200);
    expect(source.games[0].scores[0].mods).toEqual(["HD"]);
    expect(source.games[0].scores[1].mods).toEqual(["HD"]);
    expect(source.games[0].scores[2].total).toBeNull();
    expect(source.games[0].scores[3].problems.join(" ")).toContain("mod data");
    expect(source.games[0].scores[2].problems.join(" ")).toContain(
      "conflicting",
    );
  });
  it("marks truncated or changing histories incomplete and never fabricates omitted games", async () => {
    vi.mocked(osuApi)
      .mockResolvedValueOnce(
        syntheticPage([syntheticEvent(2, syntheticApiGame(1))], {
          first_event_id: 1,
          latest_event_id: 3,
        }),
      )
      .mockResolvedValueOnce(
        syntheticPage([], { first_event_id: 1, latest_event_id: 3 }),
      );
    const missing = await fetchMatchSource(syntheticMatchId);
    expect(missing.complete).toBe(false);
    expect(missing.games).toHaveLength(1);
    vi.mocked(osuApi)
      .mockResolvedValueOnce(
        syntheticPage([syntheticEvent(1)], {
          first_event_id: 1,
          latest_event_id: 2,
        }),
      )
      .mockResolvedValueOnce(
        syntheticPage([syntheticEvent(2)], {
          first_event_id: 1,
          latest_event_id: 3,
        }),
      );
    const changing = await fetchMatchSource(syntheticMatchId);
    expect(changing.complete).toBe(false);
    expect(changing.warnings.join(" ")).toContain("changed");
  });
  it("preserves incomplete games, missing metadata and upstream differences for explicit review", async () => {
    const game = syntheticApiGame(1);
    const raw = { ...game, end_time: null, beatmap: null };
    vi.mocked(osuApi).mockResolvedValueOnce(
      syntheticPage([syntheticEvent(1, raw)], { current_game_id: 1 }),
    );
    const before = await fetchMatchSource(syntheticMatchId);
    expect(before.games[0].endTime).toBeNull();
    expect(before.games[0].beatmap).toBeNull();
    vi.mocked(osuApi).mockResolvedValueOnce(
      syntheticPage([
        syntheticEvent(1, game),
        syntheticEvent(2, syntheticApiGame(2)),
      ]),
    );
    const after = await fetchMatchSource(syntheticMatchId);
    expect(compareMatchSources(before, after)).toEqual({
      added: [2],
      removed: [],
      changed: [1],
      historyChanged: true,
    });
  });
  it("rejects inconsistent bounds and does not reinterpret an unsupported standardized score as raw MP score", async () => {
    const game = syntheticApiGame(1);
    const scores = game.scores as unknown as Record<string, unknown>[];
    delete scores[0].legacy_total_score;
    scores[0].type = "solo_score";
    vi.mocked(osuApi).mockResolvedValueOnce(
      syntheticPage([syntheticEvent(1, game)]),
    );
    const source = await fetchMatchSource(syntheticMatchId);
    expect(source.games[0].scores[0].total).toBeNull();
    vi.mocked(osuApi).mockResolvedValueOnce(
      syntheticPage([syntheticEvent(1)], {
        first_event_id: 2,
        latest_event_id: 1,
      }),
    );
    await expect(fetchMatchSource(syntheticMatchId)).rejects.toMatchObject({
      status: 502,
    });
    vi.mocked(osuApi).mockResolvedValueOnce(
      syntheticPage([syntheticEvent(2)], {
        first_event_id: 1,
        latest_event_id: 1,
      }),
    );
    expect((await fetchMatchSource(syntheticMatchId)).complete).toBe(false);
  });
  it("fails safely on provider errors or mismatched records", async () => {
    vi.mocked(osuApi).mockRejectedValueOnce(
      new HttpError(429, "Synthetic rate limit"),
    );
    await expect(fetchMatchSource(syntheticMatchId)).rejects.toMatchObject({
      status: 429,
    });
    vi.mocked(osuApi).mockResolvedValueOnce(
      syntheticPage([], {
        match: {
          id: 1,
          name: "Wrong record",
          start_time: null,
          end_time: null,
        },
      }),
    );
    await expect(fetchMatchSource(syntheticMatchId)).rejects.toMatchObject({
      status: 502,
    });
    vi.mocked(osuApi).mockResolvedValueOnce({});
    await expect(fetchMatchSource(syntheticMatchId)).rejects.toMatchObject({
      status: 502,
    });
  });
});
