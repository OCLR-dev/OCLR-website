import { describe, expect, it } from "vitest";
import {
  championTeamId,
  competitionStage,
  finalRoundRank,
  finalStandingsFinish,
  isFinalStandings,
  knockoutFinishBands,
  summarizePlayerCompetition,
  tournamentPlacements,
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
  champion = false,
  runnerUp = false,
  thirdPlace = false,
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
    finish: null,
    champion,
    runnerUp,
    thirdPlace,
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

describe("champion derivation", () => {
  it("ranks deciding rounds above earlier and lower-bracket knockout rounds", () => {
    expect(finalRoundRank("Grand Finals")).toBe(2);
    expect(finalRoundRank("GF")).toBe(2);
    expect(finalRoundRank("总决赛")).toBe(2);
    expect(finalRoundRank("Finals")).toBe(1);
    expect(finalRoundRank("Semifinals")).toBe(0);
    expect(finalRoundRank("Lower Bracket Final")).toBe(0);
    expect(finalRoundRank("季军赛")).toBe(0);
    expect(finalRoundRank("小组赛")).toBe(0);
    expect(finalRoundRank(null)).toBe(0);
  });

  it("takes the later grand final of a double-elimination bracket reset", () => {
    expect(
      championTeamId([
        { label: "GF", at: "2025-05-03T12:00:00Z", winnerTeamId: "a" },
        { label: "SF", at: "2025-04-26T12:00:00Z", winnerTeamId: "c" },
        { label: "GF", at: "2025-05-10T12:00:00Z", winnerTeamId: "b" },
      ]),
    ).toBe("b");
  });

  it("prefers a labelled final over an earlier knockout round dated later", () => {
    // A consolation series may be scheduled after the final; it is not decisive.
    expect(
      championTeamId([
        { label: "Semifinals", at: "2025-05-10T12:00:00Z", winnerTeamId: "c" },
        { label: "Finals", at: "2025-05-09T12:00:00Z", winnerTeamId: "b" },
      ]),
    ).toBe("b");
  });

  it("falls back to the latest dated knockout series without a final label", () => {
    expect(
      championTeamId([
        { label: "淘汰赛", at: "2021-12-20T12:00:00Z", winnerTeamId: "a" },
        { label: "淘汰赛", at: "2021-12-27T12:00:00Z", winnerTeamId: "b" },
      ]),
    ).toBe("b");
  });

  it("leaves the champion unknown when undated candidates cannot be ordered", () => {
    expect(
      championTeamId([
        { label: "Finals", at: null, winnerTeamId: "a" },
        { label: "Finals", at: null, winnerTeamId: "b" },
      ]),
    ).toBeNull();
    expect(championTeamId([])).toBeNull();
  });

  it("ignores group play and undecided series", () => {
    expect(
      championTeamId([
        { label: "小组赛", at: "2025-05-10T12:00:00Z", winnerTeamId: "a" },
        { label: "Finals", at: "2025-05-11T12:00:00Z", winnerTeamId: null },
      ]),
    ).toBeNull();
  });
});

describe("tournament placements", () => {
  const series = (
    label: string,
    at: string | null,
    winnerTeamId: string | null,
    loserTeamId: string | null,
  ) => ({ label, at, winnerTeamId, loserTeamId });

  it("names the deciding series winner and loser, then the last eliminated team", () => {
    expect(
      tournamentPlacements([
        series("Semifinals", "2025-04-12T00:00:00Z", "a", "c"),
        series("Semifinals", "2025-04-12T00:00:00Z", "b", "d"),
        series("Lower Final", "2025-04-19T00:00:00Z", "b", "c"),
        series("Grand Final", "2025-05-10T00:00:00Z", "a", "b"),
      ]),
    ).toEqual({ champion: "a", runnerUp: "b", third: ["c"] });
  });

  it("counts both semifinal losers as third place when no placement series was played", () => {
    expect(
      tournamentPlacements([
        series("Semifinals", "2025-04-12T00:00:00Z", "a", "c"),
        series("Semifinals", "2025-04-12T00:00:00Z", "b", "d"),
        series("Final", "2025-05-10T00:00:00Z", "a", "b"),
      ]),
    ).toEqual({ champion: "a", runnerUp: "b", third: ["c", "d"] });
  });

  it("prefers a dedicated third-place series", () => {
    expect(
      tournamentPlacements([
        series("Semifinals", "2025-04-12T00:00:00Z", "a", "c"),
        series("Semifinals", "2025-04-12T00:00:00Z", "b", "d"),
        series("Third place", "2025-04-18T00:00:00Z", "d", "c"),
        series("Final", "2025-05-10T00:00:00Z", "a", "b"),
      ]),
    ).toEqual({ champion: "a", runnerUp: "b", third: ["d"] });
  });

  it("claims no third place when the deciding series has no date or the round is ambiguous", () => {
    expect(
      tournamentPlacements([
        series("Semifinals", "2025-04-12T00:00:00Z", "a", "c"),
        series("Final", null, "a", "b"),
      ]),
    ).toEqual({ champion: "a", runnerUp: "b", third: [] });
    expect(
      tournamentPlacements([
        series("Round 1", "2025-04-01T00:00:00Z", "a", "x"),
        series("Round 1", "2025-04-01T00:00:00Z", "b", "y"),
        series("Round 1", "2025-04-01T00:00:00Z", "c", "z"),
        series("Final", "2025-05-10T00:00:00Z", "a", "b"),
      ]),
    ).toEqual({ champion: "a", runnerUp: "b", third: [] });
  });

  it("ignores group play", () => {
    expect(
      tournamentPlacements([
        series("Group A", "2025-03-01T00:00:00Z", "a", "b"),
        series("Final", "2025-05-10T00:00:00Z", "a", "b"),
      ]),
    ).toEqual({ champion: "a", runnerUp: "b", third: [] });
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

  it("counts one championship per season whose deciding series the team won", () => {
    const result = summarizePlayerCompetition([
      edition(
        "s10",
        [match("win", "knockout", 7, 2, "2025-05-10T00:00:00Z")],
        1,
        false,
        true,
      ),
      edition("s9", [], 2),
      edition("s8", [], null, false, true),
    ]);
    expect(result.championships).toBe(2);
  });

  it("counts runner-up and third-place finishes separately", () => {
    const result = summarizePlayerCompetition([
      edition(
        "s10",
        [match("loss", "knockout", 2, 7, "2025-05-10T00:00:00Z")],
        null,
        false,
        false,
        true,
      ),
      edition("s9", [], null, false, false, true),
      edition("s8", [], null, false, false, false, true),
    ]);
    expect(result).toMatchObject({
      championships: 0,
      runnerUps: 2,
      thirdPlaces: 1,
    });
  });

  it("reports the best and worst podium finish and leaves the rate unknown without decided matches", () => {
    const result = summarizePlayerCompetition([
      edition("s1", [match("draw", "group", 4, 4, "2024-01-01T00:00:00Z")], 5),
      edition(
        "s2",
        [match("win", "group", 6, 4, "2025-01-01T00:00:00Z")],
        1,
        false,
        false,
        true,
      ),
      edition("s3", [], 3, false, false, false, true),
      edition("s4", [], null, true),
    ]);
    expect(result).toMatchObject({
      seasons: 4,
      bestPlacing: 2,
      worstPlacing: 3,
      draws: 1,
      winRate: 1,
    });
    expect(
      result.editions.find((e) => e.editionSlug === "s4")?.unavailable,
    ).toBe(true);
    const groupOnly = summarizePlayerCompetition([edition("s5", [], 1)]);
    expect(groupOnly.bestPlacing).toBeNull();
    const empty = summarizePlayerCompetition([edition("s6", [])]);
    expect(empty.winRate).toBeNull();
    expect(empty.bestPlacing).toBeNull();
  });
});

describe("final placement from an archived table", () => {
  const rankedGroup = "最終排名（全賽事戰績）";
  const residualGroup = "未晉級（第9–12名未細分）";
  const rows = [
    ["g", 1],
    ["i", 2],
    ["b", 3],
    ["e", 4],
    ["a", 5],
    ["c", 5],
    ["h", 7],
    ["j", 7],
  ].map(([teamId, rank]) => ({ group: rankedGroup, teamId, rank })) as {
    group: string;
    teamId: string;
    rank: number | null;
  }[];
  for (const teamId of ["d", "k", "l", "f"])
    rows.push({ group: residualGroup, teamId, rank: null });
  const teams = rows.map((row) => row.teamId);

  it("bands ties and the organizer's residual group", () => {
    expect(isFinalStandings(rows)).toBe(true);
    expect(finalStandingsFinish(rows, ["g"], 12)?.label).toBe("1");
    expect(finalStandingsFinish(rows, ["a"], 12)).toEqual({
      label: "5–6",
      derived: false,
    });
    expect(finalStandingsFinish(rows, ["h"], 12)?.label).toBe("7–8");
    expect(finalStandingsFinish(rows, ["f"], 12)?.label).toBe("9–12");
    expect(finalStandingsFinish(rows, teams, 12)?.derived).toBe(false);
  });

  it("does not read per-group ranks as final placements", () => {
    const groups = ["A", "B"].flatMap((group) =>
      [1, 2, 3, 4].map((rank) => ({
        group,
        teamId: `${group}${rank}`,
        rank,
      })),
    );
    expect(isFinalStandings(groups)).toBe(false);
    expect(
      finalStandingsFinish(groups, ["A1", "B1"], groups.length),
    ).toBeNull();
  });

  it("computes the unranked tail when no group label names the band", () => {
    const tail = [
      ...rows.filter((row) => row.rank !== null),
      ...["d", "k", "l", "f"].map((teamId) => ({
        group: null,
        teamId,
        rank: null,
      })),
    ];
    expect(finalStandingsFinish(tail, ["d"], 12)?.label).toBe("9–12");
  });
  it("uses explicit scope and bounds regardless of misleading authored labels", () => {
    const rows = [
      {
        group: "最終排名 第1名",
        teamId: "a",
        rank: 1,
        scope: "group" as const,
      },
      {
        group: "小组赛 第99–100名",
        teamId: "b",
        rank: null,
        scope: "final" as const,
        placement: { start: 5, end: 6 },
        official: false,
      },
    ];
    expect(finalStandingsFinish(rows, ["a"], 8)).toBeNull();
    expect(finalStandingsFinish(rows, ["b"], 8)).toEqual({
      label: "5–6",
      derived: true,
    });
    expect(isFinalStandings([rows[0]])).toBe(false);
    expect(
      finalStandingsFinish(
        rows.map((r) => ({ ...r, group: "arbitrary translation" })),
        ["b"],
        8,
      ),
    ).toEqual({ label: "5–6", derived: true });
  });
  it("ignores a fabricated interval in a legacy free-text label", () => {
    const misleading = rows.map((r) => ({
      ...r,
      group: r.rank === null ? "第1–2名" : r.group,
    }));
    expect(finalStandingsFinish(misleading, ["d"], 12)?.label).toBe("9–12");
  });
});

describe("derived knockout placement bands", () => {
  const ko = (
    label: string,
    at: string,
    winnerTeamId: string,
    loserTeamId: string,
  ) => ({ label, at, winnerTeamId, loserTeamId });

  it("groups a named elimination round by its label and fills the tail", () => {
    const teams = ["e", "b", "c", "i", "l", "k", "h", "d", "a", "f", "g", "j"];
    const series = [
      ko("胜者组半决赛", "2020-07-04T21:00:00+08:00", "e", "b"),
      ko("胜者组半决赛", "2020-07-05T22:30:00+08:00", "c", "k"),
      ko("败者组第一轮", "2020-07-04T21:30:00+08:00", "i", "d"),
      ko("败者组第一轮", "2020-07-04T15:00:00+08:00", "l", "h"),
      ko("胜者组决赛", "2020-07-11T21:30:00+08:00", "e", "c"),
      ko("败者组第二轮", "2020-07-11T22:00:00+08:00", "i", "k"),
      ko("败者组第二轮", "2020-07-11T22:00:00+08:00", "b", "l"),
      ko("败者组第三轮", "2020-07-12T21:00:00+08:00", "b", "i"),
      ko("败者组决赛", "2020-07-18T22:30:00+08:00", "b", "c"),
      ko("总决赛", "2020-07-19T21:00:00+08:00", "e", "b"),
    ];
    const bands = knockoutFinishBands(series, teams);
    expect(bands?.get("h")?.label).toBe("7–8");
    expect(bands?.get("d")?.label).toBe("7–8");
    expect(bands?.get("l")?.label).toBe("5–6");
    expect(bands?.get("k")?.label).toBe("5–6");
    expect(bands?.get("i")?.label).toBe("4");
    expect(bands?.get("c")?.label).toBe("3");
    expect(bands?.get("b")?.label).toBe("2");
    expect(bands?.get("e")?.label).toBe("1");
    expect(bands?.get("a")?.label).toBe("9–12");
    expect(bands?.get("e")?.derived).toBe(true);
  });

  it("splits generic knockout labels by day so separate rounds stay bands", () => {
    const teams = ["f", "h", "e", "c", "a", "g", "d", "b"];
    const series = [
      ko("淘汰赛", "2022-01-16T20:00:00+08:00", "a", "d"),
      ko("淘汰赛", "2022-01-16T20:00:00+08:00", "g", "b"),
      ko("淘汰赛", "2022-01-22T20:00:00+08:00", "e", "a"),
      ko("淘汰赛", "2022-01-22T22:00:00+08:00", "c", "g"),
      ko("淘汰赛", "2022-01-23T20:00:00+08:00", "e", "c"),
      ko("LF", "2022-02-05T20:00:00+08:00", "h", "e"),
      ko("GF", "2022-03-05T20:30:00+08:00", "f", "h"),
    ];
    const bands = knockoutFinishBands(series, teams);
    expect(bands?.get("d")?.label).toBe("7–8");
    expect(bands?.get("b")?.label).toBe("7–8");
    expect(bands?.get("a")?.label).toBe("5–6");
    expect(bands?.get("g")?.label).toBe("5–6");
    expect(bands?.get("c")?.label).toBe("4");
    expect(bands?.get("e")?.label).toBe("3");
    expect(bands?.get("h")?.label).toBe("2");
    expect(bands?.get("f")?.label).toBe("1");
  });

  it("refuses a replayed deciding final label", () => {
    const teams = ["h", "b", "f", "x"];
    const series = [
      ko("GF", "2023-12-09T21:40:00+08:00", "h", "f"),
      ko("GF", "2023-12-10T22:00:00+08:00", "h", "b"),
    ];
    expect(knockoutFinishBands(series, teams)).toBeNull();
  });
  it("uses typed rounds when pool-week labels repeat or translations mislead", () => {
    const series = [
      {
        ...ko("总决赛", "2024-01-01T20:00:00+08:00", "a", "d"),
        round: { phase: "knockout" as const, index: 1 },
      },
      {
        ...ko("总决赛", "2024-01-01T21:00:00+08:00", "b", "c"),
        round: { phase: "knockout" as const, index: 1 },
      },
      {
        ...ko("小组赛", "2024-01-02T20:00:00+08:00", "a", "b"),
        round: { phase: "final" as const, index: 1 },
      },
    ];
    const bands = knockoutFinishBands(series, ["a", "b", "c", "d"]);
    expect(bands?.get("a")).toEqual({ label: "1", derived: true });
    expect(bands?.get("b")?.label).toBe("2");
    expect(bands?.get("c")?.label).toBe("3–4");
    expect(bands?.get("d")?.label).toBe("3–4");
    expect(championTeamId(series)).toBe("a");
  });
});
