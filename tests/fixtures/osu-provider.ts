/** Test-process transport fixture only. Never imported by application code. */
import { syntheticApiGame, syntheticEvent, syntheticPage } from "./match";
import { profileResponse } from "./osu-profile";
import { assertTestDatabase } from "../database";
import { statisticsApiGames } from "./archive-statistics";
import { readFileSync } from "node:fs";
assertTestDatabase(process.env.TEST_DATABASE_URL);
if (
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
  !(
    process.env.APP_URL === "http://127.0.0.1:3100" ||
    (process.env.OCLR_REFEREE_PROVIDER_FILE &&
      process.env.APP_URL === "http://127.0.0.1:31475")
  ) ||
  process.env.OSU_CLIENT_SECRET !== "synthetic-browser-provider-secret"
)
  throw new Error("Provider fixtures require the isolated browser-test server");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://osu.ppy.sh") return originalFetch(input, init);
  // Private test-process input, never an application provider/host option.
  if (
    /^\/api\/v2\/matches\/99952[56]$/.test(url.pathname) &&
    process.env.OCLR_REFEREE_PROVIDER_FILE
  ) {
    const snapshots = JSON.parse(
      readFileSync(process.env.OCLR_REFEREE_PROVIDER_FILE, "utf8"),
    );
    const page = snapshots[url.pathname.split("/").at(-1)!];
    return page ? Response.json(page) : new Response(null, { status: 404 });
  }
  if (
    url.pathname === "/oauth/token" &&
    new URLSearchParams(String(init?.body)).get("grant_type") ===
      "client_credentials"
  )
    return Response.json({
      access_token: "synthetic-public-token",
      expires_in: 3600,
      token_type: "Bearer",
    });
  if (url.pathname === "/api/v2/matches/999133") {
    const ids = [1331000, 1331001, 1331010, 1331011];
    const events = [1, 2, 3].map((id) => {
      const game = syntheticApiGame(id);
      game.scores = game.scores.map((score, index) => ({
        ...score,
        user_id: ids[index],
      }));
      return syntheticEvent(id, game);
    });
    return Response.json(
      syntheticPage(events, {
        match: {
          id: 999133,
          name: "Synthetic historical lobby",
          start_time: "2020-01-01T00:00:00Z",
          end_time: "2020-01-01T23:59:00Z",
        },
      }),
    );
  }
  if (url.pathname === "/api/v2/matches/999177") {
    const after = Number(url.searchParams.get("after") ?? 0);
    return Response.json(
      syntheticPage(
        statisticsApiGames()
          .filter((g) => g.id > after)
          .map((g) => {
            if (g.id === 1)
              return syntheticEvent(g.id, {
                ...g,
                scores: [
                  ...g.scores,
                  {
                    ...g.scores[0],
                    user_id: 999999,
                    legacy_total_score: 0,
                    total_score: 0,
                    accuracy: 0,
                    max_combo: 0,
                    passed: false,
                    match: { team: "blue", slot: 4, pass: false },
                    statistics: {
                      count_miss: 100,
                    },
                  },
                ],
              });
            return syntheticEvent(g.id, g);
          }),
        {
          match: {
            id: 999177,
            name: "Synthetic statistics lobby",
            start_time: "2020-01-01T00:00:00Z",
            end_time: "2020-01-01T01:00:00Z",
          },
          first_event_id: 1,
          latest_event_id: 4,
        },
      ),
    );
  }
  if (url.pathname === "/api/v2/beatmaps") {
    const beatmaps = [];
    for (const id of new Set(url.searchParams.getAll("ids[]"))) {
      const response = await globalThis.fetch(
        `https://osu.ppy.sh/api/v2/beatmaps/${id}`,
      );
      if (response.ok) beatmaps.push(await response.json());
    }
    return Response.json({ beatmaps });
  }
  if (
    /^\/api\/v2\/beatmaps\/[1-9]\d*\/attributes$/.test(url.pathname) &&
    init?.method === "POST"
  )
    return Response.json({
      attributes: {
        star_rating: 6.75,
        max_combo: 1234,
        aim_difficulty: 3.21,
        approach_rate: 10.3,
      },
    });
  const match = /^\/api\/v2\/beatmaps\/([1-9]\d*)$/.exec(url.pathname);
  if (match) {
    const id = Number(match[1]);
    if (id === 999) return new Response(null, { status: 404 });
    if (id === 888) return new Response(null, { status: 429 });
    if (id === 777) return new Response(null, { status: 503 });
    if (id === 666) return Response.json({ id });
    if (id === 555)
      throw new DOMException("Synthetic provider timeout", "TimeoutError");
    if ([123, 456, 789, 101, 102, 3786810, 4914171].includes(id))
      return Response.json({
        id,
        beatmapset_id: id === 3786810 ? 1843515 : id === 4914171 ? 2299790 : 42,
        version: "Synthetic Difficulty",
        difficulty_rating: id === 123 ? 4.5 : 5.25,
        checksum: "a".repeat(32),
        bpm: 180,
        total_length: 123,
        mode: "osu",
        ar: 9.2,
        accuracy: 8.5,
        cs: 4,
        drain: 5,
        beatmapset: {
          artist: "Synthetic Artist",
          title:
            id === 123
              ? "Synthetic Browser Song"
              : id === 456
                ? "Synthetic Replacement Song"
                : `Synthetic Beatmap ${id}`,
          creator: "Synthetic Mapper",
        },
      });
    return new Response(null, { status: 404 });
  }
  const assistedName = /^\/api\/v2\/users\/@(.+)\/osu$/.exec(url.pathname);
  if (assistedName) {
    const name = decodeURIComponent(assistedName[1]).toLowerCase();
    const id =
      name === "[test player]" || name === "old test player"
        ? 983001
        : name === "12345"
          ? 983002
          : null;
    return id
      ? Response.json({
          ...profileResponse,
          id,
          username: id === 983001 ? "[Test Player]" : "12345",
          avatar_url: `https://a.ppy.sh/${id}`,
        })
      : new Response(null, { status: 404 });
  }
  const profile =
    /^\/api\/v2\/users\/([1-9]\d*)\/(osu|taiko|fruits|mania)$/.exec(
      url.pathname,
    );
  if (profile) {
    const id = Number(profile[1]);
    if ([981001, 981002, 981003, 982001, 982002, 982003].includes(id))
      return Response.json({
        ...profileResponse,
        id,
        username: `Synthetic Assisted ${id}`,
        avatar_url: `https://a.ppy.sh/${id}`,
      });
    if (id >= 983001 && id <= 983020)
      return Response.json({
        ...profileResponse,
        id,
        username:
          id === 983001
            ? "[Test Player]"
            : id === 983002
              ? "12345"
              : `Synthetic Batch ${id}`,
        avatar_url: `https://a.ppy.sh/${id}`,
      });
    // Preserve the default outage fixture; only 999 explicitly represents deletion.
    return new Response(null, { status: id === 999 ? 404 : 503 });
  }
  // Test-only public metadata transport; never authenticates or impersonates a player.
  return new Response(null, { status: 503 });
};
