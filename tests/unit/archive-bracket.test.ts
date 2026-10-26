import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { archiveBracket } from "../../src/lib/archive-bracket";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { historicalArchive } from "../fixtures/historical-archive";
const href = (id: string) => `/private-preview?section=matches&id=${id}`;
describe("historical schedule bracket", () => {
  it("keeps an undated S2 final after earlier sheet rows without inventing predecessor edges", () => {
    const a = structuredClone(historicalArchive);
    a.sourceUrl =
      "https://docs.google.com/spreadsheets/d/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY";
    a.matches = [
      {
        ...a.matches[0],
        id: "es-a10",
        stage: "Synthetic final",
        scheduledAt: null,
        source: "ES Schedule!B18:M18",
      },
      {
        ...a.matches[0],
        id: "es-a3",
        stage: "Synthetic semifinal",
        source: "ES Schedule!B11:M11",
      },
      {
        ...a.matches[0],
        id: "es-a5",
        stage: "Synthetic lower round",
        scheduledAt: "2023-12-11T22:00:00+08:00",
        source: "ES Schedule!B13:M13",
      },
    ];
    const rounds = archiveBracket(a, href)!.groups[0].rounds;
    expect(rounds.flatMap((r) => r.matches.map((m) => m.id))).toEqual([
      "es-a3",
      "es-a5",
      "es-a10",
    ]);
    expect(
      rounds.at(-1)!.matches[0].slots.every((s) => s.sourceMatchId === null),
    ).toBe(true);
    a.sourceUrl += "-other";
    expect(
      archiveBracket(a, href)!.groups[0].rounds.flatMap((r) =>
        r.matches.map((m) => m.id),
      ),
    ).toEqual(["es-a3", "es-a10", "es-a5"]);
  });
  it("includes forfeits and preserves the winner without invented played scores", () => {
    const a = historicalArchiveSchema.parse({
      ...historicalArchive,
      matches: [
        {
          ...historicalArchive.matches[0],
          score: null,
          mpUrls: [],
          forfeitWinner: 1,
        },
      ],
    });
    const m = archiveBracket(a, href)!.groups[0].rounds[0].matches[0];
    expect(m).toMatchObject({
      status: "completed",
      winnerSlot: 1,
      scores: [null, null],
    });
  });
  it("includes only recorded matches and preserves private detail URLs", () => {
    const b = archiveBracket(historicalArchive, href)!;
    expect(
      b.groups.flatMap((g) => g.rounds.flatMap((r) => r.matches)),
    ).toMatchObject([
      { id: "one", scores: [6, 2], winnerSlot: 0, detailsUrl: href("one") },
    ]);
    expect(
      archiveBracket(
        {
          ...historicalArchive,
          matches: historicalArchive.matches.filter((m) => !m.score),
        },
        href,
      ),
    ).toBeNull();
  });
  it("connects previous appearances without declaring winner/loser progression", () => {
    const a = structuredClone(historicalArchive);
    a.matches.push({
      ...a.matches[0],
      id: "two",
      scheduledAt: "2023-12-11T22:00:00+08:00",
      score: [2, 6],
    });
    const b = archiveBracket(a, href)!;
    const rounds = b.groups[0].rounds;
    expect(rounds).toHaveLength(2);
    expect(rounds[1].matches[0].slots).toMatchObject([
      { teamId: "alpha", sourceMatchId: "one", kind: "team" },
      { teamId: "beta", sourceMatchId: "one", kind: "team" },
    ]);
    // Unknown dates do not imply an edge.
    a.matches[0].scheduledAt = null;
    expect(
      archiveBracket(a, href)!
        .groups.flatMap((g) => g.rounds.flatMap((r) => r.matches))
        .every((m) => m.slots.every((s) => s.sourceMatchId === null)),
    ).toBe(true);
  });
  it("does not choose among simultaneous source appearances", () => {
    const a = structuredClone(historicalArchive);
    a.matches.push(
      { ...a.matches[0], id: "simultaneous" },
      {
        ...a.matches[0],
        id: "later",
        scheduledAt: "2023-12-11T22:00:00+08:00",
      },
    );
    const later = archiveBracket(a, href)!
      .groups.flatMap((g) => g.rounds.flatMap((r) => r.matches))
      .find((m) => m.id === "later")!;
    expect(later.slots.every((s) => s.sourceMatchId === null)).toBe(true);
  });
  it("reconciles the S9 schedule, separates groups and omits six alternatives", () => {
    const a = historicalArchiveSchema.parse(
      JSON.parse(readFileSync("docs/imports/s9-archive.json", "utf8")),
    );
    const b = archiveBracket(a, href)!;
    expect(b.groups).toHaveLength(3);
    expect(b.groups[0].rounds).toHaveLength(5);
    const matches = b.groups.flatMap((g) => g.rounds.flatMap((r) => r.matches));
    expect(matches).toHaveLength(22);
    expect(new Set(matches.map((m) => m.id)).size).toBe(22);
    expect(matches.find((m) => m.id === "match-22")!.slots).toMatchObject([
      { teamId: "team-h", sourceMatchId: "match-17" },
      { teamId: "team-b", sourceMatchId: "match-21" },
    ]);
    const roundIndex = new Map(
      b.groups[0].rounds.flatMap((r, i) =>
        r.matches.map((m) => [m.id, i] as const),
      ),
    );
    for (const m of matches)
      for (const s of m.slots)
        if (s.sourceMatchId)
          expect(roundIndex.get(s.sourceMatchId)!).toBeLessThan(
            roundIndex.get(m.id)!,
          );
  });
});

it("sorts S8 group tabs by label without changing match-path order or group identity", () => {
  const a = historicalArchiveSchema.parse(
    JSON.parse(readFileSync("docs/imports/s8-archive.json", "utf8")),
  );
  const b = archiveBracket(a, href)!;
  expect(b.groups.map((g) => g.label)).toEqual([
    "Match path",
    "A",
    "B",
    "C",
    "D",
  ]);
  for (const g of b.groups.filter((g) => g.layout === "grid")) {
    expect(g.rounds.flatMap((r) => r.matches)).toHaveLength(6);
    for (const m of g.rounds[0].matches) {
      expect(
        a.standings.find((s) => s.teamId === m.slots[0].teamId)?.group,
      ).toBe(g.label);
    }
  }
  a.matches.reverse();
  expect(archiveBracket(a, href)).toEqual(b);
});

it("keeps the two S2 groups separate from overall final ranks and knockout paths", () => {
  for (const suffix of ["", "/edit"]) {
    const teamIds = ["alpha", "beta", "gamma", "delta"];
    const a = historicalArchiveSchema.parse({
      ...historicalArchive,
      editionSlug: "synthetic-renamed",
      sourceUrl:
        "https://docs.google.com/spreadsheets/d/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY" +
        suffix,
      teams: teamIds.map((id) => ({ id, name: id, source: "Synthetic" })),
      players: teamIds.map((teamId, i) => ({
        osuId: i + 1,
        username: "Synthetic captain " + teamId,
        teamId,
        role: "captain",
        tier: 0,
        source: "Synthetic",
      })),
      picks: [],
      standings: teamIds.map((teamId, i) => ({
        group: "Overall final ranks",
        teamId,
        rank: i + 1,
        wins: 1,
        losses: 1,
        mapsWon: 5,
        mapsLost: 5,
        source: "Synthetic",
      })),
      matches: [
        {
          ...historicalArchive.matches[0],
          id: "gs-a",
          stage: "小组赛 A组",
          scheduledAt: "2019-06-15T20:00:00+08:00",
        },
        {
          ...historicalArchive.matches[0],
          id: "gs-b",
          stage: "小组赛 B组",
          teamA: "gamma",
          teamB: "delta",
          mpUrls: [],
          scheduledAt: "2019-06-16T20:00:00+08:00",
        },
        {
          ...historicalArchive.matches[0],
          id: "knockout",
          stage: "胜者组半决赛",
          teamB: "gamma",
          mpUrls: [],
          scheduledAt: "2019-07-07T20:00:00+08:00",
        },
      ],
    });
    const bracket = archiveBracket(a, href)!;
    expect(bracket.groups.map((g) => g.label)).toEqual([
      "Match path",
      "小组赛 A组",
      "小组赛 B组",
    ]);
    expect(bracket.groups.map((g) => g.rounds[0].matches[0].id)).toEqual([
      "knockout",
      "gs-a",
      "gs-b",
    ]);
    expect(
      bracket.groups[0].rounds[0].matches[0].slots.every(
        (s) => s.sourceMatchId === null,
      ),
    ).toBe(true);
    expect(
      archiveBracket(
        { ...a, sourceUrl: "https://example.com/unknown" },
        href,
      )!.groups.every((g) => g.layout !== "grid"),
    ).toBe(true);
  }
});
