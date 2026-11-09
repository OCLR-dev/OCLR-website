import { db } from "@/db";
import {
  editionState,
  fixtures,
  refereeEvents,
  refereeSessions,
  resultAuditEvents,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { hashToken } from "./auth/tokens";
import type { RefereeBasis } from "./fixture-read-contracts";
import { HttpError } from "./http-error";
import {
  validateRefereeAction,
  type RefereeEventPayload,
} from "./referee-model";
import { assertRefereeAccess, readRefereeWorkspace } from "./referee-workspace";
import {
  changeRefereeWorkspaceWrite,
  type RefereeCommandResult,
} from "./referee-write-contracts";
import { persistRoundRefereePolicy } from "./round-referee-policy";

type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];

/** Writes share role, edition, and fixture locks with existing staff/result services. */
export async function refereeCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
  transaction?: Transaction,
): Promise<RefereeCommandResult> {
  await assertCapability(actor, "record_results", slug);
  const parsed = changeRefereeWorkspaceWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Choose valid referee settings and the current workspace revision.",
    );
  const command = parsed.data;
  if (!z.uuid().safeParse(fixtureId).success)
    throw new HttpError(404, "Fixture not found.");
  const execute = async (tx: Transaction) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await tx
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)))
      .for("update");
    await assertRefereeAccess(tx, actor, slug, fixtureId, true);
    await assertOperationalEdition(slug, tx);
    const workspace = await readRefereeWorkspace(tx, actor, slug, fixtureId);
    const requestHash = hashToken(JSON.stringify(command));
    const [prior] = await tx
      .select()
      .from(refereeEvents)
      .where(
        and(
          eq(refereeEvents.fixtureId, fixtureId),
          eq(refereeEvents.actorId, actor.osuId),
          eq(refereeEvents.requestKey, command.requestKey),
        ),
      );
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new HttpError(
          409,
          "This request key was already used for a different operation.",
        );
      return {
        receipt: {
          requestKey: command.requestKey,
          revision: prior.ordinal,
          eventId: prior.id,
        },
        workspace,
      };
    }
    if (!workspace.canRecord)
      throw new HttpError(409, "This fixture cannot record referee activity.");
    const revision = workspace.session?.revision ?? 0;
    if (command.expectedRevision !== revision)
      throw new HttpError(
        409,
        "The referee workspace changed. Refresh before saving.",
      );
    if (command.dependencyFingerprint !== workspace.dependencyFingerprint)
      throw new HttpError(
        409,
        "Fixture dependencies changed. Refresh before saving.",
      );
    const stale = Boolean(
      workspace.session &&
      workspace.session.dependencyFingerprint !==
        workspace.dependencyFingerprint,
    );
    if (
      stale &&
      !["void_last", "reconfirm_dependencies"].includes(command.action)
    )
      throw new HttpError(
        409,
        "Fixture dependencies changed. Withdraw affected steps and recheck the saved configuration.",
      );
    const currentBasis: RefereeBasis = {
      policy: workspace.policy,
      teamIds: workspace.teams.map((t) => t.id),
      maps: workspace.maps.map(({ id, beatmapId, category, position }) => ({
        id,
        beatmapId,
        category,
        position,
      })),
      series: workspace.series,
      tiedMapPolicy: workspace.rules?.tiedMapPolicy ?? "require_replay",
      exPlayersPerTeam: workspace.rules?.exPlayersPerTeam,
      ...(workspace.round.exhibition && workspace.session?.basis.skipBans
        ? { skipBans: true as const }
        : {}),
    };
    let basis = workspace.session?.basis ?? currentBasis;
    let dependencyFingerprint =
      workspace.session?.dependencyFingerprint ??
      workspace.dependencyFingerprint;
    let settings = workspace.defaultSettings;
    let firstBanTeamId = workspace.session?.firstBanTeamId ?? null;
    let firstPickTeamId = workspace.session?.firstPickTeamId ?? null;
    let payload: RefereeEventPayload;
    if (command.action === "configure_policy") {
      const newRevision = await persistRoundRefereePolicy(
        tx,
        actor,
        slug,
        workspace.round.id,
        command.expectedPolicyRevision,
        command.policy,
      );
      const next = await readRefereeWorkspace(tx, actor, slug, fixtureId);
      // Every session inherits the newly saved policy.
      settings = next.defaultSettings;
      basis = { ...currentBasis, policy: command.policy };
      dependencyFingerprint = next.dependencyFingerprint;
      payload = {
        type: "policy_configured",
        policy: command.policy,
        revision: newRevision,
      };
    } else if (command.action === "save_settings") {
      // Retain the legacy action and idempotent receipts without allowing overrides.
      if (!isDeepStrictEqual(command.settings, workspace.defaultSettings))
        throw new HttpError(
          409,
          "Room settings inherit the saved round rules and streaming task. Reload the workspace.",
        );
      payload = { type: "settings_saved", settings };
    } else if (command.action === "reconfirm_dependencies") {
      if (workspace.projection.activeSelections.length)
        throw new HttpError(
          409,
          "Withdraw recorded steps before confirming changed dependencies.",
        );
      basis = currentBasis;
      dependencyFingerprint = workspace.dependencyFingerprint;
      if (!basis.teamIds.includes(firstBanTeamId ?? "")) firstBanTeamId = null;
      if (!basis.teamIds.includes(firstPickTeamId ?? ""))
        firstPickTeamId = null;
      payload = { type: "dependencies_reconfirmed" };
    } else {
      if (
        command.action !== "void_last" &&
        command.action !== "set_order" &&
        workspace.readiness.length
      )
        throw new HttpError(409, workspace.readiness[0]);
      try {
        payload = validateRefereeAction(
          {
            ...basis,
            orders: { firstBanTeamId, firstPickTeamId },
            events: workspace.events,
          },
          command,
          workspace.round.exhibition,
        );
      } catch (error) {
        throw new HttpError(
          409,
          error instanceof Error
            ? error.message
            : "This referee action is not available.",
        );
      }
      if (payload.type === "order_set") {
        firstBanTeamId = payload.firstBanTeamId;
        firstPickTeamId = payload.firstPickTeamId;
        basis = { ...basis, skipBans: payload.skipBans };
      }
    }
    const nextRevision = revision + 1;
    const state = {
      revision: nextRevision,
      firstBanTeamId: workspace.fixture.openExhibition ? null : firstBanTeamId,
      firstPickTeamId: workspace.fixture.openExhibition
        ? null
        : firstPickTeamId,
      exhibitionOrder: workspace.fixture.openExhibition
        ? { firstBanTeamId, firstPickTeamId }
        : null,
      settings,
      basis,
      dependencyFingerprint,
      updatedAt: new Date(),
    };
    await tx
      .insert(refereeSessions)
      .values({ fixtureId, editionSlug: slug, ...state })
      .onConflictDoUpdate({ target: refereeSessions.fixtureId, set: state });
    const eventId = randomUUID();
    await tx.insert(refereeEvents).values({
      id: eventId,
      fixtureId,
      ordinal: nextRevision,
      actorId: actor.osuId,
      requestKey: command.requestKey,
      requestHash,
      payload,
    });
    await tx.insert(resultAuditEvents).values({
      fixtureId,
      actorId: actor.osuId,
      action: `referee_${command.action}`,
      detail: {
        entity: { type: "referee_session", id: fixtureId },
        before: {
          revision,
          dependencyFingerprint:
            workspace.session?.dependencyFingerprint ?? null,
          firstBanTeamId: workspace.session?.firstBanTeamId ?? null,
          firstPickTeamId: workspace.session?.firstPickTeamId ?? null,
        },
        after: {
          revision: nextRevision,
          eventId,
          payload,
          dependencyFingerprint,
          firstBanTeamId,
          firstPickTeamId,
        },
      },
    });
    return {
      receipt: {
        requestKey: command.requestKey,
        revision: nextRevision,
        eventId,
      },
      workspace: await readRefereeWorkspace(tx, actor, slug, fixtureId),
    };
  };
  return transaction ? execute(transaction) : db().transaction(execute);
}
