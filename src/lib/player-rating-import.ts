import { db } from "@/db";
import {
  editionEvents,
  editionState,
  importedPlayerRatings,
  registrations,
  users,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { HttpError } from "./http-error";
import { parsePlayerRatingCsv } from "./player-rating-csv";
import {
  importedRatingsEdition,
  importPlayerRatingsWrite,
  playerRatingCsvLimit,
} from "./player-rating-import-contract";

export async function importPlayerRatings(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_registrations", slug);
  if (slug !== importedRatingsEdition)
    throw new HttpError(404, "Tournament not found.");
  const parsed = importPlayerRatingsWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Upload a valid CSV export for the selected rating source.",
    );
  const { source, csv } = parsed.data;
  if (Buffer.byteLength(csv) > playerRatingCsvLimit)
    throw new HttpError(413, "The request is too large.");
  const rows = parsePlayerRatingCsv(csv, source);

  return db().transaction(async (tx) => {
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, "manage_registrations", slug, tx);
    await assertOperationalEdition(slug, tx);
    const accepted = await tx
      .select({ userId: users.osuId, username: users.username })
      .from(registrations)
      .innerJoin(users, eq(users.osuId, registrations.userId))
      .where(
        and(
          eq(registrations.editionSlug, slug),
          eq(registrations.status, "accepted"),
        ),
      );
    const ids = new Map<string, number | null>();
    for (const player of accepted) {
      const identity =
        source === "sip"
          ? player.username.trim().toLowerCase()
          : String(player.userId);
      ids.set(identity, ids.has(identity) ? null : player.userId);
    }
    const matched = new Map<
      number,
      typeof importedPlayerRatings.$inferInsert
    >();
    const unmatchedRows: number[] = [];
    let unmatched = 0;
    let missing = 0;
    for (const row of rows) {
      const userId = ids.get(row.identity);
      if (!userId) {
        unmatched++;
        if (unmatchedRows.length < 10) unmatchedRows.push(row.row);
      } else if (row.value === null) {
        missing++;
      } else {
        const rating = {
          editionSlug: slug,
          source,
          userId,
          value: row.value,
          provisional: row.provisional,
          outdated: row.outdated,
        };
        const previous = matched.get(userId);
        if (
          previous &&
          (previous.value !== rating.value ||
            previous.provisional !== rating.provisional ||
            previous.outdated !== rating.outdated)
        )
          throw new HttpError(
            400,
            "The CSV contains conflicting ratings for the same player.",
          );
        matched.set(userId, rating);
      }
    }
    const saved = await tx
      .select()
      .from(importedPlayerRatings)
      .where(
        and(
          eq(importedPlayerRatings.editionSlug, slug),
          eq(importedPlayerRatings.source, source),
        ),
      );
    const previous = new Map(saved.map((row) => [row.userId, row]));
    const changed = [...matched.values()].filter((row) => {
      const old = previous.get(row.userId);
      return (
        !old ||
        old.value !== row.value ||
        old.provisional !== row.provisional ||
        old.outdated !== row.outdated
      );
    });
    for (let offset = 0; offset < changed.length; offset += 1000) {
      await tx
        .insert(importedPlayerRatings)
        .values(changed.slice(offset, offset + 1000))
        .onConflictDoUpdate({
          target: [
            importedPlayerRatings.editionSlug,
            importedPlayerRatings.source,
            importedPlayerRatings.userId,
          ],
          set: {
            value: sql`excluded.value`,
            provisional: sql`excluded.provisional`,
            outdated: sql`excluded.outdated`,
          },
        });
    }
    if (changed.length) {
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        kind: "player_ratings_import",
        detail: {
          entity: { type: "player_ratings", id: source },
          before: changed.map((row) => previous.get(row.userId) ?? null),
          after: changed,
        },
      });
    }
    return {
      matched: matched.size,
      updated: changed.length,
      unmatched,
      unmatchedRows,
      missing,
    };
  });
}
