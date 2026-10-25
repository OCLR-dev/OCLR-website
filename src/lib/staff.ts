import { staffApplicationFilters } from "./read-api-queries";
import { db } from "@/db";
import {
  editionRevisions,
  editionState,
  registrationAttempts,
  registrationEvents,
  registrations,
  users,
} from "@/db/schema";
import {
  and,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { applicationAnswers } from "./application-answers";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  assertReadCapability,
  capabilityScope,
  readCapabilityScope,
} from "./auth/staff";
import { remoteMode } from "./data-source";
import type { EditionConfiguration } from "./editions";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
import { cachedExportStatistics } from "./osu-profiles";
import {
  assertRegistrationUnassigned,
  registrationOperation,
} from "./registrations";
import { RemoteDataError } from "./remote-errors";
export function parseFilters(input: unknown) {
  const result = staffApplicationFilters.safeParse(input);
  if (!result.success) throw new HttpError(400, "Invalid search or filter.");
  return result.data;
}
export type StaffFilters = ReturnType<typeof parseFilters>;
function conditions(filters: StaffFilters) {
  return and(
    filters.edition
      ? eq(registrations.editionSlug, filters.edition)
      : undefined,
    filters.status === "active"
      ? ne(registrations.status, "withdrawn")
      : filters.status
        ? eq(registrations.status, filters.status)
        : undefined,
    filters.q
      ? or(
          // Usernames often contain "_"; match it (and "%") literally.
          ilike(users.username, `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`),
          /^\d+$/.test(filters.q) && Number.isSafeInteger(Number(filters.q))
            ? eq(users.osuId, Number(filters.q))
            : undefined,
        )
      : undefined,
  );
}
const listFields = {
  id: registrations.id,
  userId: registrations.userId,
  username: users.username,
  editionSlug: registrations.editionSlug,
  status: registrations.status,
  createdAt: registrations.createdAt,
  updatedAt: registrations.updatedAt,
};
async function databaseListApplications(
  actor: User,
  input: unknown,
  exporting = false,
) {
  const scopes = exporting
    ? await capabilityScope(actor, "manage_registrations")
    : await readCapabilityScope(actor, "manage_registrations");
  const filters = parseFilters(input);
  const where = and(
    conditions(filters),
    scopes ? inArray(registrations.editionSlug, scopes) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db()
      .select(listFields)
      .from(registrations)
      .innerJoin(users, eq(registrations.userId, users.osuId))
      .where(where)
      .orderBy(desc(registrations.createdAt), registrations.id)
      .limit(exporting ? 10001 : 25)
      .offset(exporting ? 0 : (filters.page - 1) * 25),
    db()
      .select({ count: count() })
      .from(registrations)
      .innerJoin(users, eq(registrations.userId, users.osuId))
      .where(where),
  ]);
  if (exporting && rows.length > 10000)
    throw new HttpError(
      413,
      "Narrow the export filters to at most 10,000 applications.",
    );
  return { rows, total: totals[0].count, filters };
}
export async function listApplications(
  actor: User,
  input: unknown,
  exporting = false,
): Promise<Awaited<ReturnType<typeof databaseListApplications>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    if (exporting) throw new RemoteDataError("REMOTE_FORBIDDEN", 403);
    return frontendResource<
      Awaited<ReturnType<typeof databaseListApplications>>
    >("listApplications", { input });
  }
  return databaseListApplications(actor, input, exporting);
}

export async function exportApplications(actor: User, input: unknown) {
  const { rows } = await listApplications(actor, input, true);
  if (!rows.length) return [];
  const statistics = await cachedExportStatistics(
    rows.map((row) => row.userId),
  );
  const snapshots = await db()
    .select({
      id: registrations.id,
      answers: registrations.answers,
      editionSlug: registrations.editionSlug,
      version: registrations.configurationVersion,
    })
    .from(registrations)
    .where(
      inArray(
        registrations.id,
        rows.map((row) => row.id),
      ),
    );
  // Read each submitted question revision once, without repeating large rules
  // documents for every applicant in the bounded export.
  const revisions = await db()
    .select({
      slug: editionRevisions.editionSlug,
      version: editionRevisions.version,
      registration: sql<
        EditionConfiguration["registration"]
      >`${editionRevisions.configuration}->'registration'`,
    })
    .from(editionRevisions)
    .where(
      exists(
        db()
          .select({ id: registrations.id })
          .from(registrations)
          .where(
            and(
              inArray(
                registrations.id,
                rows.map((row) => row.id),
              ),
              eq(registrations.editionSlug, editionRevisions.editionSlug),
              eq(registrations.configurationVersion, editionRevisions.version),
            ),
          ),
      ),
    );
  const byRevision = new Map(
    revisions.map((row) => [
      `${row.slug}:${row.version}`,
      { registration: row.registration },
    ]),
  );
  const byId = new Map(snapshots.map((row) => [row.id, row]));
  return rows.map((row) => {
    const snapshot = byId.get(row.id);
    return {
      ...row,
      statistics: statistics.get(row.userId) ?? null,
      applicationAnswers: snapshot
        ? applicationAnswers(
            snapshot.answers,
            byRevision.get(`${snapshot.editionSlug}:${snapshot.version}`),
          )
            .map(
              (answer) =>
                `${answer.label} [${answer.id}]: ${answer.value}${answer.optionId ? ` [${answer.optionId}]` : ""}`,
            )
            .join("\n")
        : "",
    };
  });
}
async function databaseApplicationDetails(actor: User, id: string) {
  await readCapabilityScope(actor, "manage_registrations");
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Application not found.");
  const [row] = await db()
    .select({
      registration: registrations,
      lastOperation: registrationOperation,
      username: users.username,
      acknowledgedConfiguration: editionRevisions.configuration,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.osuId))
    .leftJoin(
      editionRevisions,
      and(
        eq(editionRevisions.editionSlug, registrations.editionSlug),
        eq(editionRevisions.version, registrations.configurationVersion),
      ),
    )
    .where(eq(registrations.id, id));
  if (!row) throw new HttpError(404, "Application not found.");
  await assertReadCapability(
    actor,
    "manage_registrations",
    row.registration.editionSlug,
  );
  const attempts = await db()
    .select({
      attempt: registrationAttempts.attempt,
      snapshot: registrationAttempts.snapshot,
      configuration: editionRevisions.configuration,
    })
    .from(registrationAttempts)
    .leftJoin(
      editionRevisions,
      and(
        eq(editionRevisions.editionSlug, registrationAttempts.editionSlug),
        eq(editionRevisions.version, registrationAttempts.configurationVersion),
      ),
    )
    .where(eq(registrationAttempts.registrationId, id))
    .orderBy(desc(registrationAttempts.attempt));
  return { ...row, attempts };
}
export async function applicationDetails(
  actor: User,
  id: string,
): Promise<Awaited<ReturnType<typeof databaseApplicationDetails>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<
      Awaited<ReturnType<typeof databaseApplicationDetails>>
    >("applicationDetails", { id });
  }
  return databaseApplicationDetails(actor, id);
}

export async function reviewApplication(
  actor: User,
  id: string,
  input: unknown,
) {
  await capabilityScope(actor, "manage_registrations");
  const result = z
    .object({
      status: z.enum(["accepted", "rejected", "deferred", "pending"]),
      reason: z.string().trim().max(1000).default(""),
      expectedUpdatedAt: z.iso.datetime(),
      confirmed: z.literal(true),
    })
    .strict()
    .safeParse(input);
  if (!z.uuid().safeParse(id).success || !result.success)
    throw new HttpError(400, "Confirm a valid review decision.");
  if (result.data.status === "rejected" && !result.data.reason)
    throw new HttpError(400, "Give the player a reason for rejection.");
  return db().transaction(async (tx) => {
    const [record] = await tx
      .select()
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
      .select()
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
      .returning();
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
  const parsed = z
    .object({
      expectedUpdatedAt: z.iso.datetime(),
      confirmed: z.literal(true),
    })
    .strict()
    .safeParse(input);
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
        registration: registrations,
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
