import { db } from "@/db";
import {
  captains,
  editionEvents,
  editionState,
  memberships,
  teamCoaches,
  teams,
  users,
} from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { getEdition } from "./content";
import { draftSetupProtection } from "./draft-setup";
import { refreshDraftSnapshot } from "./draft-snapshot";
import { changeTeamsWrite } from "./draft-setup-write-contracts";
import {
  coachingEnabled,
  editionSchema,
  normalizeEditionBranding,
} from "./editions";
import { HttpError } from "./http-error";
import { getOsuUserProfile } from "./osu-profiles";
import { staffTeams } from "./team-reads";

export async function updateTeams(
  actor: User,
  slug: string,
  input: unknown,
  uploadedAvatar?: string | null,
) {
  await assertCapability(actor, "manage_teams", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  const parsed = changeTeamsWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm valid team configuration.");
  const { command, expectedVersion } = parsed.data;
  const coachAction =
    command.action === "add_coach" || command.action === "remove_coach";
  // Validate target/version before contacting the provider; recheck under the edition lock.
  let coachProfile: { osuId: number; username: string } | undefined;
  if (command.action === "add_coach") {
    const current = await staffTeams(actor, slug);
    if (!current.coachesEnabled)
      throw new HttpError(409, "Coaching is disabled for this tournament.");
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
    if (
      coachAction &&
      !coachingEnabled(
        editionSchema.parse(
          normalizeEditionBranding({ ...state.configuration, slug }),
        ),
      )
    )
      throw new HttpError(409, "Coaching is disabled for this tournament.");
    const protection = await draftSetupProtection(tx, slug);
    const globalCapacity = state.configuration?.rosterCapacity;
    if (
      globalCapacity !== undefined &&
      ((command.action === "configure" &&
        command.teams.some((t) => t.capacity !== globalCapacity)) ||
        (command.action === "edit" && command.capacity !== globalCapacity))
    )
      throw new HttpError(
        400,
        "Change roster capacity in tournament settings.",
      );
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
    } else if (command.action === "publish_all_identities") {
      const pending = before.filter((team) => !team.identityPublished);
      if (!pending.length) return;
      const publishedCaptains = await tx
        .select({ userId: captains.userId })
        .from(captains)
        .where(
          and(eq(captains.editionSlug, slug), eq(captains.published, true)),
        );
      const publishedIds = new Set(
        publishedCaptains.map((captain) => captain.userId),
      );
      if (pending.some((team) => !publishedIds.has(team.captainId)))
        throw new HttpError(409, "Publish all team captains first.");
      await tx
        .update(teams)
        .set({ identityPublished: true, rosterPublished: false })
        .where(
          inArray(
            teams.id,
            pending.map((team) => team.id),
          ),
        );
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
