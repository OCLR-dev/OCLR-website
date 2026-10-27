import type { PublishedPlayer } from "./players";
import { compareTournamentSeasons } from "./tournament-order";

type Tournament = {
  slug: string;
  name: string;
  season: string | null;
  status: string;
};
export type ParticipationExperience = {
  username: string;
  role: NonNullable<PublishedPlayer["role"]> | null;
  team: PublishedPlayer["team"];
};
export type ParticipationHistory = {
  editionSlug: string;
  editionName: string;
  experiences: ParticipationExperience[];
}[];

/** Only saved UID facts from currently public editions; names never match identities. */
export function playerHistoryModel(
  osuId: number,
  participation: PublishedPlayer[],
  tournaments: Tournament[],
): ParticipationHistory {
  return [...tournaments].sort(compareTournamentSeasons).flatMap((edition) => {
    const rows = participation.filter(
      (p) => p.osuId === osuId && p.editionSlug === edition.slug,
    );
    const historical = rows.filter((p) => p.participation === "historical");
    const visible = historical.length
      ? historical
      : edition.status === "completed"
        ? rows
        : [];
    const experiences = new Map<string, ParticipationExperience>();
    function add(value: ParticipationExperience) {
      const key = JSON.stringify([value.username, value.role, value.team?.id]);
      if (!experiences.has(key)) experiences.set(key, value);
    }
    for (const p of visible) {
      add({
        username: p.username,
        role:
          p.role ??
          (p.captain
            ? "captain"
            : p.participation === "coach"
              ? "coach"
              : p.participation === "finalized_roster"
                ? "player"
                : null),
        team: p.team,
      });
      for (const team of p.coachedTeams ?? [])
        add({ username: p.username, role: "coach", team });
    }
    return experiences.size
      ? [
          {
            editionSlug: edition.slug,
            editionName: edition.name,
            experiences: [...experiences.values()],
          },
        ]
      : [];
  });
}
