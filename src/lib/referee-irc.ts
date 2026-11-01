import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  fixtures,
  fixtureReferees,
  users,
  refereeIrcConnections as connections,
  refereeIrcCommands as commands,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { HttpError } from "./http";
import {
  assertRefereeAccess,
  readRefereeWorkspace,
  refereeCommand,
} from "./referee";
import { validateRefereeAction } from "./referee-model";
import {
  allowedIrcCommand,
  allowedMakeCommand,
  confirmsIrcCommand,
  ircQueueSchema,
  normalizedIrcUsername,
  relaySchema,
  safeIrcMessages,
} from "./referee-irc-model";
import { bpSyncSource, isBpNotice } from "./referee-sync";
import { refereeCommands } from "./referee-commands";
import { assertOperationalEdition } from "./archive-guard";
type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type DesktopActor = User & { sessionId: string };
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isConnected = (c: typeof connections.$inferSelect) =>
  c.status === "connected" &&
  !!c.lastSeenAt &&
  Date.now() - c.lastSeenAt.getTime() < 30_000;
async function latest(tx: Tx, fixtureId: string) {
  return (
    await tx
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
async function expire(tx: Tx, connectionId: string) {
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
    const status = observedCommandStatus(command);
    if (status !== command.status)
      await tx
        .update(commands)
        .set({ status })
        .where(eq(commands.id, command.id));
  }
}
/** Derive expiry on saved-only reads even when the desktop never polls again. */
function observedCommandStatus(command: typeof commands.$inferSelect) {
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
async function view(tx: Tx, actor: User, slug: string, fixtureId: string) {
  const workspace = await readRefereeWorkspace(tx, actor, slug, fixtureId);
  const c = await latest(tx, fixtureId);
  const rows = c
    ? await tx
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
          connected: isConnected(c),
          bpSync: c.bpSync,
        }
      : null,
    messages: c?.messages ?? [],
    commands: rows.reverse().map((r) => ({
      id: r.id,
      requestKey: r.requestKey,
      text: r.text,
      target: r.target,
      status: observedCommandStatus(r),
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
      return view(tx, actor, slug, fixtureId);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
async function lock(tx: Tx) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
}
export async function refereeIrcBrowserCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
) {
  await assertCapability(actor, "record_results", slug);
  const parsed = ircQueueSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid IRC command request.");
  const action = parsed.data;
  return db().transaction(async (tx) => {
    await lock(tx);
    await assertRefereeAccess(tx, actor, slug, fixtureId, true);
    await assertOperationalEdition(slug, tx);
    const c = await latest(tx, fixtureId);
    if (action.action === "disconnect") {
      if (c) {
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
      }
      return view(tx, actor, slug, fixtureId);
    }
    if (action.action === "sync_selection") {
      const w = await readRefereeWorkspace(tx, actor, slug, fixtureId);
      const source = bpSyncSource(w, action.eventId);
      if (!source || source.event.actorId !== actor.osuId)
        throw new HttpError(
          409,
          "Choose a saved BP event from your current fixture.",
        );
      const prior = await tx
        .select()
        .from(commands)
        .where(
          and(
            eq(commands.fixtureId, fixtureId),
            eq(commands.actorId, actor.osuId),
            eq(commands.requestKey, action.eventId),
          ),
        );
      if (prior.length) {
        if (
          prior[0].automation?.eventId !== action.eventId ||
          prior[0].automation?.step !== "notice"
        )
          throw new HttpError(
            409,
            "This request key was already used for a different operation.",
          );
        return view(tx, actor, slug, fixtureId);
      }
      if (!c || !isConnected(c) || !c.roomId)
        throw new HttpError(
          409,
          "Connect the local IRC app to this fixture first.",
        );
      if (!c.bpSync)
        throw new HttpError(
          409,
          "Update OCLR IRC and reconnect to use automatic BP sync.",
        );
      if (
        !w.canRecord ||
        source.selection.voided !== source.withdrawn ||
        (w.session &&
          w.session.dependencyFingerprint !== w.dependencyFingerprint)
      )
        throw new HttpError(
          409,
          "The saved BP event changed. Reload before syncing.",
        );
      const generated = refereeCommands({
        settings: w.defaultSettings,
        policy: w.policy?.commands ?? null,
        rules: w.rules,
        teams: w.teams,
        selectedMap: source.map,
      });
      const plan: { step: "notice" | "map" | "mods"; text: string }[] = [
        { step: "notice", text: source.text },
      ];
      if (!source.withdrawn && source.selection.kind !== "ban") {
        for (const step of ["map", "mods"] as const) {
          const text = generated.find((c) => c.kind === step)?.text;
          if (!text || !allowedIrcCommand(text))
            throw new HttpError(
              409,
              "Configure the saved map and Mods rules before automatic BP sync.",
            );
          plan.push({ step, text });
        }
      }
      const [last] = await tx
        .select({ createdAt: commands.createdAt })
        .from(commands)
        .where(eq(commands.connectionId, c.id))
        .orderBy(desc(commands.createdAt))
        .limit(1);
      const baseTime = Math.max(
        Date.now(),
        (last?.createdAt.getTime() ?? 0) + 1,
      );
      let predecessorId: string | null = null;
      for (const [index, item] of plan.entries()) {
        const id = randomUUID();
        await tx.insert(commands).values({
          id,
          fixtureId,
          connectionId: c.id,
          actorId: actor.osuId,
          requestKey: index === 0 ? action.eventId : id,
          requestHash: digest({ eventId: action.eventId, step: item.step }),
          text: item.text,
          target: `#mp_${c.roomId}`,
          createdAt: new Date(baseTime + index),
          automation: {
            eventId: action.eventId,
            selectionId: source.selectionId,
            withdrawn: source.withdrawn,
            step: item.step,
            predecessorId,
          },
        });
        predecessorId = id;
      }
      return view(tx, actor, slug, fixtureId);
    }
    const [prior] = await tx
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.fixtureId, fixtureId),
          eq(commands.actorId, actor.osuId),
          eq(commands.requestKey, action.requestKey),
        ),
      );
    if (prior) {
      if (prior.requestHash !== digest(action))
        throw new HttpError(
          409,
          "This request key was already used for a different operation.",
        );
      return view(tx, actor, slug, fixtureId);
    }
    if (!c || !isConnected(c))
      throw new HttpError(
        409,
        "Connect the local IRC app to this fixture first.",
      );
    if (
      c.roomId === 0 &&
      (await tx.select().from(commands).where(eq(commands.connectionId, c.id)))
        .length
    )
      throw new HttpError(
        409,
        "Check the previous room creation in the local IRC app before reconnecting.",
      );
    await expire(tx, c.id);
    if (
      (
        await tx
          .select()
          .from(commands)
          .where(
            and(
              eq(commands.connectionId, c.id),
              inArray(commands.status, ["queued", "sending", "sent"]),
            ),
          )
      ).length
    )
      throw new HttpError(
        409,
        "Wait for the current IRC command before sending another.",
      );
    if (
      !(c.roomId === 0
        ? allowedMakeCommand(action.text) && !action.selection
        : allowedIrcCommand(action.text))
    )
      throw new HttpError(
        400,
        "This IRC command is not available for remote sending.",
      );
    if (action.selection) {
      const w = await readRefereeWorkspace(tx, actor, slug, fixtureId);
      if (
        (w.session?.revision ?? 0) !== action.selection.expectedRevision ||
        w.dependencyFingerprint !== action.selection.dependencyFingerprint ||
        (w.session &&
          w.session.dependencyFingerprint !== w.dependencyFingerprint)
      )
        throw new HttpError(
          409,
          "The referee workspace changed. Refresh before saving.",
        );
      const m = w.maps.find((m) => m.id === action.selection!.entryId);
      const mode = w.rules
        ? ({ osu: 0, taiko: 1, fruits: 2, mania: 3 } as const)[w.rules.mode]
        : null;
      if (
        !m ||
        mode === null ||
        action.text !== `!mp map ${m.beatmapId} ${mode}`
      )
        throw new HttpError(
          400,
          "The IRC command does not match the selected map.",
        );
      try {
        validateRefereeAction(
          {
            ...(w.session?.basis ?? {
              policy: w.policy,
              teamIds: w.teams.map((t) => t.id),
              maps: w.maps,
              series: w.series,
            }),
            orders: {
              firstBanTeamId: w.session?.firstBanTeamId ?? null,
              firstPickTeamId: w.session?.firstPickTeamId ?? null,
            },
            events: w.events,
          },
          { action: "record_selection", entryId: m.id },
        );
      } catch {
        throw new HttpError(
          409,
          "This map is not available for the current BP step.",
        );
      }
    }
    await tx.insert(commands).values({
      connectionId: c.id,
      fixtureId,
      actorId: actor.osuId,
      requestKey: action.requestKey,
      requestHash: digest(action),
      text: action.text,
      target: c.roomId === 0 ? "BanchoBot" : `#mp_${c.roomId}`,
      selection: action.selection ?? null,
    });
    return view(tx, actor, slug, fixtureId);
  });
}
async function assigned(tx: Tx, actor: DesktopActor, fixtureId: string) {
  if (!z.uuid().safeParse(fixtureId).success)
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
) {
  const parsed = relaySchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid IRC relay request.");
  const action = parsed.data;
  return db().transaction(async (tx) => {
    await lock(tx);
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
    await expire(tx, c.id);
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
