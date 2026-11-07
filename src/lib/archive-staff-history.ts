import { historicalStaffCredits } from "./archive-staff";
import { archiveStaffPositions } from "./archive-staff-groups";
import type { Edition } from "./editions";

type StaffEdition = Pick<Edition, "slug" | "name" | "published" | "archive">;

export type HistoricalStaffHistory = {
  editionSlug: string;
  editionName: string;
  username: string;
  roles: string[];
  matches: { id: string; label: string; roles: string[] }[];
}[];

export function historicalStaffHistory(
  osuId: number,
  editions: readonly StaffEdition[],
): HistoricalStaffHistory {
  return editions.flatMap((edition) => {
    if (!edition.published || !edition.archive) return [];
    const { roster, matches } = historicalStaffCredits(edition.archive);
    const roles = new Set<string>();
    let username = "";
    function creditedRoles(staff: typeof roster) {
      const positions = staff
        .filter((person) => person.osuId === osuId)
        .flatMap((person) => {
          username ||= person.username;
          return archiveStaffPositions(person.position);
        });
      for (const position of positions) roles.add(position);
      return [...new Set(positions)];
    }
    creditedRoles(roster);
    const duties = matches.flatMap(({ match, staff }) => {
      const roles = creditedRoles(staff);
      return roles.length ? [{ id: match.id, label: match.label, roles }] : [];
    });
    if (!username) return [];
    return [
      {
        editionSlug: edition.slug,
        editionName: edition.name,
        username,
        roles: [...roles],
        matches: duties,
      },
    ];
  });
}
