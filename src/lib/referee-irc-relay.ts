import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  fixtureReferees,
  fixtures,
  refereeIrcCommands as commands,
  refereeIrcConnections as connections,
  users,
} from "@/db/schema";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { HttpError } from "./http-error";
import { refereeCommand } from "./referee";
import { refereeCommands } from "./referee-commands";
import {
  allowedMakeCommand,
  confirmsIrcCommand,
  normalizedIrcUsername,
  safeIrcMessages,
} from "./referee-irc-model";
import {
  expireIrcCommands,
  lockRefereeIrc,
  type IrcTransaction,
} from "./referee-irc-transaction";
import {
  refereeRelayWrite,
  type RefereeRelayReceipt,
} from "./referee-relay-contract";
import { bpSyncSource, isBpNotice } from "./referee-sync";
import { assertRefereeAccess, readRefereeWorkspace } from "./referee-workspace";

type DesktopActor = User & { sessionId: string };

async function assigned(tx: IrcTransaction, actor: DesktopActor, fixtureId: string) {
  if (!refereeRelayWrite.parameters.fixtureId.safeParse(fixtureId).success)
    throw new HttpError(404, "Fixture not found.");
  const [f] = await tx
    .select()
    .from(fixtures)
    .where(eq(fixtures.id, fixtureId));
  if (!f) throw new HttpError(404, "Fixture not found.");
  await assertRefereeAccess(tx, actor, f.editionSlug, fixtureId, true);
  await assertOperationalEdition(f.editionSlug, tx);
  if (
    !(
      await tx
        .select()
        .from(fixtureReferees)
        .where(
          and(
            eq(fixtureReferees.fixtureId, fixtureId),
            eq(fixtureReferees.userId, actor.osuId),
          ),
        )
    ).length
  )
    throw new HttpError(403, "You are not assigned to this fixture.");
  return f.editionSlug;
}
export async function refereeIrcRelay(
  actor: DesktopActor,
  fixtureId: string,
  input: unknown,
): Promise<RefereeRelayReceipt> {
  const parsed = refereeRelayWrite.request.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid IRC relay request.");
  const action = parsed.data;
  return db().transaction(async (tx) => {
    await lockRefereeIrc(tx);
    const slug = await assigned(tx, actor, fixtureId);
    if (action.action === "bind") {
      if (
        normalizedIrcUsername(action.ircUsername) !==
        normalizedIrcUsername(actor.username)
      )
        throw new HttpError(
          403,
          "The IRC identity does not match the authorized osu! account.",
        );
      await tx
        .update(connections)
        .set({ status: "revoked", messages: [] })
        .where(eq(connections.fixtureId, fixtureId));
      await tx
        .update(commands)
        .set({ status: "unknown" })
        .where(
          and(
            eq(commands.fixtureId, fixtureId),
            inArray(commands.status, ["queued", "sending", "sent"]),
          ),
        );
      const [c] = await tx
        .insert(connections)
        .values({
          fixtureId,
          editionSlug: slug,
          actorId: actor.osuId,
          desktopSessionId: actor.sessionId,
          roomId: action.roomId,
          ircUsername: action.ircUsername,
        })
        .returning();
      return {
        connectionId: c.id,
        sequence: 0,
        command: null,
        receiptReasons: true,
        bpSync: true,
      };
    }
    const [c] = await tx
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, action.connectionId),
          eq(connections.fixtureId, fixtureId),
          eq(connections.actorId, actor.osuId),
          eq(connections.desktopSessionId, actor.sessionId),
        ),
      );
    if (!c || c.status === "revoked")
      throw new HttpError(403, "The IRC connection has been revoked.");
    if (action.action === "disconnect") {
      await tx
        .update(connections)
        .set({ status: "revoked", messages: [] })
        .where(eq(connections.id, c.id));
      await tx
        .update(commands)
        .set({ status: "unknown" })
        .where(
          and(
            eq(commands.connectionId, c.id),
            inArray(commands.status, ["queued", "sending", "sent"]),
          ),
        );
      return { connectionId: c.id, sequence: c.sequence, command: null };
    }
    if (action.sequence <= c.sequence)
      return { connectionId: c.id, sequence: c.sequence, command: null };
    if (
      action.roomId !== undefined &&
      c.roomId !== 0 &&
      c.roomId !== action.roomId
    )
      throw new HttpError(409, "The IRC room binding changed.");
    if (action.roomId !== undefined && c.roomId === 0) {
      const [creation] = await tx
        .select()
        .from(commands)
        .where(
          and(
            eq(commands.connectionId, c.id),
            eq(commands.target, "BanchoBot"),
          ),
        );
      if (
        !creation ||
        !allowedMakeCommand(creation.text) ||
        !["sending", "sent", "unknown"].includes(creation.status)
      )
        throw new HttpError(409, "No dispatched room creation.");
    }
    const messages = safeIrcMessages(action.projection.messages);
    await tx
      .update(connections)
      .set({
        sequence: action.sequence,
        bpSync: action.bpSync === true,
        ...(action.roomId !== undefined ? { roomId: action.roomId } : {}),
        status: action.projection.status,
        messages,
        lastSeenAt: new Date(),
      })
      .where(eq(connections.id, c.id));
    // Expire before processing receipts: a late reply cannot revive an expired
    // command or finalize a legacy BP intent after the ambiguity deadline.
    await expireIrcCommands(tx, c.id);
    for (const receipt of action.receipts) {
      const [command] = await tx
        .select()
        .from(commands)
        .where(
          and(
            eq(commands.id, receipt.commandId),
            eq(commands.connectionId, c.id),
          ),
        );
      if (!command || !["sending", "sent"].includes(command.status)) continue;
      if (receipt.status === "notified") {
        if (
          command.automation?.step !== "notice" ||
          !isBpNotice(command.text) ||
          command.selection
        )
          continue;
        await tx
          .update(commands)
          .set({ status: "notified" })
          .where(eq(commands.id, command.id));
        continue;
      }
      if (receipt.status === "confirmed") {
        if (
          !confirmsIrcCommand(command.text, command.target, receipt.evidence) ||
          !messages.some(
            (m) =>
              !command.baselineMessageIds.includes(m.id) &&
              m.sender === receipt.evidence?.sender &&
              m.text === receipt.evidence?.text,
          )
        )
          continue;
        if (command.selection) {
          const [issuer] = await tx
            .select()
            .from(users)
            .where(eq(users.osuId, command.actorId));
          try {
            if (!issuer)
              throw new HttpError(403, "Referee access has changed.");
            await refereeCommand(
              issuer,
              slug,
              fixtureId,
              {
                action: "record_selection",
                ...command.selection,
                requestKey: command.requestKey,
              },
              tx,
            );
          } catch (error) {
            if (!(error instanceof HttpError)) throw error;
            await tx
              .update(commands)
              .set({
                status: "record_failed",
                recordError: error.message,
                confirmedAt: new Date(),
              })
              .where(eq(commands.id, command.id));
            continue;
          }
        }
        await tx
          .update(commands)
          .set({ status: "confirmed", confirmedAt: new Date() })
          .where(eq(commands.id, command.id));
      } else
        await tx
          .update(commands)
          .set({
            status: receipt.status,
            ...(["failed", "unknown"].includes(receipt.status) && receipt.reason
              ? { recordError: `relay:${receipt.reason}` }
              : {}),
          })
          .where(eq(commands.id, command.id));
    }
    let command: null | { id: string; text: string; target: string } = null;
    if (
      action.projection.status === "connected" &&
      !(
        await tx
          .select()
          .from(commands)
          .where(
            and(
              eq(commands.connectionId, c.id),
              inArray(commands.status, ["sending", "sent"]),
            ),
          )
      ).length
    ) {
      const [queued] = await tx
        .select()
        .from(commands)
        .where(
          and(eq(commands.connectionId, c.id), eq(commands.status, "queued")),
        )
        .orderBy(commands.createdAt)
        .limit(1);
      if (queued) {
        const [issuer] = await tx
          .select()
          .from(users)
          .where(eq(users.osuId, queued.actorId));
        try {
          if (!issuer) throw new HttpError(403, "Referee access has changed.");
          await assertRefereeAccess(tx, issuer, slug, fixtureId, true);
          if (queued.automation) {
            const w = await readRefereeWorkspace(tx, issuer, slug, fixtureId);
            const a = queued.automation;
            const source = bpSyncSource(w, a.eventId);
            const [predecessor] = a.predecessorId
              ? await tx
                  .select()
                  .from(commands)
                  .where(eq(commands.id, a.predecessorId))
              : [];
            if (
              !source ||
              !w.canRecord ||
              source.selection.voided !== a.withdrawn ||
              (a.step !== "notice" &&
                w.projection.lastSelectionId !== a.selectionId) ||
              (w.session &&
                w.session.dependencyFingerprint !== w.dependencyFingerprint) ||
              (a.predecessorId &&
                (!predecessor ||
                  !["notified", "confirmed"].includes(predecessor.status)))
            )
              throw new HttpError(
                409,
                "Automatic BP sync stopped. Check the saved BP event and preceding IRC step.",
              );
            const text =
              a.step === "notice"
                ? source.text
                : refereeCommands({
                    settings: w.defaultSettings,
                    policy: w.policy?.commands ?? null,
                    rules: w.rules,
                    teams: w.teams,
                    selectedMap: source.map,
                  }).find((c) => c.kind === a.step)?.text;
            if (text !== queued.text)
              throw new HttpError(
                409,
                "The saved BP event changed. Reload before syncing.",
              );
          }
          if (queued.selection) {
            const w = await readRefereeWorkspace(tx, issuer, slug, fixtureId);
            if (
              (w.session?.revision ?? 0) !==
                queued.selection.expectedRevision ||
              w.dependencyFingerprint !==
                queued.selection.dependencyFingerprint ||
              (w.session &&
                w.session.dependencyFingerprint !== w.dependencyFingerprint)
            )
              throw new HttpError(
                409,
                "The referee workspace changed. Refresh before saving.",
              );
          }
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          await tx
            .update(commands)
            .set({ status: "failed", recordError: error.message })
            .where(eq(commands.id, queued.id));
          return {
            connectionId: c.id,
            sequence: action.sequence,
            command: null,
          };
        }
        await tx
          .update(commands)
          .set({
            status: "sending",
            dispatchedAt: new Date(),
            baselineMessageIds: messages.map((m) => m.id),
          })
          .where(eq(commands.id, queued.id));
        command = { id: queued.id, text: queued.text, target: queued.target };
      }
    }
    return { connectionId: c.id, sequence: action.sequence, command };
  });
}
