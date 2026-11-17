import { setTimeout } from "node:timers/promises";
import { eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { db, getPool, readOnlyData } from "@/db";
import { etxRatingCache } from "@/db/schema";
import { importedRatingsEdition } from "./player-rating-import-contract";
import { publicPlayerFilters, publicPlayersForEditions } from "./players";
import { readTournament } from "./tournament-reads";

const providerUrl =
  "https://www.eliteronix.de/elitebotix/api/player-duelrating";
const requestIntervalMs = 1000;
const taipeiDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const duelRating = z.object({
  osuUserId: z.string(),
  duelRating: z.object({
    osuDuelStarRating: z
      .string()
      .regex(/^\d+(?:\.\d+)?$/)
      .transform(Number)
      .pipe(z.number().nonnegative()),
    osuDuelProvisional: z.boolean(),
    osuDuelOutdated: z.boolean(),
  }),
});

async function fetchEtxRating(osuId: number) {
  const url = new URL(providerUrl);
  url.searchParams.set("u", String(osuId));
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 429) return "throttled";
  if (
    response.status === 404 &&
    (await response.text()).trim() ===
      "No duel rating found for the specified osu! user id"
  )
    return null;
  if (!response.ok) throw new Error("ETX rating request failed");

  const payload = duelRating.parse(await response.json());
  if (payload.osuUserId !== String(osuId))
    throw new Error("ETX returned a different player");
  return {
    value: payload.duelRating.osuDuelStarRating,
    provisional: payload.duelRating.osuDuelProvisional,
    outdated: payload.duelRating.osuDuelOutdated,
  };
}

export async function refreshEtxRatings() {
  const client = await getPool().connect();
  try {
    // Hold one lock for the provider across manual and scheduled processes.
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(1329810514, 1176704) AS locked",
    );
    if (!rows[0].locked) return { state: "busy" } as const;

    const directory = await readOnlyData(async () => {
      const tournament = await readTournament(
        importedRatingsEdition,
        db(),
        true,
      );
      if (!tournament || tournament.edition.archive) return null;
      return publicPlayersForEditions(
        publicPlayerFilters({ edition: importedRatingsEdition }),
        [tournament.edition],
      );
    });
    if (!directory) return { state: "unavailable" } as const;

    const database = drizzle(client);
    const attemptedOn = taipeiDate.format(new Date());
    const attempted = new Set(
      (
        await database
          .select({ osuId: etxRatingCache.osuId })
          .from(etxRatingCache)
          .where(gte(etxRatingCache.attemptedOn, attemptedOn))
      ).map(({ osuId }) => osuId),
    );
    const result = {
      state: "complete" as "complete" | "throttled",
      updated: 0,
      missing: 0,
      failed: 0,
      skipped: 0,
    };
    for (const { osuId } of directory.rows) {
      if (attempted.has(osuId)) {
        result.skipped++;
        continue;
      }
      // Pace even the first call so a new worker cannot burst after a restart.
      await setTimeout(requestIntervalMs);
      await database
        .insert(etxRatingCache)
        .values({ osuId, attemptedOn })
        .onConflictDoUpdate({
          target: etxRatingCache.osuId,
          set: { attemptedOn },
        });

      let rating;
      try {
        rating = await fetchEtxRating(osuId);
      } catch {
        // Keep the last confirmed response when the provider fails.
        result.failed++;
        continue;
      }
      if (rating === "throttled") {
        result.state = "throttled";
        result.failed++;
        break;
      }
      await database
        .update(etxRatingCache)
        .set({ rating, fetchedAt: new Date() })
        .where(eq(etxRatingCache.osuId, osuId));
      if (rating) result.updated++;
      else result.missing++;
    }
    return result;
  } finally {
    // Closing the dedicated session releases the advisory lock on every exit.
    client.release(true);
  }
}
