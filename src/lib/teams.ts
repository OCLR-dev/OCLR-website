import { db } from "@/db";
import {
  captains,
  draftSessions,
  editionEvents,
  editionState,
  memberships,
  teamCoaches,
  teams,
  userProfileCache,
  users,
} from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability, assertReadCapability } from "./auth/staff";
import { getEdition, getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { refreshDraftSnapshot } from "./draft";
import { draftSetupProtection } from "./draft-setup";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
import { getOsuUserProfile } from "./osu-profiles";
const teamInput = z
  .object({
    captainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    name: z.string().trim().min(1).max(80),
    capacity: z.number().int().min(1).max(256).nullable(),
  })
  .strict();
const commandSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
    command: z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("add_coach"),
          teamId: z.uuid(),
          userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        })
        .strict(),
      z
        .object({
          action: z.literal("remove_coach"),
          teamId: z.uuid(),
          userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        })
        .strict(),
      z
        .object({
          action: z.literal("configure"),
          teams: z.array(teamInput).min(1).max(256),
        })
        .strict(),
      z
        .object({
          action: z.literal("edit"),
          teamId: z.uuid(),
          name: teamInput.shape.name,
          capacity: teamInput.shape.capacity,
          avatarKey: z.uuid().nullable(),
        })
        .strict(),
      z
        .object({
          action: z.literal("publish"),
          teamId: z.uuid(),
          identityPublished: z.boolean(),
          rosterPublished: z.boolean(),
        })
        .strict(),
    ]),
  })
  .strict();
async function databaseStaffTeams(actor: User, slug: string) {
  await assertReadCapability(actor, "manage_teams", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  return db().transaction(
    async (tx) => {
      const [state] = await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug));
      const rows = await tx
        .select()
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
): Promise<Awaited<ReturnType<typeof databaseStaffTeams>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseStaffTeams>>>(
      "staffTeams",
      { slug },
    );
  }
  return databaseStaffTeams(actor, slug);
}

export async function updateTeams(
  actor: User,
  slug: string,
  input: unknown,
  uploadedAvatar?: string | null,
) {
  await assertCapability(actor, "manage_teams", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm valid team configuration.");
  const { command, expectedVersion } = parsed.data;
  const coachAction =
    command.action === "add_coach" || command.action === "remove_coach";
  // Validate target/version before contacting the provider; recheck under the edition lock.
  let coachProfile: { osuId: number; username: string } | undefined;
  if (command.action === "add_coach") {
    const current = await staffTeams(actor, slug);
    if (current.version !== expectedVersion)
      throw new HttpError(409, "Setup changed. Refresh before continuing.");
    if (!current.teams.some((t) => t.id === command.teamId))
      throw new HttpError(404, "Team not found.");
    const snapshot = await getOsuUserProfile(command.userId, "osu");
    if (snapshot.stale || snapshot.notice)
      throw new HttpError(
        503,
        "A current verified osu! profile is required. Retry when the provider is available.",
      );
    coachProfile = {
      osuId: snapshot.profile.osuId,
      username: snapshot.profile.username,
    };
  }
  await db().transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, "manage_teams", slug, tx);
    await assertOperationalEdition(slug, tx);
    if (!state || state.setupVersion !== expectedVersion)
      throw new HttpError(409, "Setup changed. Refresh before continuing.");
    const protection = await draftSetupProtection(tx, slug);
    const before = await tx
      .select()
      .from(teams)
      .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)));
    const coachesBefore = coachAction
      ? await tx
          .select()
          .from(teamCoaches)
          .where(eq(teamCoaches.editionSlug, slug))
      : [];
    if (command.action === "add_coach" || command.action === "remove_coach") {
      const team = before.find((t) => t.id === command.teamId);
      if (!team) throw new HttpError(404, "Team not found.");
      if (command.action === "add_coach") {
        if (!coachProfile || coachProfile.osuId !== command.userId)
          throw new HttpError(400, "Confirm valid team configuration.");
        await tx.insert(users).values(coachProfile).onConflictDoNothing();
        await tx
          .insert(teamCoaches)
          .values({
            editionSlug: slug,
            teamId: team.id,
            userId: command.userId,
          })
          .onConflictDoNothing();
      } else {
        await tx
          .delete(teamCoaches)
          .where(
            and(
              eq(teamCoaches.teamId, team.id),
              eq(teamCoaches.userId, command.userId),
            ),
          );
      }
    } else if (command.action === "configure") {
      if (protection.locked)
        throw new HttpError(
          409,
          "Team configuration is locked. Use supervised draft recovery.",
        );
      const appointed = await tx
        .select()
        .from(captains)
        .where(eq(captains.editionSlug, slug));
      if (
        command.teams.length !== appointed.length ||
        new Set(command.teams.map((t) => t.captainId)).size !==
          appointed.length ||
        appointed.some(
          (c) => !command.teams.some((t) => t.captainId === c.userId),
        )
      )
        throw new HttpError(
          400,
          "Configure exactly one team for every appointed captain.",
        );
      for (const value of command.teams) {
        const existing = before.find((t) => t.captainId === value.captainId);
        let teamId: string;
        if (existing) {
          const [roster] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(memberships)
            .where(
              and(
                eq(memberships.teamId, existing.id),
                isNull(memberships.leftAt),
              ),
            );
          if (value.capacity !== null && value.capacity < roster.count)
            throw new HttpError(
              409,
              "Capacity cannot be smaller than the current roster.",
            );
          if (existing.finalizedAt)
            throw new HttpError(409, "Finalized team identity is immutable.");
          await tx
            .update(teams)
            .set({
              name: value.name,
              capacity: value.capacity,
            })
            .where(eq(teams.id, existing.id));
          teamId = existing.id;
        } else {
          const [created] = await tx
            .insert(teams)
            .values({ editionSlug: slug, ...value })
            .returning();
          teamId = created.id;
          await tx.insert(memberships).values({
            editionSlug: slug,
            teamId,
            userId: value.captainId,
            origin: "captain",
          });
        }
      }
    } else if (command.action === "edit") {
      const team = before.find((t) => t.id === command.teamId);
      if (!team) throw new HttpError(404, "Team not found.");
      if (
        command.avatarKey !== null &&
        command.avatarKey !== team.avatarKey &&
        command.avatarKey !== uploadedAvatar
      )
        throw new HttpError(400, "Upload a valid team image before saving.");
      if (
        (protection.locked || team.finalizedAt) &&
        command.capacity !== team.capacity
      )
        throw new HttpError(
          409,
          "Roster capacity is locked. Only team name and avatar can be corrected.",
        );
      const roster = await tx
        .select()
        .from(memberships)
        .where(
          and(eq(memberships.teamId, team.id), isNull(memberships.leftAt)),
        );
      if (command.capacity !== null && command.capacity < roster.length)
        throw new HttpError(
          409,
          "Capacity cannot be smaller than the current roster.",
        );
      await tx
        .update(teams)
        .set({
          name: command.name,
          capacity: command.capacity,
          avatarKey: command.avatarKey,
        })
        .where(eq(teams.id, team.id));
    } else {
      const team = before.find((t) => t.id === command.teamId);
      if (!team) throw new HttpError(404, "Team not found.");
      const [captain] = await tx
        .select()
        .from(captains)
        .where(
          and(
            eq(captains.editionSlug, slug),
            eq(captains.userId, team.captainId),
          ),
        );
      if (
        (command.identityPublished && !captain?.published) ||
        (command.rosterPublished &&
          (!command.identityPublished || !team.finalizedAt))
      )
        throw new HttpError(
          409,
          "Publish the captain first. Rosters require finalized teams and published identity.",
        );
      await tx
        .update(teams)
        .set({
          identityPublished: command.identityPublished,
          rosterPublished: command.rosterPublished,
        })
        .where(eq(teams.id, team.id));
    }
    await tx
      .update(editionState)
      .set({ setupVersion: state.setupVersion + 1 })
      .where(eq(editionState.slug, slug));
    const after = await tx
      .select()
      .from(teams)
      .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)));
    const draftRevision = coachAction
      ? null
      : await refreshDraftSnapshot(tx, slug);
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: `team_${command.action}`,
      detail: {
        draftRevision,
        ...(coachAction
          ? {
              coachesBefore,
              coachesAfter: await tx
                .select()
                .from(teamCoaches)
                .where(eq(teamCoaches.editionSlug, slug)),
            }
          : {}),
        entity:
          "teamId" in command
            ? { type: "team", id: command.teamId }
            : { type: "team_setup", id: slug },
        before:
          command.action === "edit"
            ? before.find((t) => t.id === command.teamId)
            : before,
        after:
          command.action === "edit"
            ? after.find((t) => t.id === command.teamId)
            : after,
        fromVersion: expectedVersion,
        toVersion: expectedVersion + 1,
      },
    });
  });
  return staffTeams(actor, slug);
}
async function databaseOwnTeam(userId: number, slug: string) {
  const [team] = await db()
    .select()
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
export async function ownTeam(
  userId: number,
  slug: string,
): Promise<Awaited<ReturnType<typeof databaseOwnTeam>>> {
  if (remoteMode()) {
    await assertRemoteSubject(userId);
    return frontendResource<Awaited<ReturnType<typeof databaseOwnTeam>>>(
      "ownTeam",
      { slug },
    );
  }
  return databaseOwnTeam(userId, slug);
}

async function databasePublishedTeams(slug: string) {
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
      const published = [];
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
export async function publishedTeams(
  slug: string,
): Promise<Awaited<ReturnType<typeof databasePublishedTeams>>> {
  if (remoteMode()) {
    return frontendResource<Awaited<ReturnType<typeof databasePublishedTeams>>>(
      "publishedTeams",
      { slug },
    );
  }
  return databasePublishedTeams(slug);
}
