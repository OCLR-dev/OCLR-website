import type { HistoricalArchive } from "../../src/lib/historical-archive";
import { statisticsArchive, statisticsSource } from "./archive-statistics";

export const archiveExchange = {
  firstOsuId: 91991,
  firstTeamId: "alpha",
  secondOsuId: 91992,
  secondTeamId: "beta",
  confirmationSource: "Synthetic organizer confirmation; date unknown",
};

export function exchangeArchive(slug = "s6"): HistoricalArchive {
  const a = structuredClone(statisticsArchive);
  a.editionSlug = slug;
  a.formatVersion = 2;
  a.draftMode = "final-tiers";
  a.picks = [];
  a.players.push(
    {
      osuId: 91991,
      username: "Synthetic Exchange Alpha",
      teamId: "alpha",
      role: "player",
      tier: 4,
      source: "Roster!J3",
    },
    {
      osuId: 91992,
      username: "Synthetic Exchange Beta",
      teamId: "beta",
      role: "player",
      tier: 4,
      source: "Roster!J7",
    },
  );
  a.sourceFacts = [
    {
      category: "review",
      label: "Original evidence",
      text: "Synthetic original roster evidence",
      source: "Roster!A1:J7",
    },
  ];
  return a;
}

export function exchangeSource() {
  const s = statisticsSource();
  for (const game of s.games.slice(0, 2)) {
    for (const [osuId, team] of [
      [91991, "blue"],
      [91992, "red"],
    ] as const) {
      game.scores.push({
        ...structuredClone(game.scores[0]),
        osuId,
        team,
        total: 0,
        accuracy: 0,
        combo: 0,
        passed: false,
        hitCounts: { great: null, ok: null, meh: null, miss: 100 },
      });
    }
  }
  // A formerly conflicting unselected game becomes attributable after exchange.
  s.games[2].beatmapId = 10001;
  s.games[2].scores[2].osuId = 91991;
  return s;
}

export const exchangeExclusions = [1, 2].flatMap((gameId) =>
  [91991, 91992].map((osuId) => ({ gameId, osuId })),
);
