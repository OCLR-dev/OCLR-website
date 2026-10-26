import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { historicalArchive } from "./historical-archive";

/** Synthetic identities/results only; the source URL selects S1 presentation. */
export function syntheticS1Archive(slug = "synthetic-s1") {
  const ids = "abcdefghijkl".split("");
  const base = historicalArchive.matches[0];
  const matches = [];
  for (const [group, teams] of [
    ["A", "dlheic"],
    ["B", "ajkfgb"],
  ]) {
    let n = 0;
    for (let i = 0; i < teams.length; i++)
      for (let j = i + 1; j < teams.length; j++) {
        n++;
        matches.push({
          ...base,
          id: `gs-${group.toLowerCase()}${n}`,
          label: `${group}${n}`,
          stage: `小组赛 ${group}组`,
          teamA: teams[i],
          teamB: teams[j],
          scheduledAt: null,
          score: [4, 1],
          mpUrls: [],
          source: "Synthetic group match",
        });
      }
  }
  for (const [i, [id, teamA, teamB]] of [
    ["ws1", "c", "k"],
    ["ws2", "h", "f"],
    ["ls1", "b", "l"],
    ["ls2", "e", "a"],
    ["ls3", "b", "k"],
    ["ls4", "f", "e"],
    ["ws3", "c", "h"],
    ["ls5", "b", "f"],
    ["lf", "h", "b"],
    ["gf", "c", "h"],
  ].entries()) {
    matches.push({
      ...base,
      id: `es-${id}`,
      label: id,
      stage: i < 6 ? "淘汰赛第一轮" : "淘汰赛第二轮",
      teamA,
      teamB,
      scheduledAt: `2026-02-${String(i + 1).padStart(2, "0")}T20:00:00+08:00`,
      score: [6, 1],
      mpUrls: [],
      source: "Synthetic knockout match",
    });
  }
  const finalOrder = [
    "c",
    "h",
    "b",
    "f",
    "e",
    "k",
    "a",
    "l",
    "d",
    "g",
    "i",
    "j",
  ];
  return historicalArchiveSchema.parse({
    ...historicalArchive,
    formatVersion: 2,
    editionSlug: slug,
    sourceUrl:
      "https://docs.google.com/spreadsheets/d/10OvY6V2_nJpmv3LekQJZw6Eo5Hy1V-ggSoOQIxIdm6I",
    notes: [],
    links: [],
    picks: [],
    pools: [],
    staff: [],
    teams: ids.map((id) => ({
      id,
      name: `Synthetic ${id.toUpperCase()}`,
      source: "Synthetic",
    })),
    players: ids.map((teamId, i) => ({
      osuId: 92001 + i,
      username: `Synthetic captain ${i}`,
      teamId,
      role: "captain",
      tier: 0,
      source: "Synthetic",
    })),
    standings: finalOrder.map((teamId, i) => ({
      group: "最終排名（全賽事戰績）",
      teamId,
      rank: [1, 2, 3, 4, 5, 5, 7, 7, 9, 9, 9, 9][i],
      wins: 1,
      losses: 1,
      mapsWon: 6,
      mapsLost: 6,
      source: "Synthetic final ranks",
    })),
    matches,
    sourceFacts: [
      {
        category: "review",
        label: "Private source appendix",
        text: "Private synthetic S1 memo",
        source: "Synthetic",
      },
    ],
  });
}
