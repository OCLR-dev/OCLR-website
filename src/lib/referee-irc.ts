import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  refereeIrcCommands as commands,
  refereeIrcConnections as connections,
} from "@/db/schema";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { HttpError } from "./http-error";
import { refereeCommands } from "./referee-commands";
import { changeRefereeIrcBrowserWrite } from "./referee-irc-browser-contract";
import { allowedIrcCommand, allowedMakeCommand } from "./referee-irc-model";
import {
  isIrcConnected,
  readLatestIrcConnection,
  readRefereeIrcState,
} from "./referee-irc-reads";
import { expireIrcCommands, lockRefereeIrc } from "./referee-irc-transaction";
import { validateRefereeAction } from "./referee-model";
import { bpSyncSource } from "./referee-sync";
import { assertRefereeAccess, readRefereeWorkspace } from "./referee-workspace";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function refereeIrcBrowserCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
) {
  await assertCapability(actor, "record_results", slug);
  const parsed = changeRefereeIrcBrowserWrite.request.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid IRC command request.");
  const action = parsed.data;
  return db().transaction(async (tx) => {
    await lockRefereeIrc(tx);
    await assertRefereeAccess(tx, actor, slug, fixtureId, true);
    await assertOperationalEdition(slug, tx);
    const c = await readLatestIrcConnection(tx, fixtureId);
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
      return readRefereeIrcState(tx, actor, slug, fixtureId);
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
        return readRefereeIrcState(tx, actor, slug, fixtureId);
      }
      if (!c || !isIrcConnected(c) || !c.roomId)
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
      return readRefereeIrcState(tx, actor, slug, fixtureId);
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
      return readRefereeIrcState(tx, actor, slug, fixtureId);
    }
    if (!c || !isIrcConnected(c))
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
    await expireIrcCommands(tx, c.id);
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
    return readRefereeIrcState(tx, actor, slug, fixtureId);
  });
}
