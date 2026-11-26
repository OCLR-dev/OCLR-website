import { archiveTeamPlacement } from "./archive-placement";
import type { publicArchiveStatistics } from "./archive-statistics-reads";
import { HttpError } from "./http-error";
import { getPublicEditions } from "./content";
import type { Edition } from "./editions";
import { seasonNumber } from "./player-timeline";
import { archiveWinner, recordedArchiveMatch } from "./historical-archive";
import {
  careerTotals,
  emptyCareerTotals,
  type CareerEditionInput,
  type CareerSeries,
} from "./player-career-model";
import { tournamentPlacements } from "./player-competition-model";
import { publicCompetition } from "./public-competition";
import { publishedTeams } from "./team-reads";
import type { CareerRankingSnapshot } from "./ranking-snapshot-model";

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

function archiveRoster(archive: NonNullable<Edition["archive"]>) {
  const roster = new Map<number, string[]>();
  for (const player of archive.players) {
    if (player.role === "captain" || player.role === "player")
      addMember(roster, player.osuId, player.teamId);
  }
  for (const replacement of archive.rosterReplacements ?? []) {
    for (const person of replacement.people)
      addMember(roster, person.osuId, replacement.teamId);
  }
  return roster;
}

/** A published pick supplies the current appearance, which the career
 * leaderboard includes once that season publishes its playing rosters. */
export async function careerAppearanceInEdition(
  osuId: number,
  edition: Pick<Edition, "slug" | "season">,
) {
  const current = seasonNumber(edition.season) ?? seasonNumber(edition.slug);
  if (current === null) return undefined;
  let appearance = 1;
  for (const prior of await getPublicEditions()) {
    const number = seasonNumber(prior.season) ?? seasonNumber(prior.slug);
    if (prior.slug === edition.slug || number === null || number >= current)
      continue;
    const played = prior.archive
      ? archiveRoster(prior.archive).has(osuId)
      : (await publishedTeams(prior.slug)).some((team) =>
          team.members?.some((member) => member.osuId === osuId),
        );
    if (played) appearance++;
  }
  return appearance;
}

/** Career inputs for an archived edition: its roster, series and placements. */
function archiveInput(edition: Edition): CareerEditionInput {
  const archive = edition.archive!;
  const roster = archiveRoster(archive);

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

  const podium = tournamentPlacements(series);

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
async function liveInput(edition: Edition): Promise<CareerEditionInput> {
  const roster = new Map<number, string[]>();
  for (const team of await publishedTeams(edition.slug)) {
    for (const member of team.members ?? [])
      addMember(roster, member.osuId, team.id);
  }

  const series: CareerSeries[] = [];
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
  return {
    editionSlug: edition.slug,
    roster,
    series,
    podium: placements,
    plays: null,
  };
}

/** Aggregate the published roster, results and map statistics for the performance population. */
export async function projectCareerLeaderboard(
  editions: readonly Edition[],
  playerIds: readonly number[],
  readStatistics: typeof publicArchiveStatistics,
): Promise<CareerRankingSnapshot> {
  const unavailableEditions: string[] = [];
  const inputs: CareerEditionInput[] = [];
  for (const edition of editions) {
    const input = edition.archive
      ? archiveInput(edition)
      : await liveInput(edition);
    try {
      input.plays = (await readStatistics(edition.slug)).plays;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      unavailableEditions.push(edition.slug);
    }
    inputs.push(input);
  }

  const totals = careerTotals(inputs);
  const players = playerIds.map((osuId) => ({
    osuId,
    career: totals.get(osuId) ?? emptyCareerTotals(),
  }));
  players.sort(
    (left, right) =>
      right.career.championships - left.career.championships ||
      right.career.runnerUps - left.career.runnerUps ||
      right.career.thirdPlaces - left.career.thirdPlaces ||
      right.career.seasons - left.career.seasons ||
      right.career.firstPlaces - left.career.firstPlaces ||
      left.osuId - right.osuId,
  );
  return {
    players,
    editions: inputs.length,
    unavailableEditions: unavailableEditions.sort(),
  };
}
