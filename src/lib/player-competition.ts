import { getPublicEdition } from "./content";
import { seasonAppearanceFor } from "./player-timeline";
import { archiveWinner, recordedArchiveMatch } from "./historical-archive";
import {
  tournamentPlacements,
  finalStandingsFinish,
  knockoutFinishBands,
  competitionStage,
  isFinalStandings,
  summarizePlayerCompetition,
  type CompetitionEditionRecord,
  type CompetitionMatchRecord,
  type PlayerCompetitionRecord,
} from "./player-competition-model";
import type { PublishedPlayer } from "./players";
import { publicCompetition } from "./public-competition";

/**
 * DEMO: reads only the public tournament/archive projections that a visitor can
 * already open. Private applications, unapproved proposals and unpublished
 * statistics never reach these totals.
 */
export async function playerCompetitionRecord(
  participation: PublishedPlayer[],
): Promise<PlayerCompetitionRecord> {
  const groups = new Map<string, PublishedPlayer[]>();
  for (const player of participation)
    groups.set(player.editionSlug, [
      ...(groups.get(player.editionSlug) ?? []),
      player,
    ]);
  const editions = await Promise.all(
    [...groups].map(([slug, people]) => editionRecord(slug, people)),
  );
  return summarizePlayerCompetition(editions);
}

async function editionRecord(
  slug: string,
  people: PublishedPlayer[],
): Promise<CompetitionEditionRecord> {
  // Coaches are not part of the playing roster; their seasons still appear below.
  const roster = people.filter(
    (p) => p.participation !== "coach" && p.role !== "coach",
  );
  const teams = new Map<string, { id: string; name: string }>();
  for (const person of roster)
    if (person.team) teams.set(person.team.id, person.team);
  const first = roster[0] ?? people[0];
  const placementPeople = roster.length ? roster : people;
  const base: CompetitionEditionRecord = {
    editionSlug: slug,
    editionName: first.editionName,
    defaultAppearance: null,
    season: null,
    team: teams.values().next().value ?? null,
    coachedTeams: [
      ...new Map(
        people.flatMap((p) => p.coachedTeams ?? []).map((t) => [t.id, t]),
      ).values(),
    ],
    role: first.role ?? null,
    sourceRole: first.sourceRole ?? null,
    tier: first.tier ?? null,
    captain: first.captain,
    placing: placementPeople.find((p) => p.placing != null)?.placing ?? null,
    placingRange:
      placementPeople.find((p) => p.placingRange != null)?.placingRange ?? null,
    groupRank: null,
    finish: null,
    champion: false,
    runnerUp: false,
    thirdPlace: false,
    matches: [],
    unavailable: false,
  };
  try {
    // The edition's stored season orders the player's tournaments newest first.
    const edition = await getPublicEdition(slug);
    base.season = edition?.season ?? null;
    base.defaultAppearance =
      edition?.defaultAppearance ??
      (edition?.season ? seasonAppearanceFor(edition.season) : null);
    if (!teams.size) return base;
    if (edition?.archive) {
      const recorded = edition.archive.matches.filter(recordedArchiveMatch);
      const matches: CompetitionMatchRecord[] = [];
      for (const match of recorded) {
        // A roster replacement can attach one player to more than one team in
        // the same edition, so every recorded team is considered.
        const side = teams.has(match.teamA)
          ? 0
          : teams.has(match.teamB)
            ? 1
            : -1;
        if (side !== 0 && side !== 1) continue;
        const winner = archiveWinner(match);
        matches.push({
          outcome: winner === null ? "draw" : winner === side ? "win" : "loss",
          stage: competitionStage(match.stage, match.round),
          mapsWon: match.score ? match.score[side] : null,
          mapsLost: match.score ? match.score[side === 0 ? 1 : 0] : null,
          forfeit: match.forfeitWinner !== undefined,
          at:
            match.scheduledAt ??
            match.roomOpenedAt ??
            match.review?.startedAt ??
            null,
        });
      }
      const standing = edition.archive.standings.find(
        (row) =>
          teams.has(row.teamId) &&
          (row.rank !== null ||
            (row.placement?.start === row.placement?.end &&
              row.placement !== undefined)) &&
          (row.scope === "group" ||
            (row.scope === undefined &&
              !isFinalStandings(edition.archive!.standings))),
      );
      const series = recorded.map((match) => {
        const winner = archiveWinner(match);
        return {
          label: match.stage,
          round: match.round,
          at:
            match.scheduledAt ??
            match.roomOpenedAt ??
            match.review?.startedAt ??
            null,
          winnerTeamId:
            winner === null ? null : winner === 0 ? match.teamA : match.teamB,
          loserTeamId:
            winner === null ? null : winner === 0 ? match.teamB : match.teamA,
        };
      });
      // Standings ranks are group-scoped, so podium places come from the
      // deciding knockout series rather than from rank 1.
      const placements = tournamentPlacements(series);
      // Prefer an archived final table; otherwise derive the ladder only when
      // the bracket is regular enough to name every elimination round.
      const teamIds = edition.archive.teams.map((team) => team.id);
      const candidates = [
        ...(base.team ? [base.team.id] : []),
        ...teams.keys(),
      ];
      const bands = knockoutFinishBands(series, teamIds);
      const finish =
        (base.placingRange
          ? {
              label:
                base.placingRange.start === base.placingRange.end
                  ? String(base.placingRange.start)
                  : `${base.placingRange.start}–${base.placingRange.end}`,
              derived: !base.placingRange.official,
            }
          : null) ??
        finalStandingsFinish(
          edition.archive.standings,
          candidates,
          edition.archive.teams.length,
        ) ??
        candidates.map((team) => bands?.get(team)).find(Boolean) ??
        null;
      return {
        ...base,
        groupRank:
          standing && (standing.rank ?? standing.placement?.start) != null
            ? {
                group: standing.group || null,
                rank: standing.rank ?? standing.placement!.start,
              }
            : null,
        finish,
        champion: base.placingRange
          ? base.placingRange.start === 1 && base.placingRange.end === 1
          : placements.champion !== null && teams.has(placements.champion),
        runnerUp: base.placingRange
          ? base.placingRange.start === 2 && base.placingRange.end === 2
          : placements.runnerUp !== null && teams.has(placements.runnerUp),
        thirdPlace: base.placingRange
          ? base.placingRange.start === 3 &&
            (base.placingRange.end === 3 ||
              (base.placingRange.end === 4 && base.placingRange.tied))
          : placements.third.some((team) => teams.has(team)),
        matches,
      };
    }
    const competition = await publicCompetition(slug);
    const matches: CompetitionMatchRecord[] = [];
    for (const fixture of competition?.fixtures ?? []) {
      const result = fixture.result;
      if (!result) continue;
      const side = teams.has(fixture.home.team?.id ?? "")
        ? "home"
        : teams.has(fixture.away.team?.id ?? "")
          ? "away"
          : null;
      if (!side) continue;
      const teamId =
        side === "home" ? fixture.home.team?.id : fixture.away.team?.id;
      const outcome = result.draw
        ? "draw"
        : result.winnerTeamId === teamId
          ? "win"
          : result.winnerTeamId
            ? "loss"
            : null;
      if (!outcome) continue;
      matches.push({
        outcome,
        stage: fixture.stage,
        mapsWon: side === "home" ? result.homeWins : result.awayWins,
        mapsLost: side === "home" ? result.awayWins : result.homeWins,
        forfeit: false,
        at: fixture.scheduledAt,
      });
    }
    // Live fixtures expose structural stages; labels only add the round name.
    const placements = tournamentPlacements(
      (competition?.fixtures ?? []).flatMap((fixture) => {
        const result = fixture.result;
        if (!result) return [];
        const winner = result.draw ? null : result.winnerTeamId;
        const sides = [fixture.home.team?.id, fixture.away.team?.id];
        return [
          {
            label: `${fixture.stage} ${fixture.roundName}`.trim(),
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
      ...base,
      champion: placements.champion !== null && teams.has(placements.champion),
      runnerUp: placements.runnerUp !== null && teams.has(placements.runnerUp),
      thirdPlace: placements.third.some((team) => teams.has(team)),
      matches,
    };
  } catch {
    // The profile stays readable when one public projection is unavailable.
    return { ...base, unavailable: true };
  }
}
