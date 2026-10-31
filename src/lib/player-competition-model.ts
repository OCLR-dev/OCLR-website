import type { PublishedPlayer } from "./players";
import { compareTournamentSeasons } from "./tournament-order";

/**
 * Player competition DEMO model.
 *
 * Only published, confirmed results reach this model: the loaders read the
 * public tournament projection (approved results) or the public archive
 * projection (recorded matches). A team result is attributed to every listed
 * player of that team; bench appearances, per-map performance and private
 * applications never enter these totals.
 */

export type CompetitionOutcome = "win" | "loss" | "draw";
export type CompetitionStage = "group" | "knockout" | "unknown";

export type CompetitionMatchRecord = {
  outcome: CompetitionOutcome;
  stage: CompetitionStage;
  mapsWon: number | null;
  mapsLost: number | null;
  forfeit: boolean;
  at: string | null;
};

export type CompetitionEditionRecord = {
  editionSlug: string;
  editionName: string;
  /** Stored season value; editions open in ascending season order. */
  season: string | null;
  team: { id: string; name: string } | null;
  /** Teams this person coached in the edition, when the roster records a coach. */
  coachedTeams: { id: string; name: string }[];
  role: PublishedPlayer["role"] | null;
  sourceRole: PublishedPlayer["sourceRole"] | null;
  tier: number | null;
  captain: boolean;
  placing: number | null;
  placingRange?: PublishedPlayer["placingRange"];
  /** Recorded group-table position, when the edition archived a standings table. */
  groupRank: { group: string | null; rank: number } | null;
  matches: CompetitionMatchRecord[];
  /** The edition's public projection could not be read; counts stay empty. */
  unavailable: boolean;
};

export type PlayerCompetitionRecord = {
  seasons: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  /** Wins ÷ (wins + losses); null when no decided match is known. */
  winRate: number | null;
  group: { wins: number; losses: number };
  knockout: { wins: number; losses: number };
  mapsWon: number;
  mapsLost: number;
  forfeits: number;
  longestWinStreak: number;
  bestPlacing: number | null;
  worstPlacing: number | null;
  firstAt: string | null;
  lastAt: string | null;
  editions: CompetitionEditionRecord[];
};

/** Archive stage text is organizer-authored; only the documented group words map to group play. */
export function competitionStage(
  stage: string | null | undefined,
  round?: { phase: "qualifier" | "group" | "swiss" | "knockout" | "final" },
) {
  if (round) {
    if (round.phase === "group" || round.phase === "swiss")
      return "group" as const;
    if (round.phase === "qualifier") return "unknown" as const;
    return "knockout" as const;
  }
  if (!stage) return "unknown" as const;
  return /group|swiss|小组/i.test(stage)
    ? ("group" as const)
    : ("knockout" as const);
}

function timeOf(match: CompetitionMatchRecord) {
  return match.at ? Date.parse(match.at) : Number.NaN;
}

function chronological(a: CompetitionMatchRecord, b: CompetitionMatchRecord) {
  const left = timeOf(a),
    right = timeOf(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return 0;
  return left - right;
}

export function summarizePlayerCompetition(
  editions: CompetitionEditionRecord[],
): PlayerCompetitionRecord {
  const record: PlayerCompetitionRecord = {
    seasons: editions.length,
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: null,
    group: { wins: 0, losses: 0 },
    knockout: { wins: 0, losses: 0 },
    mapsWon: 0,
    mapsLost: 0,
    forfeits: 0,
    longestWinStreak: 0,
    bestPlacing: null,
    worstPlacing: null,
    firstAt: null,
    lastAt: null,
    // Newest tournament first: the stored season is the chronological marker
    // because archived editions may not retain a usable start timestamp.
    editions: [...editions].sort((a, b) =>
      compareTournamentSeasons(
        { season: a.season, slug: a.editionSlug },
        { season: b.season, slug: b.editionSlug },
      ),
    ),
  };
  const decided: CompetitionMatchRecord[] = [];
  for (const edition of editions) {
    for (const match of edition.matches) {
      decided.push(match);
      record.matches += 1;
      if (match.outcome === "win") record.wins += 1;
      if (match.outcome === "loss") record.losses += 1;
      if (match.outcome === "draw") record.draws += 1;
      if (match.stage === "group" && match.outcome !== "draw")
        record.group[match.outcome === "win" ? "wins" : "losses"] += 1;
      if (match.stage === "knockout" && match.outcome !== "draw")
        record.knockout[match.outcome === "win" ? "wins" : "losses"] += 1;
      if (match.mapsWon !== null) record.mapsWon += match.mapsWon;
      if (match.mapsLost !== null) record.mapsLost += match.mapsLost;
      if (match.forfeit) record.forfeits += 1;
      if (match.at) {
        if (!record.firstAt || match.at < record.firstAt)
          record.firstAt = match.at;
        if (!record.lastAt || match.at > record.lastAt)
          record.lastAt = match.at;
      }
    }
    if (edition.placing !== null) {
      if (record.bestPlacing === null || edition.placing < record.bestPlacing)
        record.bestPlacing = edition.placing;
      if (record.worstPlacing === null || edition.placing > record.worstPlacing)
        record.worstPlacing = edition.placing;
    }
  }
  const counted = record.wins + record.losses;
  record.winRate = counted ? record.wins / counted : null;
  let streak = 0;
  for (const match of decided.sort(chronological)) {
    streak = match.outcome === "win" ? streak + 1 : 0;
    if (streak > record.longestWinStreak) record.longestWinStreak = streak;
  }
  return record;
}
