import { db } from "@/db";
import {
  captains,
  editionRevisions,
  editionState,
  registrations,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { captainAppointment } from "./captain-reads";
import { getPublicEditions } from "./content";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { registrationReadColumns } from "./live-season-columns";
import {
  canWithdraw,
  registrationAvailability,
  registrationOperation,
} from "./registration-reads";
import type { ExplicitReadData } from "./explicit-read-contracts";
type PlayerApplications = ExplicitReadData<"playerApplications">;
async function databasePlayerApplications(
  userId: number,
): Promise<PlayerApplications> {
  const rows = await db()
    .select({
      registration: registrationReadColumns,
      lastOperation: registrationOperation,
      registrationPausedAt: editionState.registrationPausedAt,
      publishedCaptainId: captains.userId,
      // The withdrawal command checks pending appointments without disclosing them.
      assigned: sql<boolean>`EXISTS(
        SELECT 1 FROM memberships m WHERE m.edition_slug=${registrations.editionSlug}
        AND m.user_id=${registrations.userId} AND m.left_at IS NULL
        AND (m.origin <> 'captain' OR ${captains.userId} IS NOT NULL)
      )`,
      acknowledgedConfiguration: editionRevisions.configuration,
    })
    .from(registrations)
    .innerJoin(editionState, eq(registrations.editionSlug, editionState.slug))
    .leftJoin(
      captains,
      and(
        eq(captains.editionSlug, registrations.editionSlug),
        eq(captains.userId, registrations.userId),
        eq(captains.published, true),
      ),
    )
    .leftJoin(
      editionRevisions,
      and(
        eq(editionRevisions.editionSlug, registrations.editionSlug),
        eq(editionRevisions.version, registrations.configurationVersion),
      ),
    )
    .where(eq(registrations.userId, userId))
    .orderBy(registrations.createdAt);
  const editions = await getPublicEditions();
  return Promise.all(
    rows.map(
      async ({
        registration,
        registrationPausedAt,
        publishedCaptainId,
        lastOperation,
        assigned,
        acknowledgedConfiguration,
      }) => {
        const edition = editions.find(
          (e) => e.slug === registration.editionSlug,
        );
        const captainAssigned = Boolean(
          edition && !edition.archive && publishedCaptainId,
        );
        return {
          captainAssigned,
          registration,
          lastOperation,
          acknowledgedConfiguration,
          edition,
          withdrawable: canWithdraw(
            edition,
            registration,
            Boolean(registrationPausedAt) || captainAssigned || assigned,
          ),
          reapplyAvailable:
            registration.status === "withdrawn" && edition
              ? (await registrationAvailability(edition)) === "open"
              : false,
        };
      },
    ),
  );
}
export async function playerApplications(
  userId: number,
): Promise<PlayerApplications> {
  if (remoteMode()) {
    await assertRemoteSubject(userId);
    const applications =
      await frontendResource<PlayerApplications>("playerApplications");
    return Promise.all(
      applications.map(async (application) =>
        application.captainAssigned
          ? {
              ...application,
              captainAssigned: Boolean(
                await captainAppointment(
                  userId,
                  application.registration.editionSlug,
                ),
              ),
            }
          : application,
      ),
    );
  }
  return databasePlayerApplications(userId);
}

export const statusCopy = {
  pending: "Your application is saved and awaiting staff review.",
  accepted:
    "Your application is accepted. Follow published captain and draft announcements; acceptance does not assign a team.",
  rejected:
    "Your application was not accepted. See the staff explanation below when provided.",
  withdrawn:
    "This application is withdrawn. It will not enter the eligible player pool.",
};
