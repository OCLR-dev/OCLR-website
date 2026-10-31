import { describe, expect, it } from "vitest";
import {
  competitionStage,
  summarizePlayerCompetition,
  type CompetitionEditionRecord,
  type CompetitionMatchRecord,
} from "../../src/lib/player-competition-model";

function match(
  outcome: CompetitionMatchRecord["outcome"],
  stage: CompetitionMatchRecord["stage"],
  mapsWon: number | null,
  mapsLost: number | null,
  at: string | null,
  forfeit = false,
): CompetitionMatchRecord {
  return { outcome, stage, mapsWon, mapsLost, forfeit, at };
}

function edition(
  slug: string,
  matches: CompetitionMatchRecord[],
  placing: number | null = null,
  unavailable = false,
): CompetitionEditionRecord {
  return {
    editionSlug: slug,
    editionName: slug.toUpperCase(),
    season: /\d+$/.exec(slug)?.[0] ?? null,
    team: { id: `${slug}-team`, name: `${slug} team` },
    coachedTeams: [],
    role: null,
    sourceRole: null,
    tier: null,
    captain: false,
    placing,
    groupRank: null,
    matches,
    unavailable,
  };
}

describe("archive stage classification", () => {
  it("reads documented group wording as group play and other published rounds as knockout", () => {
    expect(competitionStage("小组赛")).toBe("group");
    expect(competitionStage("Group Stage")).toBe("group");
    expect(competitionStage("Swiss Round 2")).toBe("group");
    expect(competitionStage("Finals")).toBe("knockout");
    expect(competitionStage("Semifinals")).toBe("knockout");
    expect(competitionStage(null)).toBe("unknown");
    expect(competitionStage("")).toBe("unknown");
  });
});

describe("player competition summary", () => {
  it("counts decided results, keeps group and knockout separate and totals recorded maps", () => {
    const result = summarizePlayerCompetition([
      edition("s1", [
        match("win", "group", 6, 2, "2024-01-05T00:00:00Z"),
        match("loss", "group", 3, 6, "2024-01-12T00:00:00Z"),
        match("win", "knockout", 7, 5, "2024-02-01T00:00:00Z"),
        match("draw", "group", 4, 4, "2024-02-08T00:00:00Z"),
      ]),
    ]);
    expect(result).toMatchObject({
      seasons: 1,
      matches: 4,
      wins: 2,
      losses: 1,
      draws: 1,
      group: { wins: 1, losses: 1 },
      knockout: { wins: 1, losses: 0 },
      mapsWon: 20,
      mapsLost: 17,
      winRate: 2 / 3,
    });
  });

  it("counts forfeits separately without inventing a decided result for unknown maps", () => {
    const result = summarizePlayerCompetition([
      edition("s1", [
        match("win", "knockout", null, null, "2024-02-01T00:00:00Z", true),
      ]),
    ]);
    expect(result).toMatchObject({ wins: 1, losses: 0, forfeits: 1 });
    expect(result.mapsWon).toBe(0);
    expect(result.mapsLost).toBe(0);
  });

  it("finds the longest win streak across seasons in date order", () => {
    const result = summarizePlayerCompetition([
      edition("s2", [
        match("win", "group", 6, 1, "2025-03-02T00:00:00Z"),
        match("win", "group", 6, 2, "2025-03-09T00:00:00Z"),
      ]),
      edition("s1", [
        match("win", "group", 6, 3, "2024-01-05T00:00:00Z"),
        match("win", "group", 6, 4, "2024-01-12T00:00:00Z"),
        match("win", "group", 6, 5, "2024-01-19T00:00:00Z"),
        match("loss", "knockout", 2, 6, "2024-02-01T00:00:00Z"),
        match("win", "knockout", 6, 0, "2024-02-08T00:00:00Z"),
      ]),
    ]);
    expect(result.longestWinStreak).toBe(3);
  });

  it("orders editions by stored season, newest first, and keeps unknown seasons last", () => {
    const result = summarizePlayerCompetition([
      edition("undated", [match("win", "group", 6, 0, null)]),
      edition("s10", []),
      edition("s2", [match("loss", "group", 1, 6, "2025-01-01T00:00:00Z")]),
      edition("s3", [match("win", "group", 6, 0, "2024-01-01T00:00:00Z")]),
    ]);
    expect(result.editions.map((e) => e.editionSlug)).toEqual([
      "s10",
      "s3",
      "s2",
      "undated",
    ]);
    expect(result.firstAt).toBe("2024-01-01T00:00:00Z");
    expect(result.lastAt).toBe("2025-01-01T00:00:00Z");
  });

  it("still orders a season without match dates by its stored season", () => {
    const result = summarizePlayerCompetition([
      edition("s5", [match("win", "group", 6, 0, null)]),
      edition("s4", [match("win", "group", 6, 0, "2020-06-06T00:00:00Z")]),
      edition("s7", [match("loss", "group", 1, 6, "2021-12-27T00:00:00Z")]),
    ]);
    expect(result.editions.map((e) => e.editionSlug)).toEqual([
      "s7",
      "s5",
      "s4",
    ]);
  });

  it("reports the best and worst recorded finish and leaves the rate unknown without decided matches", () => {
    const result = summarizePlayerCompetition([
      edition("s1", [match("draw", "group", 4, 4, "2024-01-01T00:00:00Z")], 5),
      edition("s2", [match("win", "group", 6, 4, "2025-01-01T00:00:00Z")], 1),
      edition("s3", [], 3),
      edition("s4", [], null, true),
    ]);
    expect(result).toMatchObject({
      seasons: 4,
      bestPlacing: 1,
      worstPlacing: 5,
      draws: 1,
      winRate: 1,
    });
    expect(
      result.editions.find((e) => e.editionSlug === "s4")?.unavailable,
    ).toBe(true);
    const empty = summarizePlayerCompetition([edition("s5", [])]);
    expect(empty.winRate).toBeNull();
    expect(empty.bestPlacing).toBeNull();
  });
});
