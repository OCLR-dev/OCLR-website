import { and, eq } from "drizzle-orm";
import { db, readOnlyData } from "@/db";
import {
  importedPlayerRatings,
  registrations,
  sipRatingCache,
} from "@/db/schema";
import { eventPreview } from "./event-preview";
import { readEtxRatingSnapshots } from "./etx-rating";
import { getOtrRating } from "./otr-rating";
import { importedRatingsEdition as s11 } from "./player-rating-import-contract";
import { publicPlayerStillListed } from "./players";
import {
  profileCsvTotalSchema,
  profileEtxSchema,
  profileOtrSchema,
  profileSipApiSchema,
  type ProfileRatings,
} from "./profile-ratings-model";
import { readTournament } from "./tournament-reads";

async function acceptedCsv(osuId: number) {
  return db()
    .select({
      source: importedPlayerRatings.source,
      value: importedPlayerRatings.value,
      importedAt: importedPlayerRatings.importedAt,
      provisional: importedPlayerRatings.provisional,
      outdated: importedPlayerRatings.outdated,
      mods: importedPlayerRatings.etxMods,
    })
    .from(importedPlayerRatings)
    .innerJoin(
      registrations,
      and(
        eq(registrations.editionSlug, importedPlayerRatings.editionSlug),
        eq(registrations.userId, importedPlayerRatings.userId),
        eq(registrations.status, "accepted"),
      ),
    )
    .where(
      and(
        eq(importedPlayerRatings.editionSlug, s11),
        eq(importedPlayerRatings.userId, osuId),
      ),
    );
}

/** The supplied public participations are candidates, not authority. Neither a
 * self-ID, a staff capability, nor a row left in a rating table grants access.
 */
export async function readPublishedProfileRatings(
  osuId: number,
  participation: readonly { osuId: number; editionSlug: string }[],
  edition?: string,
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

      const csv =
        slug === s11 && !tournament.edition.archive
          ? await acceptedCsv(osuId)
          : [];
      const sip = csv.find((row) => row.source === "sip");
      const etx = csv.find((row) => row.source === "etx");
      const etxSnapshot = (await readEtxRatingSnapshots([osuId])).get(osuId);
      const [cache] = await db()
        .select({
          value: sipRatingCache.value,
          snapshot: sipRatingCache.snapshot,
          fetchedAt: sipRatingCache.fetchedAt,
        })
        .from(sipRatingCache)
        .where(eq(sipRatingCache.osuId, osuId));
      const api = profileSipApiSchema.safeParse(
        cache && {
          value: cache.value,
          snapshot: cache.snapshot,
          fetchedAt: cache.fetchedAt.toISOString(),
        },
      );
      const csvTotal = profileCsvTotalSchema.safeParse(
        sip && {
          value: sip.value,
          importedAt: sip.importedAt?.toISOString() ?? null,
        },
      );
      const stars = profileEtxSchema.safeParse(
        etxSnapshot
          ? etxSnapshot.rating && {
              ...etxSnapshot.rating,
              importedAt: etxSnapshot.fetchedAt.toISOString(),
              mods: null,
            }
          : etx && {
              value: etx.value,
              provisional: etx.provisional,
              outdated: etx.outdated,
              importedAt: etx.importedAt?.toISOString() ?? null,
              mods: etx.mods,
            },
      );
      const otr = profileOtrSchema.safeParse(await getOtrRating(osuId));
      return {
        otr: otr.success ? otr.data : null,
        sip: {
          api: api.success ? api.data : null,
          csv: csvTotal.success ? csvTotal.data : null,
        },
        etx: stars.success ? stars.data : null,
      };
    }
    return undefined;
  });
}
