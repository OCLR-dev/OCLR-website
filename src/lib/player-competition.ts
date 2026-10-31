import { getPublicEdition } from "./content";
import { archiveWinner, recordedArchiveMatch } from "./historical-archive";
import {
  competitionStage,
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
  const base: CompetitionEditionRecord = {
    editionSlug: slug,
    editionName: first.editionName,
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
    placing: people.find((p) => p.placing != null)?.placing ?? null,
    groupRank: null,
    matches: [],
    unavailable: false,
  };
  try {
    // The edition's stored season orders the player's tournaments newest first.
    const edition = await getPublicEdition(slug);
    base.season = edition?.season ?? null;
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
          stage: competitionStage(match.stage),
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
        (row) => teams.has(row.teamId) && row.rank !== null,
      );
      return {
        ...base,
        groupRank:
          standing?.rank != null
            ? { group: standing.group || null, rank: standing.rank }
            : null,
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
    return { ...base, matches };
  } catch {
    // The profile stays readable when one public projection is unavailable.
    return { ...base, unavailable: true };
  }
}
