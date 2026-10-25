import { db } from "@/db";
import {
  captains,
  draftPicks,
  draftSessions,
  editionEvents,
  editionState,
  fixtures,
  memberships,
  registrations,
  teams,
  users,
} from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  assertReadCapability,
  hasCapability,
} from "./auth/staff";
import { hashToken } from "./auth/tokens";
import { getEdition, getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { turnSequenceStructureProblem } from "./draft-order";
import type {
  CaptainBoard,
  DraftBoard,
  DraftIdentity,
  DraftTeam,
} from "./draft-types";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
type Reader = Pick<ReturnType<typeof db>, "select">;
async function draftData(tx: Reader, slug: string) {
  const [session] = await tx
    .select()
    .from(draftSessions)
    .where(eq(draftSessions.editionSlug, slug));
  const [edition] = await tx
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  const teamRows = await tx
    .select({
      team: teams,
      captainName: users.username,
      captainPublished: captains.published,
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
    .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)))
    .orderBy(captains.position);
  const members = await tx
    .select({ membership: memberships, username: users.username })
    .from(memberships)
    .innerJoin(users, eq(users.osuId, memberships.userId))
    .where(and(eq(memberships.editionSlug, slug), isNull(memberships.leftAt)))
    .orderBy(memberships.joinedAt);
  const picks = session
    ? await tx
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.sessionId, session.id))
        .orderBy(draftPicks.turnIndex, draftPicks.createdAt)
    : [];
  const identities = session?.pool.length
    ? await tx
        .select({ osuId: users.osuId, username: users.username })
        .from(users)
        .where(inArray(users.osuId, session.pool))
    : [];
  return {
    session: session ?? null,
    edition: edition ?? null,
    teams: teamRows,
    members,
    picks,
    identities,
  };
}
type Data = Awaited<ReturnType<typeof draftData>>;
function availablePool(data: Data) {
  return data.identities.filter(
    (p) => !data.members.some((m) => m.membership.userId === p.osuId),
  );
}
function board(data: Data): DraftBoard {
  const session = data.session!;
  const teamMap = new Map<string, DraftTeam>(
    data.teams.map(({ team, captainName }) => [
      team.id,
      {
        id: team.id,
        name: team.name,
        captain: { osuId: team.captainId, username: captainName },
      },
    ]),
  );
  const identityMap = new Map<number, DraftIdentity>(
    data.identities.map((p) => [p.osuId, p]),
  );
  return {
    sessionId: session.id,
    version: session.publicVersion + 1,
    state: session.state,
    turnIndex: session.turnIndex,
    turnCount: session.turnSequence.length,
    activeTeam: ["ready", "live", "paused"].includes(session.state)
      ? (teamMap.get(session.turnSequence[session.turnIndex]) ?? null)
      : null,
    picks: data.picks
      .filter((p) => !p.voidedAt)
      .map((p) => {
        const team = teamMap.get(p.teamId);
        const player = identityMap.get(p.playerId);
        if (!team || !player)
          throw new HttpError(
            409,
            "Draft identity integrity requires staff recovery.",
          );
        return { id: p.id, turnIndex: p.turnIndex, team, player };
      }),
    rosters: data.teams.map(({ team }) => ({
      team: teamMap.get(team.id)!,
      players: data.members
        .filter((m) => m.membership.teamId === team.id)
        .map((m) => ({ osuId: m.membership.userId, username: m.username })),
    })),
    pool: data.edition?.poolPublished ? availablePool(data) : null,
  };
}
function snapshotUpdate(
  data: Data,
  release = Boolean(data.session?.publicSnapshot),
) {
  const session = data.session!;
  const snapshot = board(data);
  const published =
    release &&
    data.teams.every((t) => t.team.identityPublished && t.captainPublished);
  const captainSnapshot: CaptainBoard = {
    ...snapshot,
    capacities: Object.fromEntries(
      data.teams.map(({ team }) => [team.id, team.capacity]),
    ),
    engineRevision: session.version,
    turnSequence: session.turnSequence,
    eligiblePool: availablePool(data),
  };
  return {
    publicSnapshot: published ? snapshot : null,
    captainSnapshot,
    publicVersion: snapshot.version,
    publishedRevision: published ? session.version : -1,
  };
}
/** Caller holds the edition row lock. Keep approved identity corrections and
 * operational snapshots consistent without adding a parallel publication path. */
export async function refreshDraftSnapshot(
  tx: Pick<ReturnType<typeof db>, "select" | "update">,
  slug: string,
) {
  const data = await draftData(tx, slug);
  if (!data.session?.captainSnapshot) return;
  await tx
    .update(draftSessions)
    .set({ version: data.session.version + 1 })
    .where(eq(draftSessions.id, data.session.id));
  const current = await draftData(tx, slug);
  await tx
    .update(draftSessions)
    .set(snapshotUpdate(current))
    .where(eq(draftSessions.id, current.session!.id));
  return {
    fromVersion: data.session.version,
    toVersion: current.session!.version,
    publicVersion: current.session!.publicVersion + 1,
  };
}
async function acceptedPlayers(tx: Reader, slug: string) {
  return tx
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.editionSlug, slug),
        eq(registrations.status, "accepted"),
        isNull(registrations.draftUnavailableReason),
      ),
    );
}
function unassignedPlayers(
  accepted: Awaited<ReturnType<typeof acceptedPlayers>>,
  data: Data,
) {
  return accepted.filter(
    (p) =>
      !data.teams.some((t) => t.team.captainId === p.userId) &&
      !data.members.some((m) => m.membership.userId === p.userId),
  );
}
function sequenceTeams(data: Data) {
  return data.teams.map(({ team }) => ({
    id: team.id,
    capacity: team.capacity,
    members: data.members.filter((m) => m.membership.teamId === team.id).length,
  }));
}
async function databaseStaffDraft(actor: User, slug: string) {
  await assertReadCapability(actor, "manage_draft", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  return db().transaction(
    async (tx) => {
      const data = await draftData(tx, slug);
      return {
        ...data,
        canConfigure: await hasCapability(
          actor,
          "configure_tournament",
          slug,
          tx,
        ),
        availablePool: availablePool(data),
        setupPoolSize:
          !data.session || data.session.state === "setup"
            ? unassignedPlayers(await acceptedPlayers(tx, slug), data).length
            : null,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function staffDraft(
  actor: User,
  slug: string,
): Promise<Awaited<ReturnType<typeof databaseStaffDraft>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseStaffDraft>>>(
      "staffDraft",
      { slug },
    );
  }
  return databaseStaffDraft(actor, slug);
}

export type StaffDraft = Awaited<ReturnType<typeof staffDraft>>;
async function databasePublicDraft(slug: string) {
  if (!(await getPublicEdition(slug)) || !process.env.DATABASE_URL) return null;
  return db().transaction(
    async (tx) => {
      const [row] = await tx
        .select({
          snapshot: draftSessions.publicSnapshot,
          captain: draftSessions.captainSnapshot,
        })
        .from(draftSessions)
        .where(eq(draftSessions.editionSlug, slug));
      if (!row?.snapshot) return null;
      const approved = await tx
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(
          captains,
          and(
            eq(captains.editionSlug, teams.editionSlug),
            eq(captains.userId, teams.captainId),
          ),
        )
        .where(
          and(
            eq(teams.editionSlug, slug),
            isNull(teams.archivedAt),
            eq(teams.identityPublished, true),
            eq(captains.published, true),
          ),
        );
      if (
        !row.snapshot.rosters.every((r) =>
          approved.some((t) => t.id === r.team.id),
        )
      )
        return null;
      const [visibility] = await tx
        .select({ poolPublished: editionState.poolPublished })
        .from(editionState)
        .where(eq(editionState.slug, slug));
      return {
        ...row.snapshot,
        pool: visibility?.poolPublished
          ? (row.captain?.eligiblePool ?? row.snapshot.pool)
          : null,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function publicDraft(
  slug: string,
): Promise<Awaited<ReturnType<typeof databasePublicDraft>>> {
  if (remoteMode()) {
    return frontendResource<Awaited<ReturnType<typeof databasePublicDraft>>>(
      "publicDraft",
      { slug },
    );
  }
  return databasePublicDraft(slug);
}

async function databaseCaptainDraft(
  actor: User,
  slug: string,
): Promise<CaptainBoard | null> {
  const [appointment] = await db()
    .select()
    .from(captains)
    .where(
      and(eq(captains.editionSlug, slug), eq(captains.userId, actor.osuId)),
    );
  if (!appointment)
    throw new HttpError(403, "Captain access for this edition is required.");
  const [session] = await db()
    .select({ snapshot: draftSessions.captainSnapshot })
    .from(draftSessions)
    .where(eq(draftSessions.editionSlug, slug));
  return session?.snapshot ?? null;
}
export async function captainDraft(
  actor: User,
  slug: string,
): Promise<Awaited<ReturnType<typeof databaseCaptainDraft>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseCaptainDraft>>>(
      "captainDraft",
      { slug },
    );
  }
  return databaseCaptainDraft(actor, slug);
}

const commandSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
    command: z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("configure"),
          expectedSetupVersion: z.number().int().nonnegative(),
          turnSequence: z.array(z.uuid()).max(4096),
        })
        .strict(),
      ...(["unlock", "reset"] as const).map((action) =>
        z
          .object({
            action: z.literal(action),
            expectedSetupVersion: z.number().int().nonnegative(),
          })
          .strict(),
      ),
      ...(
        [
          "ready",
          "start",
          "pause",
          "resume",
          "publish",
          "undo",
          "abort",
          "recover",
          "finalize",
        ] as const
      ).map((action) => z.object({ action: z.literal(action) }).strict()),
    ]),
  })
  .strict();
export async function draftCommand(actor: User, slug: string, input: unknown) {
  await assertCapability(actor, "manage_draft", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm a valid draft command.");
  const { expectedVersion, command } = parsed.data;
  await db().transaction(async (tx) => {
    const [edition] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, "manage_draft", slug, tx);
    await assertOperationalEdition(slug, tx);
    if (!edition)
      throw new HttpError(409, "Configure captains and teams first.");
    if (["configure", "unlock"].includes(command.action))
      await tx
        .insert(draftSessions)
        .values({ editionSlug: slug })
        .onConflictDoNothing();
    const [session] = await tx
      .select()
      .from(draftSessions)
      .where(eq(draftSessions.editionSlug, slug))
      .for("update");
    if (!session || session.version !== expectedVersion)
      throw new HttpError(
        409,
        "Draft revision changed. Refresh the current snapshot.",
      );
    if (["unlock", "reset"].includes(command.action))
      await assertCapability(actor, "configure_tournament", slug, tx);
    const before = {
      setupVersion: edition.setupVersion,
      lockedAt: edition.lockedAt,
      registrationPausedAt: edition.registrationPausedAt,
      state: session.state,
      version: session.version,
      turnIndex: session.turnIndex,
      turnSequence: session.turnSequence,
      pool: session.pool,
      publishedRevision: session.publishedRevision,
      publicVersion: session.publicVersion,
    };
    if (command.action === "publish") {
      if (session.state === "setup")
        throw new HttpError(409, "Freeze and review setup before publication.");
      const data = await draftData(tx, slug);
      if (
        data.teams.some((t) => !t.team.identityPublished || !t.captainPublished)
      )
        throw new HttpError(
          409,
          "Approve and publish all captain/team identities before publishing the draft.",
        );
      const publication = snapshotUpdate(data, true);
      const snapshot = publication.publicSnapshot!;
      await tx
        .update(draftSessions)
        .set(publication)
        .where(eq(draftSessions.id, session.id));
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        kind: "draft_publish",
        detail: {
          entity: { type: "draft_session", id: session.id },
          before: {
            publicVersion: session.publicVersion,
            publishedRevision: session.publishedRevision,
          },
          after: {
            publicVersion: snapshot.version,
            publishedRevision: session.version,
          },
          revision: session.version,
          publicVersion: snapshot.version,
        },
      });
      return;
    }
    const update: Partial<typeof draftSessions.$inferInsert> = {
      version: session.version + 1,
    };
    if (command.action === "unlock" || command.action === "reset") {
      if (command.expectedSetupVersion !== edition.setupVersion)
        throw new HttpError(
          409,
          "Captain/team setup changed. Refresh before saving the order.",
        );
      const data = await draftData(tx, slug);
      const [competition] = await tx
        .select({ id: fixtures.id })
        .from(fixtures)
        .where(
          and(
            eq(fixtures.editionSlug, slug),
            sql`(${fixtures.status} = 'in_progress' OR EXISTS(SELECT 1 FROM match_results r WHERE r.fixture_id = ${fixtures.id}) OR EXISTS(SELECT 1 FROM match_imports i WHERE i.fixture_id = ${fixtures.id}))`,
          ),
        )
        .limit(1);
      if (
        session.state === "finalized" ||
        data.teams.some((t) => t.team.finalizedAt) ||
        competition
      )
        throw new HttpError(
          409,
          "Finalized rosters or match evidence protect this draft. Use supervised competition recovery.",
        );
      const active = data.picks.filter((p) => !p.voidedAt);
      if (command.action === "reset") {
        if (session.state === "live")
          throw new HttpError(
            409,
            "Pause the draft before resetting rehearsal picks.",
          );
        const drafted = data.members.filter(
          (m) => m.membership.origin === "draft",
        );
        if (
          drafted.length !== active.length ||
          active.some(
            (p) =>
              !drafted.some(
                (m) =>
                  m.membership.userId === p.playerId &&
                  m.membership.teamId === p.teamId,
              ),
          )
        )
          throw new HttpError(
            409,
            "Roster integrity requires operator recovery.",
          );
        if (active.length) {
          const now = new Date();
          await tx
            .update(draftPicks)
            .set({ voidedAt: now })
            .where(
              and(
                eq(draftPicks.sessionId, session.id),
                isNull(draftPicks.voidedAt),
              ),
            );
          await tx
            .update(memberships)
            .set({ leftAt: now })
            .where(
              and(
                eq(memberships.editionSlug, slug),
                eq(memberships.origin, "draft"),
                isNull(memberships.leftAt),
                inArray(
                  memberships.userId,
                  active.map((p) => p.playerId),
                ),
              ),
            );
        }
        update.state = "setup";
        update.turnIndex = 0;
        update.pool = [];
      } else update.state = active.length ? "paused" : "setup";
      if (update.state === "setup") {
        update.turnIndex = 0;
        update.publicSnapshot = null;
        update.captainSnapshot = null;
        update.publicVersion = session.publicVersion + 1;
        update.publishedRevision = -1;
      }
      await tx
        .update(editionState)
        .set({ lockedAt: null, setupVersion: edition.setupVersion + 1 })
        .where(eq(editionState.slug, slug));
    } else if (command.action === "configure") {
      if (
        session.state !== "setup" &&
        !(session.state === "paused" && !edition.lockedAt)
      )
        throw new HttpError(409, "Only draft setup can be configured.");
      if (command.expectedSetupVersion !== edition.setupVersion)
        throw new HttpError(
          409,
          "Captain/team setup changed. Refresh before saving the order.",
        );
      const data = await draftData(tx, slug);
      const problem = turnSequenceStructureProblem(
        command.turnSequence,
        sequenceTeams(data),
      );
      if (problem) throw new HttpError(409, problem);
      if (
        data.picks.some(
          (p) => !p.voidedAt && command.turnSequence[p.turnIndex] !== p.teamId,
        )
      )
        throw new HttpError(
          409,
          "Confirmed turns cannot be reassigned or removed. Edit future turns, or explicitly reset the draft.",
        );
      update.turnSequence = command.turnSequence;
    } else if (command.action === "ready" || command.action === "start") {
      if (!["setup", "ready"].includes(session.state))
        throw new HttpError(409, "Only a saved draft setup can start.");
      const data = await draftData(tx, slug);
      const problem = turnSequenceStructureProblem(
        session.turnSequence,
        sequenceTeams(data),
      );
      if (problem) throw new HttpError(409, problem);
      update.pool = unassignedPlayers(
        await acceptedPlayers(tx, slug),
        data,
      ).map((p) => p.userId);
      update.state = command.action === "start" ? "live" : "ready";
      // Protect roster primitives automatically; this is not public approval.
      await tx
        .update(editionState)
        .set({
          lockedAt: edition.lockedAt ?? new Date(),
          registrationPausedAt: edition.registrationPausedAt ?? new Date(),
          setupVersion: edition.setupVersion + (edition.lockedAt ? 0 : 1),
        })
        .where(eq(editionState.slug, slug));
    } else if (command.action === "pause") {
      if (session.state !== "live")
        throw new HttpError(409, "Only a live draft can pause.");
      update.state = "paused";
    } else if (command.action === "resume") {
      if (session.state !== "paused")
        throw new HttpError(409, "Only a paused draft can resume.");
      const data = await draftData(tx, slug);
      const problem = turnSequenceStructureProblem(
        session.turnSequence,
        sequenceTeams(data),
      );
      if (problem) throw new HttpError(409, problem);
      const active = data.picks.filter((p) => !p.voidedAt);
      if (
        active.length !== session.turnIndex ||
        active.some(
          (p, i) => p.turnIndex !== i || p.teamId !== session.turnSequence[i],
        )
      )
        throw new HttpError(409, "Draft/roster invariants are not satisfied.");
      update.pool = [
        ...new Set([
          ...active.map((p) => p.playerId),
          ...unassignedPlayers(await acceptedPlayers(tx, slug), data).map(
            (p) => p.userId,
          ),
        ]),
      ];
      update.state =
        session.turnIndex >= session.turnSequence.length ? "completed" : "live";
      if (!edition.lockedAt)
        await tx
          .update(editionState)
          .set({ lockedAt: new Date(), setupVersion: edition.setupVersion + 1 })
          .where(eq(editionState.slug, slug));
    } else if (command.action === "undo") {
      if (!["paused", "completed"].includes(session.state))
        throw new HttpError(
          409,
          "Pause before supervised correction. Finalized drafts cannot be edited.",
        );
      const data = await draftData(tx, slug);
      const active = data.picks.filter((p) => !p.voidedAt);
      const last = active.at(-1);
      if (!last || last.turnIndex !== session.turnIndex - 1)
        throw new HttpError(409, "No safe last-pick correction is available.");
      const changed = await tx
        .update(memberships)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(memberships.teamId, last.teamId),
            eq(memberships.userId, last.playerId),
            eq(memberships.origin, "draft"),
            isNull(memberships.leftAt),
          ),
        )
        .returning();
      if (changed.length !== 1)
        throw new HttpError(
          409,
          "Roster integrity requires operator recovery.",
        );
      await tx
        .update(draftPicks)
        .set({ voidedAt: new Date() })
        .where(eq(draftPicks.id, last.id));
      update.state = "paused";
      update.turnIndex = last.turnIndex;
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        kind: "draft_pick_voided",
        detail: {
          entity: { type: "draft_pick", id: last.id },
          before: last,
          after: { voided: true, turnIndex: last.turnIndex },
        },
      });
    } else if (command.action === "abort") {
      if (!["setup", "ready", "paused", "completed"].includes(session.state))
        throw new HttpError(
          409,
          "Pause before aborting; finalized drafts cannot be aborted.",
        );
      const data = await draftData(tx, slug);
      await tx
        .update(draftPicks)
        .set({ voidedAt: new Date() })
        .where(
          and(
            eq(draftPicks.sessionId, session.id),
            isNull(draftPicks.voidedAt),
          ),
        );
      await tx
        .update(memberships)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(memberships.editionSlug, slug),
            eq(memberships.origin, "draft"),
            isNull(memberships.leftAt),
          ),
        );
      update.state = "aborted";
      update.turnIndex = 0;
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        kind: "draft_abort_picks",
        detail: {
          entity: { type: "draft_session", id: session.id },
          before: data.picks.filter((p) => !p.voidedAt),
          after: { activePicks: [] },
        },
      });
    } else if (command.action === "recover") {
      if (session.state !== "aborted")
        throw new HttpError(
          409,
          "Only an explicitly aborted draft can be reconfigured.",
        );
      update.state = "setup";
      update.pool = [];
      update.turnIndex = 0;
      update.publicSnapshot = null;
      update.captainSnapshot = null;
      update.publicVersion = session.publicVersion + 1;
      update.publishedRevision = -1;
      await tx
        .update(editionState)
        .set({ lockedAt: null, setupVersion: edition.setupVersion + 1 })
        .where(eq(editionState.slug, slug));
    } else if (command.action === "finalize") {
      if (
        session.state !== "completed" ||
        session.publishedRevision !== session.version
      )
        throw new HttpError(
          409,
          "Complete and publish all picks before finalization.",
        );
      const data = await draftData(tx, slug);
      const active = data.picks.filter((p) => !p.voidedAt);
      if (
        data.members.length !== data.teams.length + active.length ||
        active.length !== session.turnSequence.length ||
        active.some(
          (p, i) =>
            p.turnIndex !== i ||
            p.teamId !== session.turnSequence[i] ||
            !data.members.some(
              (m) =>
                m.membership.teamId === p.teamId &&
                m.membership.userId === p.playerId,
            ),
        ) ||
        data.teams.some(
          (t) =>
            t.team.capacity !== null &&
            data.members.filter((m) => m.membership.teamId === t.team.id)
              .length > t.team.capacity,
        )
      )
        throw new HttpError(409, "Draft/roster invariants are not satisfied.");
      await tx
        .update(teams)
        .set({ finalizedAt: new Date(), rosterPublished: false })
        .where(and(eq(teams.editionSlug, slug), isNull(teams.archivedAt)));
      update.state = "finalized";
    }
    await tx
      .update(draftSessions)
      .set(update)
      .where(eq(draftSessions.id, session.id));
    if (
      !(
        ["recover", "reset"].includes(command.action) ||
        (command.action === "unlock" && update.state === "setup")
      ) &&
      (session.captainSnapshot || ["start", "ready"].includes(command.action))
    ) {
      const publication = snapshotUpdate(await draftData(tx, slug));
      await tx
        .update(draftSessions)
        .set(publication)
        .where(eq(draftSessions.id, session.id));
      update.publicVersion = publication.publicVersion;
      update.publishedRevision = publication.publishedRevision;
    }
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: `draft_${command.action}`,
      detail: {
        entity: { type: "draft_session", id: session.id },
        before,
        after: { ...before, ...update },
        setupAfter: (
          await tx
            .select()
            .from(editionState)
            .where(eq(editionState.slug, slug))
        )[0],
        command,
      },
    });
  });
  return staffDraft(actor, slug);
}
const pickInput = z
  .object({
    sessionId: z.uuid(),
    turnIndex: z.number().int().nonnegative(),
    candidateId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.uuid(),
  })
  .strict();
export async function pickPlayer(actor: User, slug: string, input: unknown) {
  if (!(await getPublicEdition(slug)))
    throw new HttpError(404, "Tournament not found.");
  const parsed = pickInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Send a valid pick with the current turn and revision.",
    );
  const value = parsed.data;
  const requestHash = hashToken(
    JSON.stringify({
      sessionId: value.sessionId,
      turnIndex: value.turnIndex,
      candidateId: value.candidateId,
      expectedVersion: value.expectedVersion,
    }),
  );
  return db().transaction(async (tx) => {
    const [edition] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    const [session] = await tx
      .select()
      .from(draftSessions)
      .where(
        and(
          eq(draftSessions.id, value.sessionId),
          eq(draftSessions.editionSlug, slug),
        ),
      )
      .for("update");
    if (!edition?.lockedAt || !session)
      throw new HttpError(409, "Draft session is not available.");
    const [appointment] = await tx
      .select()
      .from(captains)
      .where(
        and(eq(captains.editionSlug, slug), eq(captains.userId, actor.osuId)),
      );
    const staff = await hasCapability(actor, "manage_draft", slug, tx);
    if (!staff && !appointment)
      throw new HttpError(
        403,
        "Only an appointed captain or authorized staff can pick.",
      );
    const [previous] = await tx
      .select()
      .from(draftPicks)
      .where(
        and(
          eq(draftPicks.sessionId, session.id),
          eq(draftPicks.actorId, actor.osuId),
          eq(draftPicks.requestKey, value.idempotencyKey),
        ),
      );
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new HttpError(
          409,
          "An idempotency key cannot be reused for another request.",
        );
      return {
        pickId: previous.id,
        turnIndex: previous.turnIndex,
        teamId: previous.teamId,
        playerId: previous.playerId,
        corrected: Boolean(previous.voidedAt),
      };
    }
    const [team] = await tx
      .select()
      .from(teams)
      .where(
        and(
          eq(
            teams.id,
            session.turnSequence[session.turnIndex] ??
              "00000000-0000-0000-0000-000000000000",
          ),
          eq(teams.editionSlug, slug),
          isNull(teams.archivedAt),
        ),
      );
    if (
      session.state !== "live" ||
      session.version !== value.expectedVersion ||
      session.turnIndex !== value.turnIndex ||
      !team
    )
      throw new HttpError(
        409,
        "Draft state changed or has not been released. Refresh the authoritative snapshot.",
      );
    if (!staff && team?.captainId !== actor.osuId)
      throw new HttpError(403, "It is another captain’s turn.");
    const [assigned] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.editionSlug, slug),
          eq(memberships.userId, value.candidateId),
          isNull(memberships.leftAt),
        ),
      );
    const roster = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.teamId, team.id), isNull(memberships.leftAt)));
    if (
      !(await acceptedPlayers(tx, slug)).some(
        (p) => p.userId === value.candidateId,
      ) ||
      !session.pool.includes(value.candidateId) ||
      assigned ||
      (team.capacity !== null && roster.length >= team.capacity)
    )
      throw new HttpError(
        409,
        "This player is unavailable or the team is full. Refresh the current pool.",
      );
    const nextVersion = session.version + 1;
    const mode = staff ? "staff_on_behalf" : "captain_direct";
    const [pick] = await tx
      .insert(draftPicks)
      .values({
        sessionId: session.id,
        turnIndex: session.turnIndex,
        teamId: team.id,
        captainId: team.captainId,
        playerId: value.candidateId,
        actorId: actor.osuId,
        mode,
        requestKey: value.idempotencyKey,
        requestHash,
        revision: nextVersion,
      })
      .returning();
    await tx.insert(memberships).values({
      editionSlug: slug,
      teamId: team.id,
      userId: value.candidateId,
      origin: "draft",
    });
    const nextTurn = session.turnIndex + 1;
    await tx
      .update(draftSessions)
      .set({
        version: nextVersion,
        turnIndex: nextTurn,
        state: nextTurn === session.turnSequence.length ? "completed" : "live",
      })
      .where(eq(draftSessions.id, session.id));
    const publication = snapshotUpdate(await draftData(tx, slug));
    await tx
      .update(draftSessions)
      .set(publication)
      .where(eq(draftSessions.id, session.id));
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "draft_pick",
      detail: {
        entity: { type: "draft_pick", id: pick.id },
        pickId: pick.id,
        mode,
        actorRole: staff ? "staff" : "captain",
        captainId: team.captainId,
        teamId: team.id,
        playerId: value.candidateId,
        before: { turnIndex: session.turnIndex, version: session.version },
        after: {
          turnIndex: nextTurn,
          version: nextVersion,
          publicVersion: publication.publicVersion,
        },
      },
    });
    return {
      pickId: pick.id,
      turnIndex: pick.turnIndex,
      teamId: pick.teamId,
      playerId: pick.playerId,
      corrected: false,
    };
  });
}
