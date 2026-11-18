import { db } from "@/db";
import {
  liruGalleryMessageEvents,
  liruGalleryMessages,
  users,
} from "@/db/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { User } from "./auth/sessions";
import { assertUserWriteChannel } from "./auth/staff";
import { remoteMode } from "./data-source";
import { frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import {
  deleteLiruGalleryMessageWrite,
  editLiruGalleryMessageWrite,
  postLiruGalleryMessageWrite,
} from "./liru-gallery-message-write-contract";
import type { PlayerMessage } from "./player-messages";

const messageFields = {
  id: liruGalleryMessages.id,
  text: liruGalleryMessages.body,
  createdAt: liruGalleryMessages.createdAt,
  version: sql<string>`liru_gallery_messages.xmin::text`,
};

export async function publicLiruGalleryMessages(): Promise<PlayerMessage[]> {
  if (remoteMode())
    return frontendResource<PlayerMessage[]>("publicLiruGalleryMessages", {});
  const rows = await db()
    .select({
      ...messageFields,
      authorId: users.osuId,
      author: users.username,
    })
    .from(liruGalleryMessages)
    .innerJoin(users, eq(users.osuId, liruGalleryMessages.authorId))
    .orderBy(desc(liruGalleryMessages.createdAt), desc(liruGalleryMessages.id));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

function signedMessage(
  actor: User,
  row: Omit<PlayerMessage, "author" | "authorId" | "createdAt"> & {
    createdAt: Date;
  },
): PlayerMessage {
  return {
    ...row,
    authorId: actor.osuId,
    author: actor.username,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function postLiruGalleryMessage(actor: User, input: unknown) {
  assertUserWriteChannel();
  const parsed = postLiruGalleryMessageWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Enter a message of 1 to 1000 characters.");
  const { text, requestId } = parsed.data;
  return db().transaction(async (tx) => {
    // Keep retries and the posting limit consistent across concurrent requests.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`liru-gallery-message:${actor.osuId}`}, 0))`,
    );
    const [receipt] = await tx
      .select({ messageId: liruGalleryMessageEvents.messageId })
      .from(liruGalleryMessageEvents)
      .where(
        and(
          eq(liruGalleryMessageEvents.authorId, actor.osuId),
          eq(liruGalleryMessageEvents.requestId, requestId),
        ),
      );
    if (receipt) {
      const [existing] = await tx
        .select(messageFields)
        .from(liruGalleryMessages)
        .where(
          and(
            eq(liruGalleryMessages.id, receipt.messageId),
            eq(liruGalleryMessages.authorId, actor.osuId),
          ),
        )
        .for("update");
      if (!existing || existing.text !== text)
        throw new HttpError(409, "This message request has already been used.");
      return signedMessage(actor, existing);
    }
    const recent = await tx.$count(
      liruGalleryMessageEvents,
      and(
        eq(liruGalleryMessageEvents.authorId, actor.osuId),
        eq(liruGalleryMessageEvents.kind, "posted"),
        gt(
          liruGalleryMessageEvents.createdAt,
          sql`now() - interval '1 minute'`,
        ),
      ),
    );
    if (recent >= 5)
      throw new HttpError(429, "Please wait before posting another message.");
    const [saved] = await tx
      .insert(liruGalleryMessages)
      .values({ authorId: actor.osuId, body: text })
      .returning(messageFields);
    await tx.insert(liruGalleryMessageEvents).values({
      authorId: actor.osuId,
      messageId: saved.id,
      requestId,
      kind: "posted",
    });
    return signedMessage(actor, saved);
  });
}

export async function changeLiruGalleryMessage(
  actor: User,
  messageId: string,
  operation: "edit" | "delete",
  input: unknown,
) {
  assertUserWriteChannel();
  const parsed =
    operation === "edit"
      ? {
          operation,
          input: editLiruGalleryMessageWrite.request.safeParse(input),
        }
      : {
          operation,
          input: deleteLiruGalleryMessageWrite.request.safeParse(input),
        };
  if (
    !parsed.input.success ||
    !editLiruGalleryMessageWrite.parameters.messageId.safeParse(messageId)
      .success
  )
    throw new HttpError(400, "Check the message and try again.");
  const version = parsed.input.data.version;
  const text = parsed.operation === "edit" ? parsed.input.data.text : undefined;
  const owned = and(
    eq(liruGalleryMessages.id, messageId),
    eq(liruGalleryMessages.authorId, actor.osuId),
  );
  return db().transaction(async (tx) => {
    const [current] = await tx
      .select({ version: messageFields.version })
      .from(liruGalleryMessages)
      .where(owned)
      .for("update");
    if (!current) throw new HttpError(404, "Message not found.");
    if (current.version !== version)
      throw new HttpError(
        409,
        "This message has changed. Refresh before trying again.",
      );
    let result: PlayerMessage | null = null;
    if (text !== undefined) {
      const [saved] = await tx
        .update(liruGalleryMessages)
        .set({ body: text })
        .where(owned)
        .returning(messageFields);
      result = signedMessage(actor, saved);
    } else await tx.delete(liruGalleryMessages).where(owned);
    await tx.insert(liruGalleryMessageEvents).values({
      authorId: actor.osuId,
      messageId,
      kind: operation === "edit" ? "edited" : "deleted",
    });
    return result;
  });
}
