import { db } from "@/db";
import {
  captains,
  editionState,
  memberships,
  registrations,
  teams,
  users,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import { getEdition, getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { draftSetupProtection } from "./draft-setup";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";

type PublicCaptains = ExplicitReadData<"publicCaptains">;
type CaptainSetup = ExplicitReadData<"captainSetup">;
type CaptainAppointment = ExplicitReadData<"captainAppointment">;
async function databaseCaptainSetup(
  actor: User,
  slug: string,
): Promise<CaptainSetup> {
  await assertReadCapability(actor, "manage_captains", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  return db().transaction(
    async (tx) => {
      const [state] = await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug));
      const appointed = await tx
        .select({
          userId: captains.userId,
          username: users.username,
          position: captains.position,
          published: captains.published,
        })
        .from(captains)
        .innerJoin(users, eq(captains.userId, users.osuId))
        .where(eq(captains.editionSlug, slug))
        .orderBy(captains.position);
      const candidates = await tx
        .select({
          userId: registrations.userId,
          username: users.username,
          unavailableReason: registrations.draftUnavailableReason,
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userId, users.osuId))
        .where(
          and(
            eq(registrations.editionSlug, slug),
            eq(registrations.status, "accepted"),
          ),
        )
        .orderBy(users.username);
      const roster = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(eq(memberships.editionSlug, slug), isNull(memberships.leftAt)),
        );
      const assignedTeams = await tx
        .select()
        .from(teams)
        .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)));
      const protection = await draftSetupProtection(tx, slug);
      return {
        version: state?.setupVersion ?? 0,
        locked: protection.captainsLocked,
        availabilityLocked: protection.locked,
        poolPublished: state?.poolPublished ?? false,
        captains: appointed.map((c) => ({
          ...c,
          teamId:
            assignedTeams.find((t) => t.captainId === c.userId)?.id ?? null,
          teamName:
            assignedTeams.find((t) => t.captainId === c.userId)?.name ?? null,
        })),
        candidates,
        pool: candidates.filter(
          (c) =>
            !c.unavailableReason &&
            !appointed.some((a) => a.userId === c.userId) &&
            !roster.some((m) => m.userId === c.userId),
        ),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function captainSetup(
  actor: User,
  slug: string,
): Promise<CaptainSetup> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<CaptainSetup>("captainSetup", { slug });
  }
  return databaseCaptainSetup(actor, slug);
}

async function databasePublicCaptains(slug: string): Promise<PublicCaptains> {
  if (!(await getPublicEdition(slug)) || !process.env.DATABASE_URL) return [];
  return db()
    .select({
      osuId: captains.userId,
      username: users.username,
      position: captains.position,
    })
    .from(captains)
    .innerJoin(users, eq(captains.userId, users.osuId))
    .where(and(eq(captains.editionSlug, slug), eq(captains.published, true)))
    .orderBy(captains.position);
}
export async function publicCaptains(slug: string): Promise<PublicCaptains> {
  if (remoteMode()) {
    return frontendResource<PublicCaptains>("publicCaptains", { slug });
  }
  return databasePublicCaptains(slug);
}

async function databaseCaptainAppointment(
  userId: number,
  slug: string,
): Promise<CaptainAppointment> {
  return (
    (
      await db()
        .select({
          editionSlug: captains.editionSlug,
          userId: captains.userId,
          position: captains.position,
          published: captains.published,
        })
        .from(captains)
        .where(and(eq(captains.editionSlug, slug), eq(captains.userId, userId)))
    )[0] ?? null
  );
}
export async function captainAppointment(
  userId: number,
  slug: string,
): Promise<CaptainAppointment> {
  if (remoteMode()) {
    await assertRemoteSubject(userId);
    return frontendResource<CaptainAppointment>("captainAppointment", { slug });
  }
  return databaseCaptainAppointment(userId, slug);
}
