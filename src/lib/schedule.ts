import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  editionEvents,
  editionState,
  fixtures,
  resultAuditEvents,
  scheduleAvailability,
  scheduleEvents,
  scheduleRequests,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertUserWriteChannel } from "./auth/staff";
import { HttpError } from "./http-error";
import {
  assertScheduleBrowserChannel,
  readScheduleContext,
} from "./schedule-data";
import { activeSchedule, scheduleStatus } from "./schedule-model";
import {
  scheduleRequestWrite,
  type ScheduleRequestReceipt,
} from "./scheduling-write-contracts";

export async function scheduleCommand(
  actor: User,
  slug: string,
  input: unknown,
): Promise<ScheduleRequestReceipt> {
  assertScheduleBrowserChannel();
  assertUserWriteChannel();
  const parsed = scheduleRequestWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Enter valid schedule details and the current revision.",
    );
  const cmd = parsed.data;
  const hash = createHash("sha256").update(JSON.stringify(cmd)).digest("hex");
  return db().transaction(async (tx) => {
    // Same lock order as role changes, fixture editing, results and referee start.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    assertUserWriteChannel();
    const c = await readScheduleContext(tx, actor, slug);
    const f = c.matches.find((m) => m.fixture.id === cmd.fixtureId)?.fixture;
    if (
      !f ||
      (!c.admin &&
        (!c.confirmedIds.has(f.id) ||
          ![f.homeTeamId, f.awayTeamId].includes(c.own!.membership.teamId)))
    )
      throw new HttpError(404, "Fixture not found.");
    const [prior] = await tx
      .select()
      .from(scheduleEvents)
      .where(
        and(
          eq(scheduleEvents.editionSlug, slug),
          eq(scheduleEvents.actorId, actor.osuId),
          eq(scheduleEvents.requestKey, cmd.requestKey),
        ),
      );
    if (prior) {
      if (prior.requestHash !== hash)
        throw new HttpError(
          409,
          "This request key was already used for a different operation.",
        );
      return { saved: true };
    }
    const live = c.match(f);
    if (!live.eligible || !live.basis)
      throw new HttpError(
        409,
        "This fixture is no longer available for rescheduling.",
      );
    if (f.version !== cmd.expectedFixtureVersion)
      throw new HttpError(
        409,
        "The schedule changed. Reload before continuing.",
      );
    let requestId: string | null = null;
    let detail: Record<string, unknown>;
    if (cmd.action === "availability") {
      if (
        !c.own ||
        ![f.homeTeamId, f.awayTeamId].includes(c.own.membership.teamId)
      )
        throw new HttpError(
          403,
          "Only current players can save their own availability.",
        );
      const [before] = await tx
        .select({ version: scheduleAvailability.version })
        .from(scheduleAvailability)
        .where(
          and(
            eq(scheduleAvailability.fixtureId, f.id),
            eq(scheduleAvailability.userId, actor.osuId),
          ),
        );
      if ((before?.version ?? 0) !== cmd.expectedVersion)
        throw new HttpError(
          409,
          "The schedule changed. Reload before continuing.",
        );
      await tx
        .insert(scheduleAvailability)
        .values({
          fixtureId: f.id,
          userId: actor.osuId,
          membershipId: c.own.membership.id,
          intervals: cmd.intervals,
          version: cmd.expectedVersion + 1,
        })
        .onConflictDoUpdate({
          target: [scheduleAvailability.fixtureId, scheduleAvailability.userId],
          set: {
            intervals: cmd.intervals,
            version: cmd.expectedVersion + 1,
            membershipId: c.own.membership.id,
          },
        });
      detail = { fixtureId: f.id, version: cmd.expectedVersion + 1 }; // personal intervals are not copied into shared audit/history
    } else {
      const isCaptain = [
        live.basis.homeCaptainId,
        live.basis.awayCaptainId,
      ].includes(actor.osuId);
      if (
        !isCaptain &&
        !(c.admin && ["approve", "reject"].includes(cmd.action))
      )
        throw new HttpError(
          403,
          "Only the participating captains can negotiate this request.",
        );
      const rows = await tx
        .select()
        .from(scheduleRequests)
        .where(
          and(
            eq(scheduleRequests.fixtureId, f.id),
            eq(scheduleRequests.editionSlug, slug),
          ),
        );
      for (const row of rows)
        if (
          activeSchedule(row.status) &&
          scheduleStatus(
            row.status,
            true,
            row.basis,
            live.basis,
            row.proposedAt.toISOString(),
            c.now,
          ) === "expired"
        )
          await tx
            .update(scheduleRequests)
            .set({
              status: "expired",
              version: row.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(scheduleRequests.id, row.id));
      const before = cmd.requestId
        ? rows.find((r) => r.id === cmd.requestId)
        : null;
      if (
        cmd.requestId &&
        (!before ||
          before.version !== cmd.expectedVersion ||
          scheduleStatus(
            before.status,
            true,
            before.basis,
            live.basis,
            before.proposedAt.toISOString(),
            c.now,
          ) === "expired")
      )
        throw new HttpError(
          409,
          "The schedule changed. Reload before continuing.",
        );
      if (cmd.action === "propose") {
        if (!isCaptain)
          throw new HttpError(
            403,
            "Only the participating captains can negotiate this request.",
          );
        if (
          Date.parse(cmd.proposedAt) <= c.now ||
          Date.parse(cmd.proposedAt) === f.scheduledAt!.getTime()
        )
          throw new HttpError(
            400,
            "Choose a future time different from the official time.",
          );
        if (before && before.status !== "waiting")
          throw new HttpError(
            409,
            "Withdraw the pending request before proposing another time.",
          );
        if (
          !before &&
          (cmd.expectedVersion !== 0 ||
            rows.some(
              (r) =>
                activeSchedule(r.status) &&
                scheduleStatus(
                  r.status,
                  true,
                  r.basis,
                  live.basis,
                  r.proposedAt.toISOString(),
                  c.now,
                ) !== "expired",
            ))
        )
          throw new HttpError(
            409,
            "An active request already exists. Reload before continuing.",
          );
        const values = {
          basis: live.basis,
          proposedAt: new Date(cmd.proposedAt),
          proposerId: actor.osuId,
          status: "waiting" as const,
          version: (before?.version ?? 0) + 1,
          updatedAt: new Date(),
          decisionNote: null,
        };
        const [after] = before
          ? await tx
              .update(scheduleRequests)
              .set(values)
              .where(eq(scheduleRequests.id, before.id))
              .returning()
          : await tx
              .insert(scheduleRequests)
              .values({
                ...values,
                fixtureId: f.id,
                fixtureSnapshotId: f.id,
                editionSlug: slug,
                label: f.label,
              })
              .returning();
        requestId = after.id;
        detail = { before: before ?? null, after };
      } else {
        if (!before || !activeSchedule(before.status))
          throw new HttpError(
            409,
            "The schedule changed. Reload before continuing.",
          );
        if (
          cmd.action === "accept" &&
          (before.status !== "waiting" ||
            before.proposerId === actor.osuId ||
            !isCaptain)
        )
          throw new HttpError(
            403,
            "The other captain must confirm this proposal.",
          );
        if (
          cmd.action === "withdraw" &&
          (!isCaptain ||
            (before.status === "waiting" && before.proposerId !== actor.osuId))
        )
          throw new HttpError(
            403,
            "You can only withdraw your own proposal or agreement.",
          );
        const review =
          cmd.action === "approve" ||
          (cmd.action === "reject" && before.status === "pending");
        if (review && (!c.admin || isCaptain || before.status !== "pending"))
          throw new HttpError(
            403,
            "An independent schedule administrator must review this request.",
          );
        if (
          cmd.action === "reject" &&
          before.status === "waiting" &&
          (!isCaptain || before.proposerId === actor.osuId)
        )
          throw new HttpError(
            403,
            "The other captain must respond to this proposal.",
          );
        if (review && cmd.action === "reject" && !cmd.decisionNote)
          throw new HttpError(
            400,
            "Explain the rejected schedule request to both captains.",
          );
        const status =
          cmd.action === "accept"
            ? "pending"
            : cmd.action === "approve"
              ? "approved"
              : cmd.action === "withdraw"
                ? "withdrawn"
                : "rejected";
        const [after] = await tx
          .update(scheduleRequests)
          .set({
            status,
            version: before.version + 1,
            decisionNote: cmd.decisionNote ?? null,
            updatedAt: new Date(),
          })
          .where(eq(scheduleRequests.id, before.id))
          .returning();
        if (cmd.action === "approve") {
          const [updated] = await tx
            .update(fixtures)
            .set({
              scheduledAt: before.proposedAt,
              version: f.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(fixtures.id, f.id))
            .returning();
          await tx.insert(resultAuditEvents).values({
            fixtureId: f.id,
            actorId: actor.osuId,
            action: "fixture_reschedule",
            detail: {
              entity: { type: "fixture", id: f.id },
              before: f,
              after: updated,
              requestId: before.id,
            },
          });
        }
        requestId = after.id;
        detail = { before, after };
      }
    }
    await tx.insert(scheduleEvents).values({
      editionSlug: slug,
      requestId,
      actorId: actor.osuId,
      requestKey: cmd.requestKey,
      requestHash: hash,
      action: cmd.action,
      detail,
    });
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "competition_schedule",
      detail: { action: cmd.action, requestId, ...detail },
    });
    return { saved: true };
  });
}
