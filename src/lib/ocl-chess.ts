import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { chessBoards, chessPlayers, chessEvents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  assertBusinessWrite,
  assertCapability,
  hasCapability,
} from "./auth/staff";
import type { User } from "./auth/sessions";
import { HttpError } from "./http";
import { chessAdminCommand, pixelCommand } from "./ocl-chess-model";
export async function readChess(user: User | null) {
  const [board] = await db()
    .select()
    .from(chessBoards)
    .where(eq(chessBoards.id, 1));
  if (!board) throw new HttpError(503, "The canvas is unavailable.");
  const [player] = user
    ? await db()
        .select()
        .from(chessPlayers)
        .where(eq(chessPlayers.userId, user.osuId))
    : [];
  return {
    ...board,
    nextAt: player?.nextAt.getTime() ?? 0,
    serverTime: Date.now(),
    signedIn: !!user,
    admin: !!user && (await hasCapability(user, "configure_tournament")),
  };
}
export async function writeChess(user: User, input: unknown, admin = false) {
  await assertBusinessWrite(user);
  const parsed = admin
    ? chessAdminCommand.safeParse(input)
    : pixelCommand.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid canvas operation.");
  const command = parsed.data;
  await db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '3s'`);
    const [board] = await tx
      .select()
      .from(chessBoards)
      .where(eq(chessBoards.id, 1))
      .for("update");
    if (!board) throw new HttpError(503, "The canvas is unavailable.");
    await assertBusinessWrite(user, undefined, tx);
    let pixels = board.pixels,
      enabled = board.enabled;
    if ("action" in command) {
      await assertCapability(user, "configure_tournament", undefined, tx);
      if (command.expectedRevision !== board.revision)
        throw new HttpError(409, "Canvas changed. Refresh before saving.");
      if (command.action === "toggle") enabled = command.enabled;
      else {
        const cells = pixels.split("");
        for (let y = command.y; y < command.y + command.height; y++)
          for (let x = command.x; x < command.x + command.width; x++)
            cells[y * 128 + x] = "0";
        pixels = cells.join("");
      }
    } else {
      const [prior] = await tx
        .select()
        .from(chessEvents)
        .where(eq(chessEvents.requestId, command.requestId));
      if (prior) {
        if (
          prior.actorId !== user.osuId ||
          JSON.stringify(prior.command) !== JSON.stringify(command)
        ) {
          // JSONB key order is not stable; compare individual fields.
          const old = prior.command as typeof command;
          if (
            prior.actorId !== user.osuId ||
            old.x !== command.x ||
            old.y !== command.y ||
            old.color !== command.color
          )
            throw new HttpError(409, "This request was already used.");
        }
        return;
      }
      if (!enabled) throw new HttpError(403, "The canvas is paused.");
      const clock = await tx.execute(sql`select clock_timestamp() as now`);
      const now = new Date(clock.rows[0].now as string);
      const [player] = await tx
        .select()
        .from(chessPlayers)
        .where(eq(chessPlayers.userId, user.osuId));
      if (player && player.nextAt > now)
        throw new HttpError(429, "Wait for the pixel cooldown.");
      const offset = command.y * 128 + command.x;
      pixels =
        pixels.slice(0, offset) +
        command.color.toString(16) +
        pixels.slice(offset + 1);
      const nextAt = new Date(now.getTime() + 30000);
      await tx
        .insert(chessPlayers)
        .values({ userId: user.osuId, nextAt })
        .onConflictDoUpdate({ target: chessPlayers.userId, set: { nextAt } });
    }
    await tx
      .update(chessBoards)
      .set({ pixels, enabled, revision: board.revision + 1 })
      .where(eq(chessBoards.id, 1));
    await tx
      .insert(chessEvents)
      .values({
        requestId: "requestId" in command ? command.requestId : randomUUID(),
        actorId: user.osuId,
        command,
        revision: board.revision + 1,
      });
  });
  return readChess(user);
}
