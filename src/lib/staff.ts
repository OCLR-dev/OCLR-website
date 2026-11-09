import { db } from "@/db";
import { editionState, registrationEvents, registrations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth/sessions";
import { assertCapability, capabilityScope } from "./auth/staff";
import { HttpError } from "./http-error";
import {
  registrationMetadata,
  registrationReadColumns,
} from "./live-season-columns";
import { registrationOperation } from "./registration-reads";
import {
  registrationParticipationInput,
  reviewRegistrationWrite,
  type ReviewedRegistration,
} from "./registration-write-contract";
import { assertRegistrationUnassigned } from "./registrations";

export async function reviewApplication(
  actor: User,
  id: string,
  input: unknown,
): Promise<ReviewedRegistration> {
  await capabilityScope(actor, "manage_registrations");
  const result = reviewRegistrationWrite.request.safeParse(input);
  if (!z.uuid().safeParse(id).success || !result.success)
    throw new HttpError(400, "Confirm a valid review decision.");
  if (result.data.status === "rejected" && !result.data.reason)
    throw new HttpError(400, "Give the player a reason for rejection.");
  return db().transaction(async (tx) => {
    const [record] = await tx
      .select({ editionSlug: registrations.editionSlug })
      .from(registrations)
      .where(eq(registrations.id, id));
    if (!record) throw new HttpError(404, "Application not found.");
    await assertCapability(
      actor,
      "manage_registrations",
      record.editionSlug,
      tx,
    );
    const [edition] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, record.editionSlug))
      .for("update");
    const [current] = await tx
      .select(registrationMetadata)
      .from(registrations)
      .where(eq(registrations.id, id))
      .for("update");
    if (
      edition.registrationPausedAt ||
      !["pending", "deferred"].includes(current.status) ||
      current.status === result.data.status ||
      current.updatedAt.toISOString() !== result.data.expectedUpdatedAt
    )
      throw new HttpError(
        409,
        "This application changed or its edition is locked. Refresh before reviewing.",
      );
    const updatedAt = new Date(
      Math.max(Date.now(), current.updatedAt.getTime() + 1),
    );
    const [updated] = await tx
      .update(registrations)
      .set({
        status: result.data.status,
        statusReason: result.data.reason || null,
        updatedAt,
      })
      .where(eq(registrations.id, id))
      .returning(registrationReadColumns);
    await tx.insert(registrationEvents).values({
      registrationId: id,
      actorId: actor.osuId,
      attempt: current.attempt,
      fromStatus: current.status,
      toStatus: result.data.status,
      reason: result.data.reason || null,
      createdAt: updatedAt,
    });
    return updated;
  });
}

/** Administrative withdrawal is a transition, never a row/account deletion.
 * The edition lock serializes this with review, captain changes and draft picks. */
export async function changeRegistrationParticipation(
  actor: User,
  slug: string,
  id: string,
  action: "remove" | "restore",
  input: unknown,
) {
  await assertCapability(actor, "manage_registrations", slug);
  const parsed = registrationParticipationInput.safeParse(input);
  if (!z.uuid().safeParse(id).success || !parsed.success)
    throw new HttpError(400, "Confirm a valid registration change.");
  return db().transaction(async (tx) => {
    const [edition] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, "manage_registrations", slug, tx);
    const [target] = await tx
      .select({
        registration: registrationMetadata,
        lastOperation: registrationOperation,
      })
      .from(registrations)
      .where(and(eq(registrations.id, id), eq(registrations.editionSlug, slug)))
      .for("update");
    if (!edition || !target) throw new HttpError(404, "Application not found.");
    const current = target.registration;
    if (current.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt)
      throw new HttpError(
        409,
        "This registration changed. Refresh before continuing.",
      );
    if (action === "remove" && current.status === "withdrawn")
      throw new HttpError(409, "This registration is already withdrawn.");
    if (
      action === "restore" &&
      (current.status !== "withdrawn" ||
        target.lastOperation !== "staff_remove")
    )
      throw new HttpError(
        409,
        "Only a registration removed by staff can be restored for review.",
      );
    if (action === "restore" && edition.configuration?.status === "completed")
      throw new HttpError(
        409,
        "Registration cannot be restored in a completed tournament.",
      );
    await assertRegistrationUnassigned(tx, slug, current.userId);
    const updatedAt = new Date(
      Math.max(Date.now(), current.updatedAt.getTime() + 1),
    );
    const status = action === "remove" ? "withdrawn" : "pending";
    await tx
      .update(registrations)
      .set({
        status,
        updatedAt,
        ...(action === "restore" ? { statusReason: null } : {}),
      })
      .where(eq(registrations.id, id));
    await tx.insert(registrationEvents).values({
      registrationId: id,
      actorId: actor.osuId,
      operation: action === "remove" ? "staff_remove" : "staff_restore",
      attempt: current.attempt,
      fromStatus: current.status,
      toStatus: status,
      createdAt: updatedAt,
    });
    return { id, status, updatedAt };
  });
}
