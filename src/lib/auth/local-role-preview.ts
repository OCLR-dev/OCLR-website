import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  captains,
  memberships,
  registrations,
  staffRoles,
  users,
} from "@/db/schema";
import {
  demoEdition,
  localRolePreviewAccounts,
} from "../local-role-preview-model";

export async function localRolePreviewAccountsWithRoles() {
  const ids = localRolePreviewAccounts.map(({ osuId }) => osuId);
  const [people, grants, appointments, teams, applications] = await Promise.all(
    [
      db()
        .select({ osuId: users.osuId, username: users.username })
        .from(users)
        .where(inArray(users.osuId, ids)),
      db()
        .select({
          osuId: staffRoles.userId,
          role: staffRoles.role,
        })
        .from(staffRoles)
        .where(
          and(inArray(staffRoles.userId, ids), isNull(staffRoles.revokedAt)),
        ),
      db()
        .select({ osuId: captains.userId })
        .from(captains)
        .where(
          and(
            eq(captains.editionSlug, demoEdition),
            eq(captains.published, true),
          ),
        ),
      db()
        .select({ osuId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.editionSlug, demoEdition),
            isNull(memberships.leftAt),
          ),
        ),
      db()
        .select({ osuId: registrations.userId, status: registrations.status })
        .from(registrations)
        .where(eq(registrations.editionSlug, demoEdition)),
    ],
  );
  return localRolePreviewAccounts.flatMap((account) => {
    if (
      !people.some(
        ({ osuId, username }) =>
          osuId === account.osuId && username === account.username,
      )
    )
      return [];
    return [
      {
        osuId: account.osuId,
        username: account.username,
        staff: grants.filter(({ osuId }) => osuId === account.osuId),
        captain: appointments.some(({ osuId }) => osuId === account.osuId),
        teamMember: teams.some(({ osuId }) => osuId === account.osuId),
        registration: applications.find(({ osuId }) => osuId === account.osuId)
          ?.status,
      },
    ];
  });
}

export async function localRolePreviewAccount(value: string) {
  const account = localRolePreviewAccounts.find(
    ({ osuId }) => String(osuId) === value,
  );
  if (!account) return null;
  const [user] = await db()
    .select({ osuId: users.osuId })
    .from(users)
    .where(
      and(eq(users.osuId, account.osuId), eq(users.username, account.username)),
    );
  return user ?? null;
}
