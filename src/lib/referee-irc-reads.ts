import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  refereeIrcCommands as commands,
  refereeIrcConnections as connections,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertRefereeAccess, readRefereeWorkspace } from "./referee-workspace";

type Reader = Pick<ReturnType<typeof db>, "select">;

export const isIrcConnected = (c: typeof connections.$inferSelect) =>
  c.status === "connected" &&
  !!c.lastSeenAt &&
  Date.now() - c.lastSeenAt.getTime() < 30_000;
export async function readLatestIrcConnection(
  reader: Reader,
  fixtureId: string,
) {
  return (
    await reader
      .select()
      .from(connections)
      .where(eq(connections.fixtureId, fixtureId))
      .orderBy(
        sql`CASE WHEN ${connections.status} = 'revoked' THEN 1 ELSE 0 END`,
        desc(connections.createdAt),
        desc(connections.id),
      )
      .limit(1)
  )[0];
}
/** Called under the shared referee write lock by authorized fixture services. */
export async function refereeIrcRoomId(reader: Reader, fixtureId: string) {
  const connection = await readLatestIrcConnection(reader, fixtureId);
  return connection && connection.status !== "revoked" && connection.roomId > 0
    ? connection.roomId
    : null;
}
/** Derive expiry on saved-only reads even when the desktop never polls again. */
export function observedIrcCommandStatus(command: typeof commands.$inferSelect) {
  if (
    command.status === "queued" &&
    Date.now() - command.createdAt.getTime() > 30_000
  )
    return "failed";
  if (
    ["sending", "sent"].includes(command.status) &&
    command.dispatchedAt &&
    Date.now() - command.dispatchedAt.getTime() > 45_000
  )
    return "unknown";
  return command.status;
}
/** Project a fixture whose access was checked in the caller's transaction. */
export async function readRefereeIrcState(
  reader: Reader,
  actor: User,
  slug: string,
  fixtureId: string,
) {
  const workspace = await readRefereeWorkspace(reader, actor, slug, fixtureId);
  const c = await readLatestIrcConnection(reader, fixtureId);
  const rows = c
    ? await reader
        .select()
        .from(commands)
        .where(eq(commands.connectionId, c.id))
        .orderBy(desc(commands.createdAt))
        .limit(50)
    : [];
  return {
    connection: c
      ? {
          id: c.id,
          roomId: c.roomId,
          ircUsername: c.ircUsername,
          status: c.status,
          lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
          connected: isIrcConnected(c),
          bpSync: c.bpSync,
        }
      : null,
    messages: c?.messages ?? [],
    commands: rows.reverse().map((r) => ({
      id: r.id,
      requestKey: r.requestKey,
      text: r.text,
      target: r.target,
      status: observedIrcCommandStatus(r),
      recordError: r.recordError,
      automation: r.automation,
      createdAt: r.createdAt.toISOString(),
    })),
    workspace,
  };
}
export async function refereeIrcView(
  actor: User,
  slug: string,
  fixtureId: string,
) {
  return db().transaction(
    async (tx) => {
      await assertRefereeAccess(tx, actor, slug, fixtureId);
      return readRefereeIrcState(tx, actor, slug, fixtureId);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
