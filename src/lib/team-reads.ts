import { db } from "@/db";
import {
  captains,
  draftSessions,
  editionState,
  memberships,
  teamCoaches,
  teams,
  userProfileCache,
  users,
} from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import { getEdition, getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { draftSetupProtection } from "./draft-setup";
import {
  coachingEnabled,
  editionSchema,
  normalizeEditionBranding,
} from "./editions";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";

type PublishedTeams = ExplicitReadData<"publishedTeams">;
type StaffTeams = ExplicitReadData<"staffTeams">;
type OwnTeam = ExplicitReadData<"ownTeam">;
const teamReadColumns = {
  id: teams.id,
  editionSlug: teams.editionSlug,
  captainId: teams.captainId,
  avatarKey: teams.avatarKey,
  name: teams.name,
  capacity: teams.capacity,
  identityPublished: teams.identityPublished,
  rosterPublished: teams.rosterPublished,
  finalizedAt: teams.finalizedAt,
  archivedAt: teams.archivedAt,
};
async function databaseStaffTeams(
  actor: User,
  slug: string,
): Promise<StaffTeams> {
  await assertReadCapability(actor, "manage_teams", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  return db().transaction(
    async (tx) => {
      const [state] = await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug));
      const rows = await tx
        .select(teamReadColumns)
        .from(teams)
        .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)))
        .orderBy(teams.name);
      const members = await tx
        .select({
          teamId: memberships.teamId,
          osuId: memberships.userId,
          username: users.username,
          origin: memberships.origin,
        })
        .from(memberships)
        .innerJoin(users, eq(users.osuId, memberships.userId))
        .where(
          and(eq(memberships.editionSlug, slug), isNull(memberships.leftAt)),
        )
        .orderBy(memberships.joinedAt);
      const coaches = await tx
        .select({
          teamId: teamCoaches.teamId,
          osuId: users.osuId,
          username: users.username,
        })
        .from(teamCoaches)
        .innerJoin(users, eq(users.osuId, teamCoaches.userId))
        .where(eq(teamCoaches.editionSlug, slug))
        .orderBy(users.username);
      const protection = await draftSetupProtection(tx, slug);
      return {
        version: state?.setupVersion ?? 0,
        locked: protection.locked,
        coachesEnabled: coachingEnabled(
          editionSchema.parse(
            normalizeEditionBranding({ ...state?.configuration, slug }),
          ),
        ),
        teams: rows.map((team) => ({
          ...team,
          coaches: coaches.filter((c) => c.teamId === team.id),
          members: members.filter((m) => m.teamId === team.id),
        })),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function staffTeams(
  actor: User,
  slug: string,
): Promise<StaffTeams> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<StaffTeams>("staffTeams", { slug });
  }
  return databaseStaffTeams(actor, slug);
}

async function databaseOwnTeam(userId: number, slug: string): Promise<OwnTeam> {
  const [team] = await db()
    .select(teamReadColumns)
    .from(teams)
    .where(
      and(
        eq(teams.editionSlug, slug),
        eq(teams.captainId, userId),
        isNull(teams.archivedAt),
      ),
    );
  if (!team) return null;
  const members = await db()
    .select({
      osuId: memberships.userId,
      username: users.username,
      origin: memberships.origin,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.osuId))
    .where(and(eq(memberships.teamId, team.id), isNull(memberships.leftAt)))
    .orderBy(memberships.joinedAt);
  const [session] = await db()
    .select({ snapshot: draftSessions.captainSnapshot })
    .from(draftSessions)
    .where(eq(draftSessions.editionSlug, slug));
  const published = session?.snapshot?.rosters.find(
    (r) => r.team.id === team.id,
  )?.players;
  return {
    ...team,
    finalizedAt:
      session && session.snapshot?.state !== "finalized"
        ? null
        : team.finalizedAt,
    members:
      published ??
      members
        .filter((m) => m.origin === "captain")
        .map(({ osuId, username }) => ({ osuId, username })),
  };
}
export async function ownTeam(userId: number, slug: string): Promise<OwnTeam> {
  if (remoteMode()) {
    await assertRemoteSubject(userId);
    return frontendResource<OwnTeam>("ownTeam", { slug });
  }
  return databaseOwnTeam(userId, slug);
}

async function databasePublishedTeams(slug: string): Promise<PublishedTeams> {
  if (!(await getPublicEdition(slug)) || !process.env.DATABASE_URL) return [];
  return db().transaction(
    async (tx) => {
      const rows = await tx
        .select({
          id: teams.id,
          name: teams.name,
          avatarKey: teams.avatarKey,
          captainId: teams.captainId,
          captainName: users.username,
          finalizedAt: teams.finalizedAt,
          rosterPublished: teams.rosterPublished,
        })
        .from(teams)
        .innerJoin(
          captains,
          and(
            eq(captains.editionSlug, teams.editionSlug),
            eq(captains.userId, teams.captainId),
          ),
        )
        .innerJoin(users, eq(users.osuId, teams.captainId))
        .where(
          and(
            eq(teams.editionSlug, slug),
            eq(teams.identityPublished, true),
            eq(captains.published, true),
            isNull(teams.archivedAt),
          ),
        )
        .orderBy(teams.name);
      const published: PublishedTeams = [];
      for (const team of rows) {
        const members =
          team.finalizedAt && team.rosterPublished
            ? await tx
                .select({
                  osuId: memberships.userId,
                  username: users.username,
                  countryCode: sql<
                    string | null
                  >`${userProfileCache.profile}->>'countryCode'`,
                  countryName: sql<
                    string | null
                  >`${userProfileCache.profile}->>'countryName'`,
                })
                .from(memberships)
                .innerJoin(users, eq(users.osuId, memberships.userId))
                .leftJoin(
                  userProfileCache,
                  and(
                    eq(userProfileCache.osuId, memberships.userId),
                    eq(userProfileCache.mode, "osu"),
                    sql`${userProfileCache.errorStatus} IS DISTINCT FROM 404`,
                  ),
                )
                .where(
                  and(
                    eq(memberships.teamId, team.id),
                    isNull(memberships.leftAt),
                  ),
                )
                .orderBy(memberships.joinedAt)
            : null;
        const coaches =
          team.finalizedAt && team.rosterPublished
            ? await tx
                .select({ osuId: users.osuId, username: users.username })
                .from(teamCoaches)
                .innerJoin(users, eq(users.osuId, teamCoaches.userId))
                .where(eq(teamCoaches.teamId, team.id))
                .orderBy(users.username)
            : [];
        published.push({
          coaches,
          id: team.id,
          name: team.name,
          avatarKey: team.avatarKey,
          captainId: team.captainId,
          captainName: team.captainName,
          finalized: Boolean(team.finalizedAt),
          members,
        });
      }
      return published;
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function publishedTeams(slug: string): Promise<PublishedTeams> {
  if (remoteMode()) {
    return frontendResource<PublishedTeams>("publishedTeams", { slug });
  }
  return databasePublishedTeams(slug);
}
