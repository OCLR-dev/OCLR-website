import { db } from "@/db";
import {
  captains,
  editionState,
  memberships,
  registrationAttempts,
  registrationEvents,
  registrations,
} from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { privacyReady } from "./auth/config";
import type { User } from "./auth/sessions";
import { assertBusinessWrite } from "./auth/staff";
import { remoteMode } from "./data-source";
import { enrollmentState, type Edition } from "./editions";
import { verifyEligibility } from "./eligibility";
import { ELIGIBILITY_FRESH_MS, withinRankGrace } from "./eligibility-model";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
import { readTournament, storedEdition } from "./tournaments";
// Latest explicit provenance, without rewriting legacy audit records or storing
// a second registration status. Mutations timestamp the event and row together.
// Keep the outer qualifier literal: single-table projections otherwise strip it.
export const registrationOperation = sql<
  "staff_remove" | "staff_restore" | "player_withdraw" | "player_reapply" | null
>`(
  SELECT e.operation FROM registration_events e WHERE e.registration_id = "registrations"."id"
  ORDER BY e.created_at DESC, e.id DESC LIMIT 1
)`;
export async function registrationAvailability(
  edition: Edition,
): Promise<ReturnType<typeof enrollmentState> | "unavailable"> {
  if (remoteMode())
    return (await import("./frontend-read-models")).publicEnrollmentState(
      edition.slug,
    );
  const state = enrollmentState(edition);
  if (state !== "open") return state;
  if (!privacyReady() || !process.env.DATABASE_URL) return "unavailable";
  try {
    const [saved] = await db()
      .select({ registrationPausedAt: editionState.registrationPausedAt })
      .from(editionState)
      .where(eq(editionState.slug, edition.slug));
    return saved?.registrationPausedAt ? "closed" : "open";
  } catch {
    return "unavailable";
  }
}
const applicationInput = z
  .object({
    rulesAcknowledged: z.literal(true).optional(),
    eligibilityAcknowledged: z.literal(true).optional(),
    rulesVersion: z.string().min(1).max(80).nullable().optional(),
    reapply: z
      .object({
        expectedUpdatedAt: z.iso.datetime(),
        attempt: z.number().int().positive(),
      })
      .strict()
      .optional(),
    configurationVersion: z.number().int().nonnegative(),
    answers: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export class ApplicationFieldError extends HttpError {
  constructor(
    public field: string,
    message: string,
  ) {
    super(400, message);
  }
}
export function validateApplication(
  edition: Edition,
  input: unknown,
  configurationVersion: number,
) {
  const result = applicationInput.safeParse(input);
  if (!result.success)
    throw new HttpError(
      400,
      "Check the application fields and any applicable acknowledgments.",
    );
  if (result.data.configurationVersion !== configurationVersion)
    throw new HttpError(
      409,
      "The tournament application changed. Refresh and review the current questions and rules.",
    );
  if (edition.rules) {
    if (!result.data.rulesAcknowledged)
      throw new HttpError(
        400,
        "Acknowledge the published rules before applying.",
      );
    if (result.data.rulesVersion !== edition.rules.version)
      throw new HttpError(
        409,
        "The rules have changed. Refresh and read them before applying.",
      );
  } else if (
    result.data.rulesAcknowledged ||
    result.data.rulesVersion != null
  ) {
    throw new HttpError(
      400,
      "No rules are configured for this application. Refresh before applying.",
    );
  }
  if (
    edition.eligibility
      ? !result.data.eligibilityAcknowledged
      : result.data.eligibilityAcknowledged
  ) {
    throw new HttpError(
      400,
      edition.eligibility
        ? "Acknowledge the published eligibility disclosure before applying."
        : "No eligibility disclosure is configured. Refresh before applying.",
    );
  }
  const questions = edition.registration?.questions ?? [];
  if (
    Object.keys(result.data.answers).some(
      (id) => !questions.some((q) => q.id === id),
    )
  )
    throw new HttpError(400, "The application contains an unknown question.");
  const answers: Record<string, string> = {};
  for (const question of questions) {
    const submitted = result.data.answers[question.id] ?? "";
    const answer =
      question.type === "single_choice" ? submitted : submitted.trim();
    if (question.type === "single_choice") {
      if (
        (question.required && !answer) ||
        (answer && !question.options.some((option) => option.id === answer))
      )
        throw new ApplicationFieldError(
          question.id,
          "Choose a valid option for this question.",
        );
    } else if (
      (question.required && !answer) ||
      answer.length > question.maxLength
    ) {
      throw new ApplicationFieldError(
        question.id,
        "Check the required answer and maximum length.",
      );
    }
    answers[question.id] = answer;
  }
  return {
    answers,
    ...(result.data.reapply ? { reapply: result.data.reapply } : {}),
    rulesVersion: edition.rules ? result.data.rulesVersion! : null,
    eligibilityAcknowledged: edition.eligibility ? true : null,
  };
}
export async function submitRegistration(
  user: User,
  slug: string,
  input: unknown,
) {
  await assertBusinessWrite(user, slug);
  if (!privacyReady())
    throw new HttpError(503, "Registration is awaiting privacy configuration.");
  // Provider I/O precedes row locks. Recheck revision/freshness inside the transaction.
  const current = await readTournament(slug);
  if (!current?.edition.published)
    throw new HttpError(404, "Tournament not found.");
  validateApplication(current.edition, input, current.revision);
  const verification = await verifyEligibility(
    user.osuId,
    current.edition,
    current.revision,
  );
  return db().transaction(async (tx) => {
    await assertBusinessWrite(user, slug, tx);
    const [state] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    const edition = state && storedEdition(state)?.edition;
    if (!edition?.published) throw new HttpError(404, "Tournament not found.");
    if (state.configurationVersion !== current.revision)
      throw new HttpError(
        409,
        "Eligibility settings changed. Refresh before applying.",
      );
    if (
      verification &&
      (verification.status === "unavailable" ||
        !verification.fetchedAt ||
        Date.now() - Date.parse(verification.fetchedAt) >= ELIGIBILITY_FRESH_MS)
    )
      throw new HttpError(
        503,
        "Unable to verify eligibility. Retry or contact staff.",
      );
    if (
      verification?.status === "fail" &&
      !withinRankGrace(verification, edition.rankGraceRange)
    )
      throw new HttpError(
        400,
        "Your osu!standard statistics do not meet the configured eligibility limits.",
      );
    const { reapply, ...values } = validateApplication(
      edition,
      input,
      state.configurationVersion,
    );
    if (state.registrationPausedAt || enrollmentState(edition) !== "open")
      throw new HttpError(409, "Registration is not open.");
    const [existing] = await tx
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.editionSlug, slug),
          eq(registrations.userId, user.osuId),
        ),
      )
      .for("update");
    if (
      existing &&
      (existing.status !== "withdrawn" ||
        !reapply ||
        existing.attempt !== reapply.attempt ||
        existing.updatedAt.toISOString() !== reapply.expectedUpdatedAt)
    )
      throw new HttpError(
        409,
        "You already have an application for this edition. View it in your dashboard.",
      );
    if (!existing && reapply)
      throw new HttpError(
        409,
        "This registration changed. Refresh before continuing.",
      );
    const now = new Date(
      Math.max(Date.now(), existing ? existing.updatedAt.getTime() + 1 : 0),
    );
    const active = {
      ...values,
      source: "player" as const,
      status: "pending" as const,
      configurationVersion: state.configurationVersion,
      eligibilityVerification:
        verification && withinRankGrace(verification, edition.rankGraceRange)
          ? { ...verification, rankGraceRange: edition.rankGraceRange! }
          : verification,
      createdAt: now,
      updatedAt: now,
      statusReason: null,
      draftUnavailableReason: null,
    };
    let registration: typeof registrations.$inferSelect;
    if (existing) {
      await assertRegistrationUnassigned(tx, slug, user.osuId, true);
      await tx.insert(registrationAttempts).values({
        registrationId: existing.id,
        attempt: existing.attempt,
        editionSlug: slug,
        configurationVersion: existing.configurationVersion,
        archivedBy: user.osuId,
        archivedAt: now,
        snapshot: {
          ...existing,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        },
      });
      [registration] = await tx
        .update(registrations)
        .set({ ...active, attempt: existing.attempt + 1 })
        .where(eq(registrations.id, existing.id))
        .returning();
    } else {
      [registration] = await tx
        .insert(registrations)
        .values({ editionSlug: slug, userId: user.osuId, ...active })
        .onConflictDoNothing({
          target: [registrations.editionSlug, registrations.userId],
        })
        .returning();
    }
    if (!registration)
      throw new HttpError(
        409,
        "You already have an application for this edition. View it in your dashboard.",
      );
    await tx.insert(registrationEvents).values({
      registrationId: registration.id,
      actorId: user.osuId,
      toStatus: "pending",
      fromStatus: existing?.status ?? null,
      attempt: registration.attempt,
      operation: existing ? "player_reapply" : null,
      createdAt: now,
    });
    return registration;
  });
}
export function canWithdraw(
  edition: Edition | undefined,
  registration: { status: string },
  locked: boolean,
  now = new Date(),
) {
  return Boolean(
    edition?.published &&
    !locked &&
    ["pending", "deferred", "accepted"].includes(registration.status) &&
    edition.registration?.withdrawUntil &&
    now.getTime() < Date.parse(edition.registration.withdrawUntil),
  );
}
export async function withdrawRegistration(
  user: User,
  id: string,
  confirmed: unknown,
) {
  if (
    !z
      .object({ confirmed: z.literal(true) })
      .strict()
      .safeParse(confirmed).success ||
    !z.uuid().safeParse(id).success
  )
    throw new HttpError(400, "Confirm withdrawal before continuing.");
  return db().transaction(async (tx) => {
    const [own] = await tx
      .select()
      .from(registrations)
      .where(
        and(eq(registrations.id, id), eq(registrations.userId, user.osuId)),
      );
    if (!own) throw new HttpError(404, "Application not found.");
    await assertBusinessWrite(user, own.editionSlug, tx);
    const [state] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, own.editionSlug))
      .for("update");
    const [current] = await tx
      .select()
      .from(registrations)
      .where(eq(registrations.id, id))
      .for("update");
    const edition = storedEdition(state)?.edition;
    const [captain] = await tx
      .select()
      .from(captains)
      .where(
        and(
          eq(captains.editionSlug, own.editionSlug),
          eq(captains.userId, user.osuId),
        ),
      );
    const [membership] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.editionSlug, own.editionSlug),
          eq(memberships.userId, user.osuId),
          isNull(memberships.leftAt),
        ),
      );
    if (membership)
      throw new HttpError(409, "Roster withdrawal requires staff review.");
    if (captain)
      throw new HttpError(409, "Captain withdrawal requires staff review.");
    if (!canWithdraw(edition, current, Boolean(state.registrationPausedAt)))
      throw new HttpError(
        409,
        "Withdrawal is not available. Contact tournament staff for review.",
      );
    const updatedAt = new Date(
      Math.max(Date.now(), current.updatedAt.getTime() + 1),
    );
    const [updated] = await tx
      .update(registrations)
      .set({ status: "withdrawn", statusReason: null, updatedAt })
      .where(eq(registrations.id, id))
      .returning();
    await tx.insert(registrationEvents).values({
      registrationId: id,
      actorId: user.osuId,
      fromStatus: current.status,
      toStatus: "withdrawn",
      operation: "player_withdraw",
      attempt: current.attempt,
      createdAt: updatedAt,
    });
    return updated;
  });
}
async function databaseOwnRegistrations(userId: number) {
  return db()
    .select({
      id: registrations.id,
      lastOperation: registrationOperation,
      userId: registrations.userId,
      editionSlug: registrations.editionSlug,
      status: registrations.status,
      source: registrations.source,
      attempt: registrations.attempt,
      rulesVersion: registrations.rulesVersion,
      eligibilityAcknowledged: registrations.eligibilityAcknowledged,
      configurationVersion: registrations.configurationVersion,
      answers: registrations.answers,
      statusReason: registrations.statusReason,
      createdAt: registrations.createdAt,
      updatedAt: registrations.updatedAt,
    })
    .from(registrations)
    .where(eq(registrations.userId, userId))
    .orderBy(registrations.createdAt);
}
export async function ownRegistrations(
  userId: number,
): Promise<Awaited<ReturnType<typeof databaseOwnRegistrations>>> {
  if (remoteMode()) {
    await assertRemoteSubject(userId);
    return frontendResource<
      Awaited<ReturnType<typeof databaseOwnRegistrations>>
    >("ownRegistrations", {});
  }
  return databaseOwnRegistrations(userId);
}

export async function assertRegistrationUnassigned(
  tx: Pick<ReturnType<typeof db>, "execute">,
  slug: string,
  userId: number,
  reapplying = false,
) {
  const dependencies = await tx.execute<{
    assigned: boolean;
    protectedPool: boolean;
  }>(sql`
      SELECT (
        EXISTS(SELECT 1 FROM captains WHERE edition_slug=${slug} AND user_id=${userId}) OR
        EXISTS(SELECT 1 FROM teams WHERE edition_slug=${slug} AND captain_id=${userId} AND archived_at IS NULL) OR
        EXISTS(SELECT 1 FROM memberships WHERE edition_slug=${slug} AND user_id=${userId} AND left_at IS NULL) OR
        EXISTS(SELECT 1 FROM draft_picks p JOIN draft_sessions s ON s.id=p.session_id
          WHERE s.edition_slug=${slug} AND p.voided_at IS NULL AND (p.player_id=${userId} OR p.captain_id=${userId})) OR
        EXISTS(SELECT 1 FROM teams t JOIN fixtures f ON (f.home_team_id=t.id OR f.away_team_id=t.id)
          WHERE t.edition_slug=${slug} AND (t.captain_id=${userId} OR
            EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=t.id AND m.user_id=${userId})))
      ) AS "assigned", EXISTS(SELECT 1 FROM draft_sessions s WHERE s.edition_slug=${slug}
        AND s.pool @> ${JSON.stringify([userId])}::jsonb
      ) AS "protectedPool"`);
  if (
    reapplying &&
    (dependencies.rows[0].assigned || dependencies.rows[0].protectedPool)
  )
    throw new HttpError(
      409,
      "This registration still has team or draft references. Contact an administrator before applying again.",
    );
  if (dependencies.rows[0].assigned)
    throw new HttpError(
      409,
      "Resolve this player's captain, roster or competition references before removing registration. Use the captain, team or draft recovery tools.",
    );
  if (dependencies.rows[0].protectedPool)
    throw new HttpError(
      409,
      "This player belongs to a protected draft pool. Use the explicit draft recovery tools before removing registration.",
    );
}
