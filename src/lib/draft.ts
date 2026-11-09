import { db, readOnlyData } from "@/db";
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
} from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
import { availableDraftPool, buildDraftSnapshots } from "./draft-board";
import { readDraftData, type DraftData } from "./draft-data";
import type { CaptainBoard } from "./draft-types";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import {
  changeDraftWrite,
  pickPlayerWrite,
  type PickPlayerReceipt,
} from "./draft-setup-write-contracts";
import { HttpError } from "./http-error";
import {
  draftSessionReadColumns,
  draftTurnSequence,
} from "./live-season-columns";
type Reader = Pick<ReturnType<typeof db>, "select">;
async function lockDraftSession(tx: Reader, slug: string, id?: string) {
  const [locked] = await tx
    .select({ id: draftSessions.id })
    .from(draftSessions)
    .where(
      and(
        eq(draftSessions.editionSlug, slug),
        id ? eq(draftSessions.id, id) : undefined,
      ),
    )
    .for("update");
  if (!locked) return undefined;
  // Read the child rows after obtaining the owner lock, including legacy writes.
  const [session] = await tx
    .select(draftSessionReadColumns)
    .from(draftSessions)
    .where(eq(draftSessions.id, locked.id));
  return session;
}
async function acceptedPlayers(tx: Reader, slug: string) {
  return tx
    .select({ userId: registrations.userId })
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
  data: DraftData,
) {
  return accepted.filter(
    (p) =>
      !data.teams.some((t) => t.team.captainId === p.userId) &&
      !data.members.some((m) => m.membership.userId === p.userId),
  );
}
function sequenceTeams(data: DraftData) {
  return data.teams.map(({ team }) => ({
    id: team.id,
    capacity: team.capacity,
    members: data.members.filter((m) => m.membership.teamId === team.id).length,
  }));
}
async function databaseStaffDraft(
  actor: User,
  slug: string,
): Promise<StaffDraft> {
  await assertReadCapability(actor, "manage_draft", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  return db().transaction(
    async (tx) => {
      const data = await readDraftData(tx, slug);
      return {
        ...data,
        canConfigure: await hasCapability(
          actor,
          "configure_tournament",
          slug,
          tx,
        ),
        availablePool: availableDraftPool(data),
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
): Promise<StaffDraft> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<StaffDraft>("staffDraft", { slug });
  }
  return databaseStaffDraft(actor, slug);
}

export type StaffDraft =
  import("./explicit-read-contracts").ExplicitReadData<"staffDraft">;
type PublicDraft =
  import("./explicit-read-contracts").ExplicitReadData<"publicDraft">;
async function databasePublicDraft(slug: string): Promise<PublicDraft> {
  if (!(await getPublicEdition(slug)) || !process.env.DATABASE_URL) return null;
  return (await releasedDraftData(slug))?.snapshot ?? null;
}

/** Read publication, pool visibility and Tier evidence from one database snapshot. */
export async function releasedDraftData(slug: string, includeTurns = false) {
  return readOnlyData(async () => {
    const [row] = await db()
      .select({
        snapshot: draftSessions.publicSnapshot,
        captain: draftSessions.captainSnapshot,
        poolPublished: editionState.poolPublished,
        turnSequence: includeTurns
          ? draftTurnSequence
          : sql<string[]>`'[]'::jsonb`,
        revision: draftSessions.version,
        publishedRevision: draftSessions.publishedRevision,
      })
      .from(draftSessions)
      .innerJoin(editionState, eq(editionState.slug, draftSessions.editionSlug))
      .where(
        and(
          eq(draftSessions.editionSlug, slug),
          sql`${editionState.configuration}->>'published' = 'true'`,
        ),
      );
    if (!row?.snapshot) return null;
    const approved = await db()
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
    return {
      snapshot: {
        ...row.snapshot,
        pool: row.poolPublished
          ? (row.captain?.eligiblePool ?? row.snapshot.pool)
          : null,
      },
      turnSequence:
        row.revision === row.publishedRevision ? row.turnSequence : [],
    };
  });
}
export async function publicDraft(slug: string): Promise<PublicDraft> {
  if (remoteMode()) {
    return frontendResource<PublicDraft>("publicDraft", { slug });
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

export async function draftCommand(actor: User, slug: string, input: unknown) {
  await assertCapability(actor, "manage_draft", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  const parsed = changeDraftWrite.request.safeParse(input);
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
    const session = await lockDraftSession(tx, slug);
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
      const data = await readDraftData(tx, slug);
      if (
        data.teams.some((t) => !t.team.identityPublished || !t.captainPublished)
      )
        throw new HttpError(
          409,
          "Approve and publish all captain/team identities before publishing the draft.",
        );
      const publication = buildDraftSnapshots(data, true);
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
      const data = await readDraftData(tx, slug);
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
      const data = await readDraftData(tx, slug);
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
      const data = await readDraftData(tx, slug);
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
      const data = await readDraftData(tx, slug);
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
      const data = await readDraftData(tx, slug);
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
      const data = await readDraftData(tx, slug);
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
      const data = await readDraftData(tx, slug);
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
      const publication = buildDraftSnapshots(await readDraftData(tx, slug));
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
export async function pickPlayer(
  actor: User,
  slug: string,
  input: unknown,
): Promise<PickPlayerReceipt> {
  if (!(await getPublicEdition(slug)))
    throw new HttpError(404, "Tournament not found.");
  const parsed = pickPlayerWrite.request.safeParse(input);
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
    const session = await lockDraftSession(tx, slug, value.sessionId);
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
        publicVersion: session.publicVersion,
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
    const publication = buildDraftSnapshots(await readDraftData(tx, slug));
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
      publicVersion: publication.publicVersion,
    };
  });
}
