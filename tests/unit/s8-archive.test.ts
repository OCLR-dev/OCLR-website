import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  archiveCounts,
  historicalArchiveSchema,
} from "../../src/lib/historical-archive";
import { historicalRulebook } from "../../src/lib/historical-rulebooks";
import { archiveBracket } from "../../src/lib/archive-bracket";
import s8 from "../../src/content/s8-rulebook.json";

const archive = historicalArchiveSchema.parse(
  JSON.parse(readFileSync("docs/imports/s8-archive.json", "utf8")),
);

describe("S8 public competition package", () => {
  it("preserves 16 complete UID rosters, coaches and approved final draft allocations", () => {
    expect(archiveCounts(archive)).toEqual({
      teams: 16,
      players: 128,
      picks: 96,
      results: 38,
      incomplete: 0,
      pools: 4,
      maps: 76,
    });
    expect(archive.players.filter((p) => p.role === "captain")).toHaveLength(
      16,
    );
    expect(archive.players.filter((p) => p.role === "coach")).toHaveLength(16);
    expect(archive.players.filter((p) => p.role === "player")).toHaveLength(96);
    for (const team of archive.teams) {
      const roster = archive.players.filter((p) => p.teamId === team.id);
      expect(roster).toHaveLength(8);
      expect(
        roster.filter((p) => p.role !== "coach").map((p) => p.tier),
      ).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(roster.find((p) => p.role === "coach")?.tier).toBeNull();
    }
    // Source captain order, final Team Tier 1 allocation; no pre-trade timeline invented.
    expect(archive.picks[0]).toMatchObject({
      round: 1,
      pick: 1,
      teamId: "team-7175234",
      osuId: 3367476,
    });
    expect(archive.picks[16]).toMatchObject({
      round: 2,
      pick: 1,
      teamId: "team-13291701",
      osuId: 4721007,
    });
    expect(archive.players.find((p) => p.osuId === 1176704)).toMatchObject({
      username: "Lapis",
      tier: 0,
      role: "captain",
    });
    expect(archive.players.find((p) => p.osuId === 11042554)).toMatchObject({
      username: "nana7shi",
      tier: null,
      role: "coach",
    });
  });
  it("reconciles all 24 group fixtures without inventing numerical rankings", () => {
    expect(archive.standings).toHaveLength(16);
    for (const s of archive.standings) {
      expect(s.rank).toBeNull();
      const scores = archive.matches
        .filter(
          (m) =>
            m.stage === `Group ${s.group}` &&
            [m.teamA, m.teamB].includes(s.teamId),
        )
        .map((m) =>
          m.teamA === s.teamId ? m.score! : [...m.score!].reverse(),
        );
      expect(scores).toHaveLength(3);
      expect([
        scores.filter(([a, b]) => a > b).length,
        scores.filter(([a, b]) => a < b).length,
        scores.reduce((n, [a]) => n + a, 0),
        scores.reduce((n, [, b]) => n + b, 0),
      ]).toEqual([s.wins, s.losses, s.mapsWon, s.mapsLost]);
    }
    const invalid = structuredClone(archive);
    invalid.standings[0].rank = 0;
    expect(historicalArchiveSchema.safeParse(invalid).success).toBe(false);
    const bracket = archiveBracket(archive, (id) => `/matches/${id}`)!;
    expect(
      bracket.groups
        .filter((g) => g.layout === "grid")
        .map((g) => [g.label, g.rounds.flatMap((r) => r.matches).length]),
    ).toEqual([
      ["A", 6],
      ["B", 6],
      ["C", 6],
      ["D", 6],
    ]);
    expect(
      bracket.groups
        .find((g) => g.id === "match-path")!
        .rounds.flatMap((r) => r.matches),
    ).toHaveLength(14);
  });
  it("keeps actual 2023 dates, valid MP links and a missing malformed replay", () => {
    expect(archive.matches[0]).toMatchObject({
      scheduledAt: "2023-02-25T22:00:00+08:00",
      mpUrls: ["https://osu.ppy.sh/community/matches/107048152"],
      vodUrl: "https://www.bilibili.com/video/BV1Xb411Q7Vb/",
    });
    expect(archive.matches.at(-1)).toMatchObject({
      scheduledAt: "2023-04-09T20:00:00+08:00",
      score: [7, 5],
      mpUrls: ["https://osu.ppy.sh/community/matches/107866985"],
      vodUrl: null,
    });
    expect(archive.matches.find((m) => m.label === "18")).toMatchObject({
      vodUrl: null,
      mpUrls: ["https://osu.ppy.sh/community/matches/107330020"],
    });
    expect(archive.matches.filter((m) => m.vodUrl)).toHaveLength(35);
    expect(archive.matches[0]).toMatchObject({
      bansA: "DT4&HR2",
      bansB: "HD3&NM4",
    });
    expect(archive.matches[1].commentators).toBeNull();
  });
  it("keeps four historical pools and excludes unconfirmed identities and application sheets", () => {
    expect(archive.pools.map((p) => [p.id, p.maps.length])).toEqual([
      ["gs", 19],
      ["sf", 19],
      ["f", 19],
      ["gf", 19],
    ]);
    expect(archive.pools[0].maps[0]).toMatchObject({
      beatmapId: 3645338,
      stars: 5.8685,
      drainSeconds: 237,
    });
    expect(archive.pools[3].maps.at(-1)).toMatchObject({
      slot: "TB1",
      beatmapId: 4066358,
    });
    expect(archive.staff).toEqual([]);
    expect(archive.players.every((p) => p.source.startsWith("Team!"))).toBe(
      true,
    );
    expect(archive.players.some((p) => p.role === "free_agent")).toBe(false);
    expect(archive.links).toHaveLength(6);
    expect(
      archive.links.some((l) => /报名|QQ群|Registration/.test(l.label)),
    ).toBe(false);
    expect(JSON.stringify(archive)).not.toMatch(
      /Coach!|Reg List!|Park!|Chess Time!|Showmatch!/,
    );
  });
});

describe("S8 original rulebook", () => {
  it("binds source identities, including Google's account-index URL form", () => {
    expect(historicalRulebook(archive)).toBe(s8);
    expect(
      historicalRulebook({ ...archive, editionSlug: "preview-copy" }),
    ).toBe(s8);
    expect(
      historicalRulebook({
        ...archive,
        links: archive.links.map((l) => ({
          ...l,
          url: l.url.replace("/document/u/0/", "/document/"),
        })),
      }),
    ).toBe(s8);
    expect(historicalRulebook({ ...archive, links: [] })).toBeNull();
    const s10 = historicalArchiveSchema.parse(
      JSON.parse(readFileSync("docs/imports/s10-archive.json", "utf8")),
    );
    expect(historicalRulebook({ ...archive, links: s10.links })).toBeNull();
    expect(historicalRulebook({ ...s10, links: archive.links })).toBeNull();
  });
  it("retains seven chapters and the source's four images without rewriting S8 rules", async () => {
    const normalize = (s: string) =>
      s
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n");
    expect(s8.version).toBeNull();
    expect(s8.sections).toHaveLength(7);
    expect(
      normalize(
        [s8.title, ...s8.sections.flatMap((s) => [s.heading, s.body])].join(
          "\n",
        ),
      ),
    ).toBe(normalize(readFileSync("docs/imports/s8-rulebook.txt", "utf8")));
    expect(s8.sections[5].body).toContain("图池没有FM");
    expect(s8.sections[0].body).toContain("有BWS");
    expect(s8.sections[1].body).toContain("但在任何情况下都不得上场打图");
    const figures = [s8.cover, ...s8.sections.flatMap((s) => s.figures ?? [])];
    expect(figures).toHaveLength(4);
    for (const figure of figures) {
      const metadata = await sharp(`public${figure.src}`).metadata();
      expect(metadata.width).toBe(figure.width);
      expect(metadata.height).toBe(figure.height);
    }
    for (const section of s8.sections)
      for (const figure of section.figures ?? [])
        expect(section.body).toContain(figure.after);
  });
});
