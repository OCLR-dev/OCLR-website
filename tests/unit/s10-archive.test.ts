import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  archiveCounts,
  historicalArchiveSchema,
} from "../../src/lib/historical-archive";
import { historicalRulebook } from "../../src/lib/historical-rulebooks";
import s10 from "../../src/content/s10-rulebook.json";

const archive = historicalArchiveSchema.parse(
  JSON.parse(readFileSync("docs/imports/s10-archive.json", "utf8")),
);

describe("S10 historical source package", () => {
  it("has ten complete teams, authoritative UID picks and no invented coaches", () => {
    expect(archiveCounts(archive)).toEqual({
      teams: 10,
      players: 80,
      picks: 70,
      results: 30,
      incomplete: 6,
      pools: 5,
      maps: 97,
    });
    expect(archive.players.filter((p) => p.role === "captain")).toHaveLength(
      10,
    );
    expect(
      archive.players.some(
        (p) => p.role === "coach" || p.role === "free_agent",
      ),
    ).toBe(false);
    for (const team of archive.teams) {
      const roster = archive.players.filter((p) => p.teamId === team.id);
      expect(roster.map((p) => p.tier)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      for (const p of roster.filter((p) => p.tier !== 0)) {
        expect(
          archive.picks.find((pick) => pick.osuId === p.osuId),
        ).toMatchObject({ teamId: team.id, round: p.tier });
      }
    }
    expect(archive.teams.find((t) => t.id === "team-d")?.name).toBe(
      "感谢你的洗肾",
    );
    expect(archive.players.find((p) => p.osuId === 14912108)).toMatchObject({
      username: "koutya_",
      teamId: "team-d",
      tier: 1,
    });
    expect(
      archive.picks.filter((p) => p.round === 3).map((p) => p.teamId),
    ).toEqual(Array.from("abcdefghij", (letter) => `team-${letter}`));
  });
  it("keeps zero scores and reconciles each group's four matches per team", () => {
    expect(archive.matches.find((m) => m.label === "1")?.score).toEqual([0, 6]);
    expect(
      archive.matches.filter((m) => m.score === null).map((m) => m.label),
    ).toEqual(["28a", "28b", "28c", "28d", "30a", "30b"]);
    for (const s of archive.standings) {
      const results = archive.matches
        .filter(
          (m) =>
            m.stage === `Group ${s.group}` &&
            [m.teamA, m.teamB].includes(s.teamId),
        )
        .map((m) =>
          m.teamA === s.teamId ? m.score! : [...m.score!].reverse(),
        );
      expect(results).toHaveLength(4);
      expect([
        results.filter(([a, b]) => a > b).length,
        results.filter(([a, b]) => a < b).length,
        results.reduce((n, [a]) => n + a, 0),
        results.reduce((n, [, b]) => n + b, 0),
      ]).toEqual([s.wins, s.losses, s.mapsWon, s.mapsLost]);
    }
    expect(archive.matches.find((m) => m.label === "2")?.scheduledAt).toBe(
      "2025-03-14T21:00:00+08:00",
    );
    expect(archive.matches.find((m) => m.label === "30")).toMatchObject({
      scheduledAt: "2025-05-10T21:00:00+08:00",
      vodUrl: "https://b23.tv/S8iZ2WD",
    });
  });
  it("uses the independent GS1 table and preserves all five historical pools", () => {
    // Check the prepared data itself; schema parsing must not hide stale values.
    const prepared = JSON.parse(
      readFileSync("docs/imports/s10-archive.json", "utf8"),
    );
    expect(prepared.pools.map((p: { name: string }) => p.name)).toEqual([
      "Group Stage 1",
      "Group Stage 2",
      "Semifinals",
      "Finals",
      "Grand Finals",
    ]);
    expect(archive.pools.map((p) => [p.id, p.maps.length])).toEqual([
      ["gs1", 19],
      ["gs2", 19],
      ["sf", 19],
      ["f", 20],
      ["gf", 20],
    ]);
    const gs1 = archive.pools[0];
    expect(gs1.maps.find((m) => m.slot === "NM2")).toMatchObject({
      beatmapId: 4914171,
      stars: 6.29,
    });
    expect(gs1.maps.find((m) => m.slot === "DT1")).toMatchObject({
      beatmapId: 3280087,
      cs: 4.5,
      ar: 10.06666667,
    });
    expect(gs1.maps.find((m) => m.slot === "TB1")).toMatchObject({
      beatmapId: 4754948,
      cs: 3.7,
    });
    expect(
      archive.pools.every((p) => p.maps.every((m) => m.beatmapId && m.title)),
    ).toBe(true);
    expect(archive.links.some((link) => /Registration/i.test(link.label))).toBe(
      false,
    );
    expect(archive.players.every((p) => p.source.startsWith("Team!"))).toBe(
      true,
    );
  });
});

describe("S10 original rulebook", () => {
  it("requires the matching workbook and document without leaking S9 rules", () => {
    expect(historicalRulebook(archive)).toBe(s10);
    expect(
      historicalRulebook({ ...archive, editionSlug: "private-copy" }),
    ).toBe(s10);
    expect(historicalRulebook({ ...archive, links: [] })).toBeNull();
    const s9 = historicalArchiveSchema.parse(
      JSON.parse(readFileSync("docs/imports/s9-archive.json", "utf8")),
    );
    expect(historicalRulebook({ ...archive, links: s9.links })).toBeNull();
    expect(historicalRulebook({ ...s9, links: archive.links })).toBeNull();
  });
  it("retains all seven original chapters, textual inconsistencies and both diagrams", async () => {
    const normalize = (s: string) =>
      s
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n");
    expect(s10.sections).toHaveLength(7);
    expect(s10.version).toBeNull(); // Source specifies no edition/date/version.
    expect(
      normalize(s10.sections.flatMap((s) => [s.heading, s.body]).join("\n")),
    ).toBe(normalize(readFileSync("docs/imports/s10-rulebook.txt", "utf8")));
    expect(s10.sections[1].body).toBe("1. 没有教练，别想了。");
    const figures = s10.sections.flatMap((s) => s.figures ?? []);
    expect(figures).toHaveLength(2);
    for (const section of s10.sections)
      for (const figure of section.figures ?? []) {
        expect(section.body).toContain(figure.after);
        const metadata = await sharp(`public${figure.src}`).metadata();
        expect(metadata.width).toBe(figure.width);
        expect(metadata.height).toBe(figure.height);
      }
  });
});
