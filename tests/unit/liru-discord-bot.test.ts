import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Fetch } from "../../src/discord-bot/api";
import {
  guildCommand,
  runCommand,
  type Command,
} from "../../src/discord-bot/commands";
import { interactionHandler } from "../../src/discord-bot/interactions";

const origin = "https://oclr.example";
const now = Date.parse("2026-11-25T08:00:00Z");
const date = "2026-11-26T09:00:00Z";
const version = "a".repeat(64);
const team = { id: "red", name: "Red" };
const player = {
  identity: { osuId: 42, username: "Old Name", currentUsername: "New Name" },
  participation: [],
  snapshot: {
    stale: true,
    profile: { fetchedAt: date, statistics: { globalRank: 1200, pp: 800 } },
  },
  privateApplication: "DO NOT DISPLAY",
};
const participation = {
  osuId: 42,
  username: "New Name",
  editionSlug: "s2",
  editionName: "Season 2",
  team,
  captain: true,
  participation: "historical",
  tier: 0,
  placing: null,
  placingRange: { start: 3, end: 4, official: true, tied: true },
  sourceReference: "Archive workbook",
};
const fixture = {
  id: "m1",
  label: "M1",
  roundName: "Finals",
  publishedAt: date,
  stage: "group",
  confirmed: true,
  scheduledAt: date,
  status: "scheduled",
  home: { team, label: "Red" },
  away: { team: { id: "blue", name: "Blue" }, label: "Blue" },
  result: null,
};
const ok = (data: unknown, pagination?: object) =>
  Response.json({
    data,
    meta: { apiVersion: "1", requestId: "local", pagination },
  });
const missing = () =>
  Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
const target = (request: Parameters<Fetch>[0]) => new URL(request as URL);
const run = (
  command: Command,
  request: Fetch,
  locale: "en" | "zh-Hant" = "en",
) => runCommand(command, { origin, now, locale, request });

describe("Liru public Discord queries", () => {
  it("resolves an alias, numeric ID, and official URL to the same public profile", async () => {
    const request = vi.fn<Fetch>(async (input, options) => {
      const url = target(input);
      expect(url.origin).toBe(origin);
      expect(new Headers(options?.headers).has("Authorization")).toBe(false);
      expect(options?.redirect).toBe("error");
      if (url.pathname.endsWith("/by-username")) {
        expect(url.searchParams.get("name")).toBe("Old Name");
        return ok({ osuId: 42, username: "Old Name" });
      }
      expect(url.pathname).toBe("/api/v1/players/42/oclr-profile");
      return ok(player);
    });
    const results = await Promise.all(
      ["Old Name", "42", "https://osu.ppy.sh/users/42/osu"].map((player) =>
        run({ name: "profile", player }, request),
      ),
    );
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0].message).toMatchObject({
      allowed_mentions: { parse: [] },
      embeds: [
        { title: "New Name", description: expect.stringContaining("1,200") },
      ],
    });
    expect(JSON.stringify(results[0])).not.toContain("privateApplication");
    expect(JSON.stringify(results[0])).not.toContain("DO NOT DISPLAY");
    expect(
      await run(
        { name: "profile", player: "https://other.example/users/42" },
        request,
      ),
    ).toMatchObject({
      outcome: "missing",
      message: { content: expect.stringContaining("osu! ID") },
    });
    expect(request).toHaveBeenCalledTimes(4);
    const unavailable = vi.fn<Fetch>(async () => missing());
    expect(
      await run({ name: "profile", player: "Shared name" }, unavailable),
    ).toMatchObject({ outcome: "missing" });
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it("uses published collection order across seasons and preserves released archival placements", async () => {
    const request = vi.fn<Fetch>(async (input) => {
      const url = target(input);
      if (url.pathname.endsWith("/participations")) {
        return ok([
          participation,
          {
            ...participation,
            editionSlug: "s10",
            editionName: "Season 10",
            placingRange: null,
          },
          {
            ...participation,
            editionSlug: "withdrawn",
            editionName: "Withdrawn season",
          },
        ]);
      }
      expect(url.pathname).toBe("/api/v1/tournaments");
      const first = url.searchParams.get("page") === "1";
      expect(url.searchParams.get("version")).toBe(first ? null : version);
      return ok([{ slug: first ? "s10" : "s2" }], {
        page: first ? 1 : 2,
        pageSize: 100,
        total: 101,
        totalPages: 2,
        nextPage: first ? 2 : null,
        collectionVersion: version,
      });
    });
    const result = await run({ name: "history", player: "42" }, request);
    expect(result.message).toMatchObject({
      embeds: [
        {
          fields: [
            {
              name: "Season 10",
              value: expect.stringContaining("Placement not recorded"),
            },
            {
              name: "Season 2",
              value: "Captain · Red · Tied placement 3–4 · Archive workbook",
            },
          ],
        },
      ],
    });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("shows only the selected team's published official results and reflects withdrawal", async () => {
    let withdrawn = false;
    const result = { homeWins: 4, awayWins: 2, updatedAt: date };
    const request = vi.fn<Fetch>(async (input) => {
      const url = target(input);
      if (url.pathname.endsWith("/participations")) {
        expect(url.searchParams.get("edition")).toBe("s2");
        return ok(
          withdrawn ? [] : [{ ...participation, participation: "captain" }],
        );
      }
      return ok({
        fixtures: [
          { ...fixture, result, status: "ended" },
          {
            ...fixture,
            result,
            status: "ended",
            publishedAt: "",
            label: "PRIVATE",
          },
          {
            ...fixture,
            result,
            status: "ended",
            stage: "exhibition",
            label: "EXHIBITION",
          },
          {
            ...fixture,
            result,
            status: "ended",
            home: fixture.away,
            label: "OTHER TEAM",
          },
          fixture,
        ],
      });
    });
    const command = { name: "history", player: "42", season: "s2" } as const;
    const history = await run(command, request);
    expect(history.message).toMatchObject({
      embeds: [
        {
          fields: [
            expect.any(Object),
            {
              name: "Recent team results",
              value:
                "[M1](https://oclr.example/tournaments/s2/matches/m1) · Red 4–2 Blue",
            },
          ],
        },
      ],
    });
    withdrawn = true;
    expect(await run(command, request)).toMatchObject({ outcome: "missing" });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("reads published archive scores and forfeits, excluding pending reviews", async () => {
    const match = {
      id: "archive-gf",
      label: "GF",
      teamA: "red",
      teamB: "blue",
      scheduledAt: date,
      score: [5, 2],
    };
    const request = vi.fn<Fetch>(async (input) => {
      const url = target(input);
      if (url.pathname.endsWith("/participations")) return ok([participation]);
      expect(url.pathname).toBe("/api/v1/tournaments/s2/configuration");
      return ok({
        edition: {
          slug: "s2",
          archive: {
            teams: [team, { id: "blue", name: "Blue" }],
            matches: [
              match,
              {
                ...match,
                id: "pending",
                label: "PRIVATE DRAFT",
                review: { status: "pending" },
              },
              {
                ...match,
                id: "forfeit",
                label: "F1",
                scheduledAt: null,
                score: null,
                forfeitWinner: 1,
              },
            ],
          },
        },
      });
    });
    const result = await run(
      { name: "history", player: "42", season: "s2" },
      request,
    );
    expect(result.message).toMatchObject({
      embeds: [
        {
          fields: [
            expect.any(Object),
            {
              name: "Recent team results",
              value:
                "[GF](https://oclr.example/tournaments/s2/matches/archive-gf) · Red 5–2 Blue\n[F1](https://oclr.example/tournaments/s2/matches/forfeit) · Red (Forfeit) · Blue (Winner)",
            },
          ],
        },
      ],
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("shows the registration state and only the next confirmed future match", async () => {
    const request = vi.fn<Fetch>(async (input) => {
      switch (target(input).pathname.split("/").at(-1)) {
        case "s11":
          return ok({
            slug: "s11",
            name: "Season 11",
            registration: {
              opensAt: date,
              closesAt: "2026-12-01T09:00:00Z",
              withdrawUntil: null,
              state: "paused",
            },
            rules: {},
            overview: { kind: "database" },
          });
        case "enrollment-state":
          return ok("paused");
        default:
          return ok({
            fixtures: [
              { ...fixture, confirmed: false, label: "UNCONFIRMED" },
              {
                ...fixture,
                scheduledAt: "2026-11-24T09:00:00Z",
                label: "PAST",
              },
              { ...fixture, scheduledAt: date, label: "Next Match" },
              {
                ...fixture,
                scheduledAt: "2026-11-27T09:00:00Z",
                label: "LATER",
              },
            ],
          });
      }
    });
    const response = await run(
      { name: "tournament", season: "s11" },
      request,
      "zh-Hant",
    );
    const json = JSON.stringify(response);
    expect(json).toContain("暫停報名");
    expect(json).toContain(`<t:${Date.parse(date) / 1000}:f>`);
    expect(json).toContain(
      "[Next Match](https://oclr.example/tournaments/s11/matches/m1)",
    );
    expect(json).not.toMatch(/UNCONFIRMED|PAST|LATER/);
    expect(
      await run({ name: "tournament", season: "s11" }, async () => missing()),
    ).toMatchObject({ outcome: "missing" });
  });

  it("distinguishes available, pending, empty, limited, malformed and timed out MRA reads", async () => {
    const command = { name: "mra", player: "42" } as const;
    for (const [data, text] of [
      [{ mra: 2.4371, state: "ready", calculatedAt: date }, "**2.44**"],
      [
        { mra: null, state: "pending", calculatedAt: null },
        "Snapshot update pending",
      ],
      [
        { mra: null, state: "ready", calculatedAt: date },
        "No public MRA is available",
      ],
    ] as const) {
      const result = await run(command, async (input) =>
        ok(target(input).pathname.endsWith("/mra") ? data : player),
      );
      expect(result.outcome).toBe("ok");
      expect(JSON.stringify(result.message)).toContain(text);
    }
    for (const [failure, outcome] of [
      [() => new Response(null, { status: 429 }), "limited"],
      [() => ok({ invalid: true }), "unavailable"],
      [
        () => {
          throw new DOMException("Local synthetic timeout", "TimeoutError");
        },
        "unavailable",
      ],
    ] as const) {
      const result = await run(command, async (input, options) => {
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        return target(input).pathname.endsWith("/oclr-profile")
          ? ok(player)
          : failure();
      });
      expect(result.outcome).toBe(outcome);
    }
    const request = vi.fn<Fetch>(async () => missing());
    expect((await run(command, request)).outcome).toBe("missing");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("Liru Discord interactions", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const settings = {
    applicationId: "123456789012345678",
    guildId: "123456789012345679",
    origin,
    publicKey: publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("hex"),
  };
  function signed(payload: object, time = now) {
    const timestamp = String(time / 1000);
    const body = Buffer.from(JSON.stringify(payload, null, 1));
    return {
      timestamp,
      body,
      signature: sign(
        null,
        Buffer.concat([Buffer.from(timestamp), body]),
        privateKey,
      ).toString("hex"),
    };
  }
  const invocation = {
    application_id: settings.applicationId,
    guild_id: settings.guildId,
    type: 2,
    locale: "zh-TW",
    token: "synthetic-token:example.token",
    member: { user: { id: "123456789012345680" } },
    data: {
      type: 1,
      name: "oclr",
      options: [
        {
          type: 1,
          name: "mra",
          options: [{ type: 3, name: "player", value: "42" }],
        },
      ],
    },
  };

  it("registers one localized guild command with four subcommands", () => {
    const command = guildCommand();
    expect(command.name).toBe("oclr");
    expect(command.options.map(({ name }) => name)).toEqual([
      "profile",
      "history",
      "tournament",
      "mra",
    ]);
    expect(command.description_localizations["zh-TW"]).toContain("莉露");
    expect(command.options[0].options.map((option) => option.required)).toEqual(
      [true, false],
    );
  });

  it("verifies the raw body, responds to PING, and rejects other guilds", async () => {
    const request = vi.fn<Fetch>();
    const handler = interactionHandler(settings, request, vi.fn(), () => now);
    const ping = signed({ type: 1 });
    expect(await handler(ping)).toEqual({ status: 200, body: { type: 1 } });
    expect(await handler({ ...ping, body: Buffer.from('{"type":1}') })).toEqual(
      { status: 401 },
    );
    expect(await handler(signed({ type: 1 }, now - 301_000))).toEqual({
      status: 401,
    });
    expect(
      await handler(
        signed({
          ...invocation,
          id: "123456789012345681",
          guild_id: "123456789012345682",
        }),
      ),
    ).toEqual({ status: 403 });
    expect(request).not.toHaveBeenCalled();
  });

  it("acknowledges publicly before reading, edits the original response, and keeps rate limits private", async () => {
    const request = vi.fn<Fetch>(async (input) => {
      const url = target(input);
      if (url.origin === "https://discord.com")
        return new Response(null, { status: 204 });
      return ok(
        url.pathname.endsWith("/oclr-profile")
          ? player
          : { mra: null, state: "pending", calculatedAt: null },
      );
    });
    const log = vi.fn();
    const handler = interactionHandler(settings, request, log, () => now);
    const payload = (id: number) =>
      signed({ ...invocation, id: `1234567890123456${id}` });
    const first = await handler(payload(81));
    expect(first.body).toEqual({ type: 5 });
    expect(request).not.toHaveBeenCalled();
    expect((await handler(payload(81))).finish).toBeUndefined();
    await first.finish?.();
    expect(String(request.mock.calls[2][0])).toBe(
      "https://discord.com/api/v10/webhooks/123456789012345678/synthetic-token%3Aexample.token/messages/@original",
    );
    expect(request.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String(request.mock.calls[2][1]?.body))).toMatchObject({
      embeds: [{ description: expect.stringContaining("資料更新中") }],
      allowed_mentions: { parse: [] },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("synthetic-token");
    for (let id = 82; id <= 86; id++)
      await (await handler(payload(id))).finish?.();
    const limited = await handler(payload(87));
    expect(limited.body).toMatchObject({
      type: 4,
      data: { flags: 64, content: expect.stringContaining("頻繁") },
    });
    expect(limited.finish).toBeUndefined();
  });
});
