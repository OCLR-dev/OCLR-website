import { db } from "@/db";
import {
  editionEvents,
  editionState,
  playerMessages,
  registrations,
  users,
} from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth/sessions";
import { assertBusinessWrite } from "./auth/staff";
import { remoteMode } from "./data-source";
import { frontendResource } from "./frontend-resource";
import { HttpError } from "./http";

export type PlayerMessage = {
  id: string;
  authorId: number;
  author: string;
  text: string;
  createdAt: string;
  version: string;
};
const inputSchema = z
  .object({ requestId: z.uuid(), text: z.string().trim().min(1).max(1000) })
  .strict();
const visible = (edition: string, playerId: number) =>
  and(
    eq(registrations.editionSlug, edition),
    eq(registrations.userId, playerId),
    eq(registrations.status, "accepted"),
    sql`${editionState.configuration}->>'published' = 'true'`,
  );
async function databasePublicPlayerMessages(
  edition: string,
  playerId: number,
): Promise<PlayerMessage[]> {
  const rows = await db()
    .select({
      id: playerMessages.id,
      version: sql<string>`player_messages.xmin::text`,
      authorId: users.osuId,
      author: users.username,
      text: playerMessages.body,
      createdAt: playerMessages.createdAt,
    })
    .from(playerMessages)
    .innerJoin(users, eq(users.osuId, playerMessages.authorId))
    .innerJoin(
      registrations,
      and(
        eq(registrations.userId, playerMessages.playerId),
        eq(registrations.editionSlug, playerMessages.editionSlug),
      ),
    )
    .innerJoin(editionState, eq(editionState.slug, registrations.editionSlug))
    .where(
      and(
        eq(playerMessages.editionSlug, edition),
        eq(playerMessages.playerId, playerId),
        visible(edition, playerId),
      ),
    )
    .orderBy(desc(playerMessages.createdAt), desc(playerMessages.id))
    .limit(20);
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
export async function publicPlayerMessages(
  edition: string,
  playerId: number,
): Promise<Awaited<ReturnType<typeof databasePublicPlayerMessages>>> {
  if (remoteMode()) {
    return frontendResource<
      Awaited<ReturnType<typeof databasePublicPlayerMessages>>
    >("publicPlayerMessages", { edition, playerId });
  }
  return databasePublicPlayerMessages(edition, playerId);
}

export async function postPlayerMessage(
  actor: User,
  edition: string,
  playerId: number,
  input: unknown,
) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || !Number.isSafeInteger(playerId) || playerId <= 0)
    throw new HttpError(400, "Enter a message of 1 to 1000 characters.");
  await assertBusinessWrite(actor, edition);
  return db().transaction(async (tx) => {
    await assertBusinessWrite(actor, edition, tx);
    // Serialize one author's writes across targets; duplicate retries do not count toward the limit.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`player-message:${actor.osuId}`}, 0))`,
    );
    const [target] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .innerJoin(editionState, eq(editionState.slug, registrations.editionSlug))
      .where(visible(edition, playerId))
      .for("share");
    if (!target) throw new HttpError(404, "Published player not found.");
    const [existing] = await tx
      .select()
      .from(playerMessages)
      .where(
        and(
          eq(playerMessages.authorId, actor.osuId),
          eq(playerMessages.requestId, parsed.data.requestId),
        ),
      );
    if (existing) {
      if (
        existing.editionSlug !== edition ||
        existing.playerId !== playerId ||
        existing.body !== parsed.data.text
      )
        throw new HttpError(409, "This message request has already been used.");
      const [version] = await tx
        .select({ version: sql<string>`xmin::text` })
        .from(playerMessages)
        .where(eq(playerMessages.id, existing.id));
      return {
        id: existing.id,
        authorId: actor.osuId,
        author: actor.username,
        text: existing.body,
        createdAt: existing.createdAt.toISOString(),
        version: version.version,
      };
    }
    // A retry must not resurrect a message that its author already deleted.
    const [used] = await tx
      .select({ id: editionEvents.id })
      .from(editionEvents)
      .where(
        and(
          eq(editionEvents.actorId, actor.osuId),
          eq(editionEvents.kind, "player_message_posted"),
          sql`${editionEvents.detail}->>'requestId' = ${parsed.data.requestId}`,
        ),
      )
      .limit(1);
    if (used)
      throw new HttpError(409, "This message request has already been used.");
    // Keep post limits effective after deletions, without counting idempotent retries.
    const recent = await tx.execute(sql`
      SELECT count(*)::int AS total FROM (
        SELECT id::text FROM player_messages WHERE author_id = ${actor.osuId} AND created_at > now() - interval '1 minute'
        UNION
        SELECT detail->'entity'->>'id' FROM edition_events WHERE actor_id = ${actor.osuId} AND kind = 'player_message_posted' AND created_at > now() - interval '1 minute'
      ) recent_messages`);
    if (Number(recent.rows[0].total) >= 5)
      throw new HttpError(429, "Please wait before posting another message.");
    const [saved] = await tx
      .insert(playerMessages)
      .values({
        editionSlug: edition,
        playerId,
        authorId: actor.osuId,
        requestId: parsed.data.requestId,
        body: parsed.data.text,
      })
      .returning({
        id: playerMessages.id,
        createdAt: playerMessages.createdAt,
        version: sql<string>`xmin::text`,
      });
    await tx.insert(editionEvents).values({
      editionSlug: edition,
      actorId: actor.osuId,
      kind: "player_message_posted",
      detail: {
        entity: { type: "player_message", id: saved.id },
        playerId,
        requestId: parsed.data.requestId,
      },
    });
    return {
      ...saved,
      authorId: actor.osuId,
      author: actor.username,
      text: parsed.data.text,
      createdAt: saved.createdAt.toISOString(),
    };
  });
}

/** Row locks and the opaque row version prevent lost edits and stale deletes. */
export async function changePlayerMessage(
  actor: User,
  edition: string,
  playerId: number,
  messageId: string,
  operation: "edit" | "delete",
  input: unknown,
) {
  const schema =
    operation === "edit"
      ? z
          .object({
            version: z.string().regex(/^\d+$/),
            text: z.string().trim().min(1).max(1000),
          })
          .strict()
      : z.object({ version: z.string().regex(/^\d+$/) }).strict();
  const parsed = schema.safeParse(input);
  if (
    !parsed.success ||
    !z.uuid().safeParse(messageId).success ||
    !Number.isSafeInteger(playerId) ||
    playerId <= 0
  )
    throw new HttpError(400, "Check the message and try again.");
  await assertBusinessWrite(actor, edition);
  return db().transaction(async (tx) => {
    await assertBusinessWrite(actor, edition, tx);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`player-message:${actor.osuId}`}, 0))`,
    );
    const [target] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .innerJoin(editionState, eq(editionState.slug, registrations.editionSlug))
      .where(visible(edition, playerId))
      .for("share");
    if (!target) throw new HttpError(404, "Published player not found.");
    const [current] = await tx
      .select({
        id: playerMessages.id,
        body: playerMessages.body,
        createdAt: playerMessages.createdAt,
        version: sql<string>`xmin::text`,
      })
      .from(playerMessages)
      .where(
        and(
          eq(playerMessages.id, messageId),
          eq(playerMessages.editionSlug, edition),
          eq(playerMessages.playerId, playerId),
          eq(playerMessages.authorId, actor.osuId),
        ),
      )
      .for("update");
    if (!current) throw new HttpError(404, "Message not found.");
    if (current.version !== parsed.data.version)
      throw new HttpError(
        409,
        "This message has changed. Refresh before trying again.",
      );
    let result = null;
    if (operation === "edit" && "text" in parsed.data) {
      const [saved] = await tx
        .update(playerMessages)
        .set({ body: parsed.data.text as string })
        .where(eq(playerMessages.id, messageId))
        .returning({ version: sql<string>`xmin::text` });
      result = {
        id: messageId,
        authorId: actor.osuId,
        author: actor.username,
        text: parsed.data.text as string,
        createdAt: current.createdAt.toISOString(),
        version: saved.version,
      };
    } else
      await tx.delete(playerMessages).where(eq(playerMessages.id, messageId));
    await tx.insert(editionEvents).values({
      editionSlug: edition,
      actorId: actor.osuId,
      kind:
        operation === "edit"
          ? "player_message_edited"
          : "player_message_deleted",
      detail: { entity: { type: "player_message", id: messageId }, playerId },
    });
    return result;
  });
}

/** Only the explicitly selected text answer is projected; never return a questionnaire. */
export async function publicPlayerIntroductions(
  edition: string,
  ids: number[],
  questionId?: string | null,
) {
  if (!questionId || !ids.length) return new Map<number, string>();
  const rows = await db()
    .select({
      playerId: registrations.userId,
      bio: sql<string | null>`${registrations.answers}->>${questionId}`,
    })
    .from(registrations)
    .innerJoin(editionState, eq(editionState.slug, registrations.editionSlug))
    .where(
      and(
        eq(registrations.editionSlug, edition),
        inArray(registrations.userId, ids),
        eq(registrations.status, "accepted"),
        sql`${editionState.configuration}->>'published' = 'true'`,
        sql`${editionState.configuration}->'registration'->>'publicIntroductionQuestionId' = ${questionId}`,
      ),
    );
  return new Map(
    rows
      .filter((r) => typeof r.bio === "string")
      .map((r) => [r.playerId, r.bio!]),
  );
}
