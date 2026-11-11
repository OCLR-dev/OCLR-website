import { archiveTeamPlacement } from "./archive-placement";
import { publicArchiveStatistics } from "./archive-statistics-reads";
import { getPublicEditions } from "./content";
import type { Edition } from "./editions";
import { archiveWinner, recordedArchiveMatch } from "./historical-archive";
import type { DirectoryArt } from "./osu-profiles";
import {
  careerTotals,
  emptyCareerTotals,
  type CareerEditionInput,
  type CareerSeries,
  type CareerTotals,
} from "./player-career-model";
import type { PlayerClass } from "./player-class";
import { tournamentPlacements } from "./player-competition-model";
import type {
  PlayerLeaderboard,
  PlayerLeaderboardRow,
} from "./player-leaderboard";
import type { MapPlay } from "./player-map-performance-model";
import { publicCompetition } from "./public-competition";
import { publishedTeams } from "./team-reads";

export type CareerLeaderboardRow = {
  osuId: number;
  username: string;
  pp: number | null;
  classification: PlayerClass | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  career: CareerTotals;
};

export type CareerLeaderboard = {
  players: CareerLeaderboardRow[];
  editions: number;
  unavailableEditions: string[];
  state: "ready" | "pending";
};

const emptyPodium = () => ({
  champion: null as string | null,
  runnerUp: null as string | null,
  third: [] as string[],
});

/** Add a player to one edition's roster without dropping repeated teams. */
function addMember(
  roster: Map<number, string[]>,
  osuId: number | null | undefined,
  teamId: string | null | undefined,
) {
  if (osuId === null || osuId === undefined || !teamId) return;
  const teams = roster.get(osuId);
  if (teams) {
    if (!teams.includes(teamId)) teams.push(teamId);
  } else {
    roster.set(osuId, [teamId]);
  }
}

/** Career inputs for an archived edition: its roster, series and placements. */
function archiveInput(edition: Edition): CareerEditionInput {
  const archive = edition.archive!;
  const roster = new Map<number, string[]>();
  for (const player of archive.players) {
    if (player.role === "captain" || player.role === "player")
      addMember(roster, player.osuId, player.teamId);
  }
  for (const replacement of archive.rosterReplacements ?? []) {
    for (const person of replacement.people)
      addMember(roster, person.osuId, replacement.teamId);
  }

  const series: CareerSeries[] = [];
  for (const match of archive.matches) {
    if (!recordedArchiveMatch(match)) continue;
    const winner = archiveWinner(match);
    series.push({
      teamA: match.teamA,
      teamB: match.teamB,
      label: match.stage,
      at:
        match.scheduledAt ??
        match.roomOpenedAt ??
        match.review?.startedAt ??
        null,
      winnerTeamId:
        winner === null ? null : winner === 0 ? match.teamA : match.teamB,
      loserTeamId:
        winner === null ? null : winner === 0 ? match.teamB : match.teamA,
    });
  }

  const derived = tournamentPlacements(series);
  const podium = emptyPodium();
  podium.champion = derived.champion;
  podium.runnerUp = derived.runnerUp;
  podium.third = derived.third;

  const ranges = archive.teams.flatMap((team) => {
    const range = archiveTeamPlacement(archive, team.id);
    return range ? [{ id: team.id, range }] : [];
  });
  if (ranges.length) {
    let champion = podium.champion;
    let runnerUp = podium.runnerUp;
    const third = new Set(podium.third);
    for (const { id, range } of ranges) {
      if (range.start === 1 && range.end === 1) champion = id;
      else if (range.start === 2 && range.end === 2) runnerUp = id;
      else if (
        range.start === 3 &&
        (range.end === 3 || (range.end === 4 && range.tied))
      )
        third.add(id);
    }
    podium.champion = champion;
    podium.runnerUp = runnerUp;
    podium.third = [...third];
  }

  return {
    editionSlug: edition.slug,
    roster,
    series,
    podium,
    plays: null,
  };
}

/** Career inputs for a live edition. Unpublished rosters stay empty. */
async function liveInput(edition: Edition): Promise<{
  input: CareerEditionInput;
  unavailable: boolean;
}> {
  let unavailable = false;
  const roster = new Map<number, string[]>();
  try {
    for (const team of await publishedTeams(edition.slug)) {
      for (const member of team.members ?? [])
        addMember(roster, member.osuId, team.id);
    }
  } catch {
    unavailable = true;
  }

  const series: CareerSeries[] = [];
  let podium = emptyPodium();
  try {
    const competition = await publicCompetition(edition.slug);
    const fixtures = competition?.fixtures ?? [];
    for (const fixture of fixtures) {
      const result = fixture.result;
      if (!result || fixture.stage === "exhibition") continue;
      series.push({
        teamA: fixture.home.team?.id ?? null,
        teamB: fixture.away.team?.id ?? null,
        label: `${fixture.stage} ${fixture.roundName}`.trim(),
        at: fixture.scheduledAt,
        winnerTeamId: result.draw ? null : result.winnerTeamId,
        loserTeamId: null,
      });
    }
    const placements = tournamentPlacements(
      fixtures.flatMap((fixture) => {
        if (
          fixture.stage === "exhibition" ||
          (!fixture.result && fixture.status === "cancelled")
        )
          return [];
        const winner =
          !fixture.result || fixture.result.draw
            ? null
            : fixture.result.winnerTeamId;
        const sides = [fixture.home.team?.id, fixture.away.team?.id];
        return [
          {
            label: `${fixture.stage} ${fixture.roundName}`.trim(),
            roundId: fixture.roundId,
            at: fixture.scheduledAt,
            winnerTeamId: winner ?? null,
            loserTeamId: winner
              ? (sides.find((team) => team && team !== winner) ?? null)
              : null,
          },
        ];
      }),
    );
    podium = {
      champion: placements.champion,
      runnerUp: placements.runnerUp,
      third: placements.third,
    };
  } catch {
    unavailable = true;
  }

  return {
    input: {
      editionSlug: edition.slug,
      roster,
      series,
      podium,
      plays: null,
    },
    unavailable,
  };
}

async function careerEdition(edition: Edition): Promise<{
  input: CareerEditionInput;
  unavailable: boolean;
}> {
  const { input, unavailable } = edition.archive
    ? { input: archiveInput(edition), unavailable: false }
    : await liveInput(edition);
  try {
    input.plays = (await publicArchiveStatistics(edition.slug))
      .plays as MapPlay[];
  } catch {
    return { input, unavailable: true };
  }
  return { input, unavailable };
}

/** Career totals are ordered by the podium first, then by participation. */
function compareCareer(
  left: CareerLeaderboardRow,
  right: CareerLeaderboardRow,
) {
  return (
    right.career.championships - left.career.championships ||
    right.career.runnerUps - left.career.runnerUps ||
    right.career.thirdPlaces - left.career.thirdPlaces ||
    right.career.seasons - left.career.seasons ||
    right.career.firstPlaces - left.career.firstPlaces ||
    left.osuId - right.osuId
  );
}

function cardRow(
  row: PlayerLeaderboardRow,
  art: Map<number, DirectoryArt>,
  career: CareerTotals,
): CareerLeaderboardRow {
  const saved = art.get(row.osuId);
  return {
    osuId: row.osuId,
    username: row.username,
    pp: row.pp,
    classification: row.classification,
    avatarUrl: saved?.avatarUrl ?? null,
    coverUrl: saved?.coverUrl ?? null,
    career,
  };
}

/**
 * Build the career ranking from the saved performance leaderboard population.
 * Podiums, series and maps are read from the published public projections, so
 * an edition whose statistics are unavailable still contributes its career
 * record and is reported separately.
 */
export async function careerLeaderboard(
  leaderboard: PlayerLeaderboard,
): Promise<CareerLeaderboard> {
  if (leaderboard.state !== "ready")
    return {
      players: [],
      editions: 0,
      unavailableEditions: [],
      state: "pending",
    };

  const editions = await getPublicEditions();
  const unavailable = new Set<string>();
  const inputs: CareerEditionInput[] = [];
  await Promise.all(
    editions.map(async (edition) => {
      try {
        const { input, unavailable: missing } = await careerEdition(edition);
        inputs.push(input);
        if (missing) unavailable.add(edition.slug);
      } catch {
        unavailable.add(edition.slug);
      }
    }),
  );

  const totals = careerTotals(inputs);
  const players = leaderboard.players
    .map((row) =>
      cardRow(
        row,
        leaderboard.art,
        totals.get(row.osuId) ?? emptyCareerTotals(),
      ),
    )
    .sort(compareCareer);

  return {
    players,
    editions: inputs.length,
    unavailableEditions: [...unavailable].sort(),
    state: "ready",
  };
}
