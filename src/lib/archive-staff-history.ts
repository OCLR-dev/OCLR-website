import { archiveStaff } from "./archive-staff";
import { archiveStaffPositions } from "./archive-staff-groups";
import type { Edition } from "./editions";
import { seasonNumber } from "./player-timeline";

type StaffEdition = Pick<Edition, "slug" | "name" | "published" | "archive"> &
  Partial<Pick<Edition, "season">>;

export type HistoricalStaffHistory = {
  editionSlug: string;
  editionName: string;
  username: string;
  roles: string[];
}[];

export function historicalStaffHistory(
  osuId: number,
  editions: readonly StaffEdition[],
): HistoricalStaffHistory {
  // Historical edition metadata varies. Canonical season routes also cover OCLR β (s5).
  const order = (edition: StaffEdition) =>
    seasonNumber(edition.slug) ??
    seasonNumber(edition.season) ??
    Number.MAX_SAFE_INTEGER;
  return [...editions]
    .sort((a, b) => order(a) - order(b) || a.slug.localeCompare(b.slug, "en"))
    .flatMap((edition) => {
      if (!edition.published || !edition.archive) return [];
      const credits = archiveStaff(edition.archive).filter(
        (person) => person.osuId === osuId,
      );
      if (credits.length === 0) return [];
      return [
        {
          editionSlug: edition.slug,
          editionName: edition.name,
          username: credits[0].username,
          roles: [
            ...new Set(
              credits.flatMap((person) =>
                archiveStaffPositions(person.position),
              ),
            ),
          ],
        },
      ];
    });
}
