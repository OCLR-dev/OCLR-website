import type { Appearance } from "./preferences";
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

/** A tournament placement, exact or banded (e.g. "3–4", "9–12"). */
export type TournamentFinish = {
  label: string;
  /** True when inferred from knockout series instead of an archived table. */
  derived: boolean;
};

export type CompetitionEditionRecord = {
  editionSlug: string;
  editionName: string;
  /** The edition's configured visual theme, when it has one. */
  defaultAppearance?: Appearance | null;
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
  /** Final tournament placement, exact or a banded tie/residual place. */
  finish: TournamentFinish | null;
  /** A listed team of this person won the edition's deciding knockout series. */
  champion: boolean;
  /** A listed team of this person lost the edition's deciding knockout series. */
  runnerUp: boolean;
  /** A listed team of this person finished third, alone or tied for 3–4. */
  thirdPlace: boolean;
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
  /** Seasons whose deciding series was won by a team this person was listed on. */
  championships: number;
  /** Seasons whose deciding series was lost by a team this person was listed on. */
  runnerUps: number;
  /** Seasons a listed team this person was on finished third. */
  thirdPlaces: number;
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

/** One decided series, reduced to the labels, time and teams a placement needs. */
export type SeriesResult = {
  /** Stage or round label, e.g. "Grand Finals", "GF", "总决赛". */
  label: string | null;
  at: string | null;
  winnerTeamId: string | null;
  loserTeamId: string | null;
  round?: {
    phase: "qualifier" | "group" | "swiss" | "knockout" | "final";
    index: number;
  };
};

/** The minimal shape needed to find the deciding series. */
export type DecisiveMatch = Pick<
  SeriesResult,
  "label" | "at" | "winnerTeamId" | "round"
>;

// A lower-bracket, consolation or early round is never the deciding series,
// even when its label contains "final" (lower bracket final, semifinal, ...).
const earlyRound =
  /semi|quarter|half|upper|lower|loser|consolation|third|3rd|季军|季軍|半决赛|半決賽|败者|敗者|胜者组|勝者組|四分之一|八分之一/i;
const grandFinal = /grand\s*final|\bgf\b|总决赛|總決賽|冠军赛|冠軍賽/i;
const finalRound = /finals?\b|决赛|決賽/i;

/** How strongly a label names the deciding series: 2 grand final, 1 final, 0 other. */
export function finalRoundRank(label: string | null | undefined) {
  const value = label?.trim();
  if (!value || earlyRound.test(value)) return 0;
  if (grandFinal.test(value)) return 2;
  return finalRound.test(value) ? 1 : 0;
}

/**
 * Derive the champion team from recorded series instead of a standings table.
 *
 * The deciding series is the latest dated final-like knockout match, which also
 * covers double-elimination bracket resets (two grand finals). Sources without
 * labels fall back to the latest dated knockout match; when several candidates
 * remain and cannot be ordered by date, the champion stays unknown rather than
 * guessed.
 */
function seriesTime(match: DecisiveMatch) {
  return match.at && !Number.isNaN(Date.parse(match.at))
    ? Date.parse(match.at)
    : null;
}

function knockoutSeries(match: Pick<SeriesResult, "label" | "round">) {
  const stage = competitionStage(match.label, match.round);
  return match.round ? stage === "knockout" : stage !== "group";
}

/** Latest final-like knockout series; null when the source cannot order them. */
export function decidingSeries<T extends DecisiveMatch>(
  matches: T[],
): T | null {
  const knockout = matches.filter(
    (match) => match.winnerTeamId && knockoutSeries(match),
  );
  if (!knockout.length) return null;
  const ranked = knockout
    .map((match) => ({
      match,
      rank: match.round
        ? match.round.phase === "final"
          ? 2
          : 0
        : finalRoundRank(match.label),
    }))
    .filter((entry) => entry.rank > 0);
  const best = ranked.length ? Math.max(...ranked.map((e) => e.rank)) : 0;
  const candidates = ranked.length
    ? ranked.filter((entry) => entry.rank === best).map((entry) => entry.match)
    : knockout;
  const dated = candidates.filter((match) => seriesTime(match) !== null);
  // A single candidate needs no ordering; several undated ones stay unknown.
  if (!dated.length) return candidates.length === 1 ? candidates[0] : null;
  const latest = Math.max(...dated.map((match) => seriesTime(match)!));
  const winners = new Set(
    dated
      .filter((match) => seriesTime(match) === latest)
      .map((m) => m.winnerTeamId),
  );
  return winners.size === 1
    ? (dated.find((match) => seriesTime(match) === latest) ?? null)
    : null;
}

export function championTeamId(matches: DecisiveMatch[]): string | null {
  return decidingSeries(matches)?.winnerTeamId ?? null;
}

export type TournamentPlacements = {
  champion: string | null;
  runnerUp: string | null;
  /** One team, or both 3–4 finishers when the edition played no placement series. */
  third: string[];
};

// A dedicated 3rd-place series names the position outright.
const thirdPlaceRound = /third|3rd|季军|季軍|三四名|3[-–—]4|三、四/i;

/**
 * Derive champion, runner-up and third place from recorded series.
 *
 * Third place follows a dedicated placement series when one exists. Otherwise it
 * comes from the last resolved knockout round before the deciding series: a
 * single series (a lower final) names one third place, while two semifinals mean
 * both losers finished 3–4 and count as third place.
 */
export function tournamentPlacements(
  matches: SeriesResult[],
): TournamentPlacements {
  const decided = matches.filter(
    (match) => match.winnerTeamId && match.loserTeamId && knockoutSeries(match),
  );
  const deciding = decidingSeries(decided);
  if (!deciding) return { champion: null, runnerUp: null, third: [] };
  const champion = deciding.winnerTeamId;
  const runnerUp = (deciding as SeriesResult).loserTeamId ?? null;
  const thirdMatches = decided.filter(
    (match) => thirdPlaceRound.test(match.label ?? "") && seriesTime(match),
  );
  if (thirdMatches.length) {
    const latest = Math.max(...thirdMatches.map((match) => seriesTime(match)!));
    return {
      champion,
      runnerUp,
      third: [
        ...new Set(
          thirdMatches
            .filter((match) => seriesTime(match) === latest)
            .map((match) => match.winnerTeamId!),
        ),
      ],
    };
  }
  const decidingAt = seriesTime(deciding);
  if (decidingAt === null) return { champion, runnerUp, third: [] };
  const earlier = decided.filter((match) => {
    const time = seriesTime(match);
    return time !== null && time < decidingAt;
  });
  if (!earlier.length) return { champion, runnerUp, third: [] };
  const lastRoundAt = Math.max(...earlier.map((match) => seriesTime(match)!));
  const round = earlier.filter((match) => seriesTime(match) === lastRoundAt);
  // More than two series on that date spans unrelated rounds, so claim nothing.
  if (round.length > 2) return { champion, runnerUp, third: [] };
  return {
    champion,
    runnerUp,
    third: [...new Set(round.map((match) => match.loserTeamId!))].filter(
      (team) => team !== champion && team !== runnerUp,
    ),
  };
}

/** A standings row as archived: group label, team and optional rank. */
export type StandingsRow = {
  group: string | null;
  teamId: string;
  rank: number | null;
  scope?: "group" | "final";
  placement?: { start: number; end: number };
  official?: boolean;
};

function placementBand(start: number, end: number) {
  return start === end ? String(start) : `${start}–${end}`;
}

function dayOf(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

/**
 * Final standings list every team once with an overall rank; group tables
 * restart ranks inside each group. A rank repeated across groups therefore
 * marks a group table, not a final placement.
 */
export function isFinalStandings(standings: StandingsRow[]): boolean {
  if (standings.some((row) => row.scope !== undefined))
    return standings.some((row) => row.scope === "final");
  const ranked = standings.filter((row) => row.rank !== null);
  if (!ranked.length) return false;
  const owner = new Map<number, string>();
  for (const row of ranked) {
    const group = row.group?.trim() ?? "";
    const known = owner.get(row.rank!);
    if (known !== undefined && known !== group) return false;
    if (known === undefined) owner.set(row.rank!, group);
  }
  return true;
}

/**
 * Read a team's final placement from an archived final standings table.
 * Structured bounds take precedence. Legacy ties become a band ("5–6") and
 * the unranked tail becomes its own band. Group tables return null.
 */
export function finalStandingsFinish(
  standings: StandingsRow[],
  teamIds: Iterable<string>,
  teamCount: number,
): TournamentFinish | null {
  if (!isFinalStandings(standings)) return null;
  const teams = new Set(teamIds);
  if (standings.some((row) => row.scope !== undefined)) {
    const row = standings.find(
      (row) => teams.has(row.teamId) && row.scope === "final",
    );
    const place = row?.placement;
    return place
      ? {
          label: placementBand(place.start, place.end),
          derived: row.official === false,
        }
      : row?.rank != null
        ? { label: String(row.rank), derived: row.official === false }
        : null;
  }
  const ranked = standings.filter((row) => row.rank !== null);
  const own =
    standings.find((row) => teams.has(row.teamId) && row.rank !== null) ??
    standings.find((row) => teams.has(row.teamId));
  if (!own) return null;
  if (own.rank !== null) {
    const tied = ranked.filter((row) => row.rank === own.rank).length;
    return {
      label: placementBand(own.rank, own.rank + tied - 1),
      derived: false,
    };
  }
  // Legacy unranked rows occupy the tail after every ranked position.
  // Never interpret an authored label as placement evidence.
  const counts = new Map<number, number>();
  for (const row of ranked)
    counts.set(row.rank!, (counts.get(row.rank!) ?? 0) + 1);
  let position = 1;
  for (const rank of [...counts.keys()].sort((a, b) => a - b)) {
    if (rank !== position) return null;
    position += counts.get(rank)!;
  }
  const total = Math.max(teamCount, standings.length);
  return position <= total
    ? { label: placementBand(position, total), derived: false }
    : null;
}

// Generic bracket wording cannot tell rounds apart; a date does.
const genericRound = /淘汰赛|季后赛|季後賽|playoff|knockout|bracket/i;
const namedRound =
  /final|semi|quarter|round|group|swiss|决赛|決賽|半决|半決|四分之一|轮|輪/i;

/**
 * Derive a full placement ladder from a single-elimination / double-elimination
 * bracket by grouping each team's last knockout loss into its elimination round.
 * Non-playoff teams take the tail band and the deciding-series winner takes
 * first place.
 *
 * Requires every decided knockout series to be dated, one deciding series (a
 * replayed double-elimination grand final would repeat the label) and enough
 * distinct rounds to leave exactly one champion. Anything irregular returns
 * null so the caller keeps the recorded table instead of inventing a ladder.
 */
export function knockoutFinishBands(
  matches: SeriesResult[],
  teams: string[],
): Map<string, TournamentFinish> | null {
  const decided = matches.filter(
    (match) => match.winnerTeamId && match.loserTeamId && knockoutSeries(match),
  );
  if (!decided.length) return null;
  if (decided.some((match) => seriesTime(match) === null)) return null;
  const deciding = decidingSeries(decided);
  if (!deciding?.winnerTeamId || !deciding.loserTeamId) return null;
  const identity = (match: SeriesResult) =>
    match.round
      ? `${match.round.phase}:${match.round.index}`
      : (match.label ?? "").trim();
  const decidingLabel = identity(deciding);
  if (
    decidingLabel &&
    decided.filter((match) => identity(match) === decidingLabel).length > 1
  )
    return null;
  const playoff = new Set<string>();
  const last = new Map<string, SeriesResult>();
  for (const match of [...decided].sort(
    (a, b) => seriesTime(a)! - seriesTime(b)!,
  )) {
    playoff.add(match.winnerTeamId!);
    playoff.add(match.loserTeamId!);
    last.set(match.winnerTeamId!, match);
    last.set(match.loserTeamId!, match);
  }
  const eliminated = [...last.entries()]
    .filter(([team, match]) => match.loserTeamId === team)
    .map(([team]) => team);
  if (eliminated.length + 1 !== playoff.size) return null;
  if (eliminated.includes(deciding.winnerTeamId)) return null;
  const rounds = new Map<string, { teams: string[]; at: number }>();
  for (const team of eliminated) {
    const match = last.get(team)!;
    const label = (match.label ?? "").trim();
    const key = match.round
      ? identity(match)
      : genericRound.test(label) && !namedRound.test(label)
        ? `${label}|${dayOf(match.at) ?? ""}`
        : label;
    const entry = rounds.get(key) ?? { teams: [], at: 0 };
    entry.teams.push(team);
    entry.at = Math.max(entry.at, seriesTime(match)!);
    rounds.set(key, entry);
  }
  const ordered = [...rounds.values()].sort((a, b) => a.at - b.at);
  const result = new Map<string, TournamentFinish>();
  const teamCount = teams.length;
  const playoffCount = playoff.size;
  let position = playoffCount;
  for (const round of ordered) {
    const size = round.teams.length;
    // The champion must remain above the worst elimination round.
    if (size > position - 1) return null;
    for (const team of round.teams)
      result.set(team, {
        label: placementBand(position - size + 1, position),
        derived: true,
      });
    position -= size;
  }
  if (position !== 1) return null;
  result.set(deciding.winnerTeamId, { label: "1", derived: true });
  const nonPlayoff = teams.filter((team) => !playoff.has(team));
  if (nonPlayoff.length) {
    const label = placementBand(playoffCount + 1, teamCount);
    for (const team of nonPlayoff) result.set(team, { label, derived: true });
  }
  return result;
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
    championships: 0,
    runnerUps: 0,
    thirdPlaces: 0,
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
    // A group-table rank is not a tournament placement, so the finish comes
    // from the derived podium instead.
    const finish = edition.champion
      ? 1
      : edition.runnerUp
        ? 2
        : edition.thirdPlace
          ? 3
          : null;
    if (finish !== null) {
      if (record.bestPlacing === null || finish < record.bestPlacing)
        record.bestPlacing = finish;
      if (record.worstPlacing === null || finish > record.worstPlacing)
        record.worstPlacing = finish;
    }
    if (edition.champion) record.championships += 1;
    if (edition.runnerUp) record.runnerUps += 1;
    if (edition.thirdPlace) record.thirdPlaces += 1;
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
