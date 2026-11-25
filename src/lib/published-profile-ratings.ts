import { db, readOnlyData } from "@/db";
import { eventPreview } from "./event-preview";
import { getOtrRating } from "./otr-rating";
import { importedRatingsEdition as s11 } from "./player-rating-import-contract";
import { publicPlayerStillListed } from "./players";
import { profileOtrSchema, type ProfileRatings } from "./profile-ratings-model";
import { readListedPlayerRatings } from "./listed-player-ratings";
import { readTournament } from "./tournament-reads";

/** The supplied public participations are candidates, not authority. Neither a
 * self-ID, a staff capability, nor a row left in a rating table grants access.
 */
export async function readPublishedProfileRatings(
  osuId: number,
  participation: readonly { osuId: number; editionSlug: string }[],
  edition?: string,
  legacy = false,
): Promise<ProfileRatings | undefined> {
  const candidates = new Set(
    participation
      .filter(
        (p) => p.osuId === osuId && (!edition || p.editionSlug === edition),
      )
      .map((p) => p.editionSlug),
  );
  if (!process.env.DATABASE_URL || !candidates.size) return undefined;
  // Prove S11 first if it is in scope. A different public edition can release
  // current API metrics, but never an S11 CSV row.
  const slugs = candidates.delete(s11) ? [s11, ...candidates] : [...candidates];
  return readOnlyData(async () => {
    for (const slug of slugs) {
      if (eventPreview(slug)) continue;
      const tournament = await readTournament(slug, db(), true);
      if (
        !tournament?.edition.published ||
        !(await publicPlayerStillListed(osuId, slug))
      )
        continue;

      const ratings = await readListedPlayerRatings(
        [osuId],
        slug === s11 && !tournament.edition.archive,
        legacy,
      );
      const otr = profileOtrSchema.safeParse(await getOtrRating(osuId));
      return {
        otr: otr.success ? otr.data : null,
        ...ratings.get(osuId)!,
      };
    }
    return undefined;
  });
}
