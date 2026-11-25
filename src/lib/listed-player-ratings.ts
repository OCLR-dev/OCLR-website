import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  importedPlayerRatings,
  registrations,
  sipRatingCache,
} from "@/db/schema";
import { readEtxRatingSnapshots } from "./etx-rating";
import { importedRatingsEdition as s11 } from "./player-rating-import-contract";
import {
  legacyProfileEtxSchema,
  profileCsvTotalSchema,
  profileEtxSchema,
  profileSipApiSchema,
  type ProfileRatings,
} from "./profile-ratings-model";

async function acceptedCsv(osuIds: number[]) {
  return db()
    .select({
      osuId: importedPlayerRatings.userId,
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
        inArray(importedPlayerRatings.userId, osuIds),
      ),
    );
}

/** Caller supplies only IDs from a publication-checked profile or season directory,
 * in the same read snapshot. CSV eligibility also requires accepted S11 status. */
export async function readListedPlayerRatings(
  osuIds: number[],
  includeS11Csv: boolean,
  legacy = false,
) {
  const result = new Map<number, Pick<ProfileRatings, "sip" | "etx">>();
  if (!osuIds.length) return result;
  const csv = includeS11Csv ? await acceptedCsv(osuIds) : [];
  const imported = new Map(
    csv.map((row) => [row.osuId + ":" + row.source, row]),
  );
  const etxSnapshots = await readEtxRatingSnapshots(osuIds);
  const sipRows = await db()
    .select({
      osuId: sipRatingCache.osuId,
      value: sipRatingCache.value,
      snapshot: sipRatingCache.snapshot,
      fetchedAt: sipRatingCache.fetchedAt,
    })
    .from(sipRatingCache)
    .where(inArray(sipRatingCache.osuId, osuIds));
  const caches = new Map(sipRows.map((row) => [row.osuId, row]));
  const etxSchema = legacy ? legacyProfileEtxSchema : profileEtxSchema;
  for (const osuId of osuIds) {
    const cache = caches.get(osuId);
    const etxSnapshot = etxSnapshots.get(osuId);
    const sip = imported.get(osuId + ":sip");
    const etx = imported.get(osuId + ":etx");
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
    const saved = etxSnapshot?.rating;
    const providerStars = etxSchema.safeParse(
      saved && {
        value: saved.value,
        provisional: saved.provisional ?? null,
        outdated: saved.outdated ?? null,
        importedAt: etxSnapshot.fetchedAt.toISOString(),
        mods: saved.mods ?? null,
        ...(!legacy && { source: "api" }),
      },
    );
    // The older wire format cannot represent an unknown provider flag.
    const stars = providerStars.success
      ? providerStars
      : etxSchema.safeParse(
          etx && {
            value: etx.value,
            provisional: etx.provisional,
            outdated: etx.outdated,
            importedAt: etx.importedAt?.toISOString() ?? null,
            mods: etx.mods,
            ...(!legacy && { source: "csv" }),
          },
        );
    result.set(osuId, {
      sip: {
        api: api.success ? api.data : null,
        csv: csvTotal.success ? csvTotal.data : null,
      },
      etx: stars.success ? stars.data : null,
    });
  }
  return result;
}
