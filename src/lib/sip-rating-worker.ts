import { db, getPool, readOnlyData } from "@/db";
import { registrations, sipRatingCache } from "@/db/schema";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { setTimeout as wait } from "node:timers/promises";
import { eventPreview } from "./event-preview";
import { importedRatingsEdition as edition } from "./player-rating-import-contract";
import { fetchSipRating } from "./sip-provider";
import { readTournament } from "./tournament-reads";

async function pendingPlayers() {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return readOnlyData(async () => {
    const tournament = await readTournament(edition, db(), true);
    if (!tournament || tournament.edition.archive || eventPreview(edition))
      return [];
    return db()
      .select({ osuId: registrations.userId })
      .from(registrations)
      .leftJoin(sipRatingCache, eq(sipRatingCache.osuId, registrations.userId))
      .where(
        and(
          eq(registrations.editionSlug, edition),
          eq(registrations.status, "accepted"),
          or(
            isNull(sipRatingCache.fetchedAt),
            lt(sipRatingCache.fetchedAt, day),
          ),
        ),
      )
      .orderBy(asc(registrations.userId));
  });
}

export async function refreshSipRatings(apply: boolean) {
  const summary = {
    pending: 0,
    updated: 0,
    missing: 0,
    failed: 0,
    stopped: null as "busy" | "unauthorized" | "rate-limited" | null,
  };
  if (!apply) return { ...summary, pending: (await pendingPlayers()).length };

  const token = process.env.SIP_API_TOKEN?.trim();
  if (!token) throw new Error("SIP_API_TOKEN is required.");

  // Serialize across worker processes on the same database. Keep the session
  // lock for the run, without holding a transaction open during provider I/O.
  const client = await getPool().connect();
  let locked = false;
  let connectionLost = false;
  const onError = () => {
    connectionLost = true;
  };
  client.on("error", onError);
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(1329810514, 1170) AS locked",
    );
    locked = result.rows[0].locked;
    if (!locked) return { ...summary, stopped: "busy" };

    const pending = await pendingPlayers();
    summary.pending = pending.length;
    const writer = drizzle(client);
    for (const { osuId } of pending) {
      // Also pace the first call so consecutive runs cannot send a burst.
      await wait(1_000);
      if (connectionLost)
        throw new Error("SIP refresh lost its database lock.");
      let rating: Awaited<ReturnType<typeof fetchSipRating>>;
      try {
        rating = await fetchSipRating(osuId, token);
      } catch {
        // Keep the last good value on a timeout, invalid response or 5xx.
        summary.failed++;
        continue;
      }
      if (rating.kind !== "rating") {
        summary.stopped = rating.kind;
        break;
      }
      const snapshot = { value: rating.value, fetchedAt: new Date() };
      await writer
        .insert(sipRatingCache)
        .values({ osuId, ...snapshot })
        .onConflictDoUpdate({ target: sipRatingCache.osuId, set: snapshot });
      if (rating.value === null) summary.missing++;
      else summary.updated++;
    }
    return summary;
  } finally {
    // Destroy the connection when it owns the lock so nothing can inherit it.
    client.release(locked || connectionLost);
    client.off("error", onError);
  }
}
