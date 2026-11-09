import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import { refereeIrcCommands as commands } from "@/db/schema";
import { observedIrcCommandStatus } from "./referee-irc-reads";

export type IrcTransaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];

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
