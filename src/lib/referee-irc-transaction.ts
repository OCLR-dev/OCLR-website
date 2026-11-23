import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import { HttpError } from "./http-error";
import type { RefereeWorkspace } from "./referee-workspace";
import { refereeIrcCommands as commands } from "@/db/schema";
import { observedIrcCommandStatus } from "./referee-irc-reads";

export type IrcTransaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];

/** Recheck both when queued and when claimed by the desktop relay. */
export function assertRefereeRoomClosable(workspace: RefereeWorkspace) {
  if (
    !workspace.canRecord ||
    !workspace.projection.complete ||
    workspace.session?.dependencyFingerprint !== workspace.dependencyFingerprint
  )
    throw new HttpError(409, "Complete the series before closing the room.");
}

export async function lockRefereeIrc(tx: IrcTransaction) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
}

export async function expireIrcCommands(
  tx: IrcTransaction,
  connectionId: string,
) {
  const rows = await tx
    .select()
    .from(commands)
    .where(
      and(
        eq(commands.connectionId, connectionId),
        inArray(commands.status, ["queued", "sending", "sent"]),
      ),
    );
  for (const command of rows) {
    const status = observedIrcCommandStatus(command);
    if (status !== command.status)
      await tx
        .update(commands)
        .set({ status })
        .where(eq(commands.id, command.id));
  }
}
