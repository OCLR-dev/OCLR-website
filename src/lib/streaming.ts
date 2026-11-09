import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { db } from "@/db";
import {
  editionEvents,
  editionState,
  fixtureCommentators,
  fixtureStreams,
  fixtures,
  matchResults,
  resultRevisions,
} from "@/db/schema";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability, permits, staffAccess } from "./auth/staff";
import { HttpError } from "./http-error";
import {
  streamingTaskWrite,
  type StreamingTaskReceipt,
} from "./scheduling-write-contracts";
import { eligibleBroadcastStaff } from "./streaming-staff";

export async function streamingCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
): Promise<StreamingTaskReceipt> {
  const access = await staffAccess(actor);
  if (
    !permits(access, "select_streaming", slug) &&
    !permits(access, "manage_streaming", slug)
  )
    throw new HttpError(403, "You do not have permission for this operation.");
  const parsed = streamingTaskWrite.request.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(fixtureId).success)
    throw new HttpError(400, "Confirm a valid streaming task change.");
  const c = parsed.data;
  const commentaryTask = c.task === "commentary";
  const table = commentaryTask ? fixtureCommentators : fixtureStreams;
  if (
    (c.action === "assign" && c.userId === undefined && !c.userIds) ||
    (c.userIds !== undefined &&
      (c.action !== "assign" || !commentaryTask || c.userId !== undefined)) ||
    (c.userId !== undefined &&
      c.action !== "assign" &&
      !(commentaryTask && (c.action === "cancel" || c.action === "reconfirm")))
  )
    throw new HttpError(
      400,
      "Only assignment or an individual commentary change accepts a target user.",
    );
  await assertCapability(
    actor,
    c.action === "assign"
      ? "manage_streaming"
      : c.action === "select"
        ? "select_streaming"
        : "view_streaming",
    slug,
  );
  return db().transaction(async (tx) => {
    // Same lock as role management; eligibility/revocation and writes are serialized.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await assertCapability(
      actor,
      c.action === "assign"
        ? "manage_streaming"
        : c.action === "select"
          ? "select_streaming"
          : "view_streaming",
      slug,
      tx,
    );
    const [state] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    if (!state?.configuration)
      throw new HttpError(404, "Tournament not found.");
    const command = { ...c, fixtureId };
    const [prior] = await tx
      .select()
      .from(editionEvents)
      .where(eq(editionEvents.id, c.requestKey));
    if (prior) {
      if (
        prior.kind !== "streaming_task" ||
        prior.actorId !== actor.osuId ||
        prior.editionSlug !== slug ||
        !isDeepStrictEqual(prior.detail.command, command)
      )
        throw new HttpError(
          409,
          "This request key was already used for a different operation.",
        );
      return { saved: true, replayed: true };
    }
    await assertOperationalEdition(slug, tx);
    const [fixture] = await tx
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)))
      .for("update");
    if (!fixture) throw new HttpError(404, "Fixture not found.");
    const beforeRows = await tx
      .select()
      .from(table)
      .where(
        and(
          eq(table.fixtureId, fixtureId),
          commentaryTask
            ? c.userIds
              ? inArray(table.userId, c.userIds)
              : eq(table.userId, c.userId ?? actor.osuId)
            : undefined,
        ),
      );
    const before = beforeRows[0];
    const grants = await staffAccess(actor, tx);
    const manager = permits(grants, "manage_streaming", slug);
    if ((c.action === "cancel" || c.action === "reconfirm") && !manager) {
      await assertCapability(actor, "select_streaming", slug, tx);
      const eligible = await eligibleBroadcastStaff(
        tx,
        slug,
        commentaryTask ? "commentator" : "streamer",
      );
      if (
        before?.userId !== actor.osuId ||
        !eligible.some((user) => user.osuId === actor.osuId)
      )
        throw new HttpError(
          403,
          "You may change only your own streaming task.",
        );
    }
    if (
      fixture.streamRevision !== c.expectedRevision ||
      fixture.version !== c.expectedFixtureVersion
    )
      throw new HttpError(
        409,
        "The fixture or streaming task changed. Refresh before continuing.",
      );
    if (c.action !== "cancel") {
      const [approved] = await tx
        .select({ id: resultRevisions.fixtureId })
        .from(resultRevisions)
        .where(
          and(
            eq(resultRevisions.fixtureId, fixtureId),
            isNotNull(resultRevisions.approvedAt),
          ),
        )
        .limit(1);
      const [result] = await tx
        .select()
        .from(matchResults)
        .where(eq(matchResults.fixtureId, fixtureId));
      if (
        fixture.status !== "scheduled" ||
        approved ||
        result?.state === "approved" ||
        state.configuration.status === "completed"
      )
        throw new HttpError(
          409,
          "Only upcoming, unfinished fixtures accept streaming bookings.",
        );
      const target =
        c.action === "assign"
          ? c.userId!
          : c.action === "reconfirm"
            ? before?.userId
            : actor.osuId;
      const targets = c.userIds ?? (target ? [target] : []);
      const eligible = await eligibleBroadcastStaff(
        tx,
        slug,
        commentaryTask ? "commentator" : "streamer",
      );
      if (
        !targets.length ||
        targets.some((id) => !eligible.some((u) => u.osuId === id))
      )
        throw new HttpError(
          400,
          commentaryTask
            ? "Choose an active Commentator authorized for this edition."
            : "Choose an active Streamer authorized for this edition.",
        );
      if (
        before &&
        (c.action === "select" || (commentaryTask && c.action === "assign"))
      )
        throw new HttpError(
          409,
          commentaryTask
            ? "This Commentator already has a task for this fixture."
            : "This fixture already has a Streamer. Self-selection cannot replace a booking.",
        );
      if (c.action === "reconfirm" && !before)
        throw new HttpError(409, "There is no streaming task to reconfirm.");
      if (c.action === "reconfirm") {
        await tx
          .update(table)
          .set({
            confirmedScheduledAt: fixture.scheduledAt,
            confirmedTimeZone: fixture.timeZone,
          })
          .where(
            and(
              eq(table.fixtureId, fixtureId),
              eq(table.userId, before!.userId),
            ),
          );
      } else {
        const values = {
          fixtureId,
          userId: targets[0],
          source:
            c.action === "select" ? ("self" as const) : ("staff" as const),
          assignedBy: actor.osuId,
          assignedAt: new Date(),
          confirmedScheduledAt: fixture.scheduledAt,
          confirmedTimeZone: fixture.timeZone,
        };
        if (commentaryTask)
          await tx
            .insert(fixtureCommentators)
            .values(targets.map((userId) => ({ ...values, userId })));
        else
          await tx.insert(fixtureStreams).values(values).onConflictDoUpdate({
            target: fixtureStreams.fixtureId,
            set: values,
          });
      }
    } else {
      if (!before)
        throw new HttpError(409, "There is no streaming task to cancel.");
      await tx
        .delete(table)
        .where(
          and(eq(table.fixtureId, fixtureId), eq(table.userId, before.userId)),
        );
    }
    await tx
      .update(fixtures)
      .set({ streamRevision: fixture.streamRevision + 1 })
      .where(eq(fixtures.id, fixtureId));
    const afterRows = await tx
      .select()
      .from(table)
      .where(
        and(
          eq(table.fixtureId, fixtureId),
          commentaryTask
            ? c.userIds
              ? inArray(table.userId, c.userIds)
              : eq(table.userId, c.userId ?? actor.osuId)
            : undefined,
        ),
      );
    await tx.insert(editionEvents).values({
      id: c.requestKey,
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "streaming_task",
      detail: {
        entity: { type: "fixture", id: fixtureId },
        fixtureId,
        command,
        before: c.userIds ? beforeRows : (before ?? null),
        after: c.userIds ? afterRows : (afterRows[0] ?? null),
        fixture: {
          label: fixture.label,
          scheduledAt: fixture.scheduledAt,
          timeZone: fixture.timeZone,
          version: fixture.version,
        },
        revision: fixture.streamRevision + 1,
      },
    });
    return { saved: true, replayed: false };
  });
}
