import { db } from "@/db";
import {
  editionEvents,
  editionState,
  registrations,
  tournamentPlayerReactions as reactions,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { assertUserWriteChannel } from "./auth/staff";
import { HttpError } from "./http-error";
import {
  setPlayerReactionWrite,
  type PlayerReactionSummary,
} from "./player-reaction-write-contract";
import { playerReactionById } from "./player-reactions";

const publishedPlayer = (edition: string, playerId?: number) =>
  and(
    eq(registrations.editionSlug, edition),
    playerId === undefined ? undefined : eq(registrations.userId, playerId),
    eq(registrations.status, "accepted"),
    sql`${editionState.configuration}->>'published' = 'true'`,
  );

export function readPlayerReactions(
  edition: string,
  viewerId?: number,
  playerId?: number,
  reader: Pick<ReturnType<typeof db>, "select"> = db(),
) {
  return reader
    .select({
      playerId: reactions.playerId,
      id: reactions.emojiId,
      count: sql<number>`count(*)::int`,
      selected:
        viewerId === undefined
          ? sql<boolean>`false`
          : sql<boolean>`bool_or(${reactions.authorId} = ${viewerId})`,
    })
    .from(registrations)
    .innerJoin(editionState, eq(editionState.slug, registrations.editionSlug))
    .innerJoin(
      reactions,
      and(
        eq(reactions.editionSlug, registrations.editionSlug),
        eq(reactions.playerId, registrations.userId),
      ),
    )
    .where(publishedPlayer(edition, playerId))
    .groupBy(reactions.playerId, reactions.emojiId)
    .orderBy(reactions.playerId, reactions.emojiId);
}

export async function playerReactionDirectory(
  edition: string,
  viewerId?: number,
) {
  const directory: Record<number, PlayerReactionSummary> = {};
  for (const { playerId, ...summary } of await readPlayerReactions(
    edition,
    viewerId,
  )) {
    (directory[playerId] ??= []).push(summary);
  }
  return directory;
}

export async function setPlayerReaction(
  actorId: number,
  edition: string,
  playerId: number,
  input: unknown,
) {
  assertUserWriteChannel();
  const parsed = setPlayerReactionWrite.request.safeParse(input);
  if (!parsed.success || !Number.isSafeInteger(playerId) || playerId <= 0)
    throw new HttpError(400, "Invalid request.");
  const { id, selected } = parsed.data;
  const emoji = playerReactionById.get(id);
  if (!emoji || (selected && emoji.selectable === false))
    throw new HttpError(400, "Invalid request.");

  return db().transaction(async (tx) => {
    // Serialize writes for this player so each receipt includes earlier committed reactions.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(
      ${`player-reactions:${edition}:${playerId}`}, 0))`);
    const [target] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .innerJoin(editionState, eq(editionState.slug, registrations.editionSlug))
      .where(publishedPlayer(edition, playerId))
      .for("share");
    if (!target) throw new HttpError(404, "Published player not found.");

    const saved = selected
      ? await tx
          .insert(reactions)
          .values({
            editionSlug: edition,
            playerId,
            emojiId: id,
            authorId: actorId,
          })
          .onConflictDoNothing()
          .returning({ id: reactions.emojiId })
      : await tx
          .delete(reactions)
          .where(
            and(
              eq(reactions.editionSlug, edition),
              eq(reactions.playerId, playerId),
              eq(reactions.emojiId, id),
              eq(reactions.authorId, actorId),
            ),
          )
          .returning({ id: reactions.emojiId });
    if (saved.length) {
      await tx.insert(editionEvents).values({
        editionSlug: edition,
        actorId,
        kind: "player_reaction_changed",
        detail: { playerId, emojiId: id, selected },
      });
    }
    const rows = await readPlayerReactions(edition, actorId, playerId, tx);
    return rows.map(({ id, count, selected }) => ({ id, count, selected }));
  });
}
