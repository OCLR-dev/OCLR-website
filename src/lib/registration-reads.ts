import { db } from "@/db";
import { editionState, registrations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { privacyReady } from "./auth/config";
import type { RegistrationReadOperation } from "./configuration-read-contracts";
import { remoteMode } from "./data-source";
import { enrollmentState, type Edition } from "./editions";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { registrationAnswerValues } from "./live-season-columns";

// Latest explicit provenance, without rewriting legacy audit records or storing
// a second registration status. Mutations timestamp the event and row together.
// Keep the outer qualifier literal: single-table projections otherwise strip it.
export const registrationOperation = sql<RegistrationReadOperation | null>`(
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

type OwnRegistrations =
  import("./explicit-read-contracts").ExplicitReadData<"ownRegistrations">;
async function databaseOwnRegistrations(
  userId: number,
): Promise<OwnRegistrations> {
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
      answers: registrationAnswerValues,
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
): Promise<OwnRegistrations> {
  if (remoteMode()) {
    await assertRemoteSubject(userId);
    return frontendResource<OwnRegistrations>("ownRegistrations");
  }
  return databaseOwnRegistrations(userId);
}
