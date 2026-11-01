import { streamingFilters } from "./read-api-queries";
export { streamingFilters } from "./read-api-queries";
import { db } from "@/db";
import {
  editionEvents,
  editionState,
  fixtureStreams,
  fixtureCommentators,
  fixtures,
  matchResults,
  resultRevisions,
  staffRoles,
  teams,
  tournamentRounds,
  users,
} from "@/db/schema";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  canRead,
  permits,
  staffAccess,
  type StaffGrant,
} from "./auth/staff";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";

type Reader = Pick<ReturnType<typeof db>, "select">;
export function canViewStreaming(grants: readonly StaffGrant[], slug: string) {
  return canRead(grants, "view_streaming", slug);
}
async function assertView(actor: User, slug: string, reader?: Reader) {
  if (!canViewStreaming(await staffAccess(actor, reader), slug))
    throw new HttpError(403, "Streaming access is required for this edition.");
}
export async function eligibleBroadcastStaff(
  reader: Reader,
  slug: string,
  role: "streamer" | "commentator",
) {
  return reader
    .select({ osuId: users.osuId, username: users.username })
    .from(users)
    .innerJoin(staffRoles, eq(staffRoles.userId, users.osuId))
    .where(
      and(
        eq(staffRoles.role, role),
        isNull(staffRoles.revokedAt),
        or(isNull(staffRoles.editionSlug), eq(staffRoles.editionSlug, slug)),
      ),
    )
    .groupBy(users.osuId, users.username)
    .orderBy(users.username);
}
async function databaseStreamingWorkspace(
  actor: User,
  slug: string,
  input: unknown = {},
  fixtureId?: string,
) {
  await assertView(actor, slug);
  const parsed = streamingFilters.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Choose valid streaming task filters.");
  if (fixtureId && !z.uuid().safeParse(fixtureId).success)
    throw new HttpError(404, "Fixture not found.");
  return db().transaction(
    async (tx) => {
      await assertView(actor, slug, tx);
      const [state] = await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug));
      if (!state?.configuration)
        throw new HttpError(404, "Tournament not found.");
      const grants = await staffAccess(actor, tx);
      const candidates = await eligibleBroadcastStaff(tx, slug, "streamer");
      const commentaryCandidates = await eligibleBroadcastStaff(
        tx,
        slug,
        "commentator",
      );
      const commentaryRows = await tx
        .select({ task: fixtureCommentators })
        .from(fixtureCommentators)
        .innerJoin(fixtures, eq(fixtures.id, fixtureCommentators.fixtureId))
        .where(eq(fixtures.editionSlug, slug));
      const commentary = commentaryRows.map((row) => row.task);
      const rows = await tx
        .select({
          id: fixtures.id,
          label: fixtures.label,
          roundId: fixtures.roundId,
          scheduledAt: fixtures.scheduledAt,
          timeZone: fixtures.timeZone,
          status: fixtures.status,
          version: fixtures.version,
          streamRevision: fixtures.streamRevision,
          homeTeamId: fixtures.homeTeamId,
          awayTeamId: fixtures.awayTeamId,
          homeSourceId: fixtures.homeSourceId,
          awaySourceId: fixtures.awaySourceId,
          homeSourceOutcome: fixtures.homeSourceOutcome,
          awaySourceOutcome: fixtures.awaySourceOutcome,
          roundName: tournamentRounds.name,
          assignment: fixtureStreams,
        })
        .from(fixtures)
        .innerJoin(tournamentRounds, eq(tournamentRounds.id, fixtures.roundId))
        .leftJoin(fixtureStreams, eq(fixtureStreams.fixtureId, fixtures.id))
        .where(eq(fixtures.editionSlug, slug))
        .orderBy(fixtures.scheduledAt, fixtures.position);
      const teamRows = await tx
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(eq(teams.editionSlug, slug));
      const completed = await tx
        .select({ id: resultRevisions.fixtureId })
        .from(resultRevisions)
        .innerJoin(fixtures, eq(fixtures.id, resultRevisions.fixtureId))
        .where(
          and(
            eq(fixtures.editionSlug, slug),
            isNotNull(resultRevisions.approvedAt),
          ),
        );
      const identityIds = [
        ...rows.flatMap((r) =>
          r.assignment ? [r.assignment.userId, r.assignment.assignedBy] : [],
        ),
        ...commentary.flatMap((task) => [task.userId, task.assignedBy]),
      ];
      const names = identityIds.length
        ? await tx
            .select({ osuId: users.osuId, username: users.username })
            .from(users)
            .where(inArray(users.osuId, identityIds))
        : [];
      const name = (id: number) =>
        names.find((u) => u.osuId === id)?.username ?? String(id);
      const filters = parsed.data;
      const workspace = rows.map((f) => {
        const slot = (side: "home" | "away") => {
          const id = side === "home" ? f.homeTeamId : f.awayTeamId;
          const sourceId = side === "home" ? f.homeSourceId : f.awaySourceId;
          const outcome =
            side === "home" ? f.homeSourceOutcome : f.awaySourceOutcome;
          const source = rows.find((r) => r.id === sourceId);
          return {
            name: teamRows.find((t) => t.id === id)?.name ?? null,
            source: source?.label ?? null,
            outcome,
          };
        };
        const task = f.assignment;
        const done = completed.some((r) => r.id === f.id);
        const otherBookings = f.scheduledAt
          ? rows.filter(
              (other) =>
                other.id !== f.id &&
                other.status !== "cancelled" &&
                !completed.some((r) => r.id === other.id) &&
                other.scheduledAt?.getTime() === f.scheduledAt?.getTime(),
            )
          : [];
        const bookedUsers = (id: string) => [
          ...rows
            .filter((row) => row.id === id && row.assignment)
            .map((row) => row.assignment!.userId),
          ...commentary
            .filter((row) => row.fixtureId === id)
            .map((row) => row.userId),
        ];
        const conflictsFor = (userId: number) =>
          f.status !== "cancelled" && !done
            ? otherBookings
                .filter((other) => bookedUsers(other.id).includes(userId))
                .map((other) => ({ id: other.id, label: other.label }))
            : [];
        const assignment = (
          task: typeof fixtureStreams.$inferSelect,
          eligible: { osuId: number }[],
        ) => ({
          userId: task.userId,
          username: name(task.userId),
          source: task.source,
          assignedBy: task.assignedBy,
          assignedByName: name(task.assignedBy),
          assignedAt: task.assignedAt.toISOString(),
          eligible: eligible.some((u) => u.osuId === task.userId),
          needsConfirmation:
            task.confirmedScheduledAt?.getTime() !== f.scheduledAt?.getTime() ||
            task.confirmedTimeZone !== f.timeZone,
        });
        return {
          id: f.id,
          label: f.label,
          roundId: f.roundId,
          roundName: f.roundName,
          scheduledAt: f.scheduledAt?.toISOString() ?? null,
          timeZone: f.timeZone,
          status: f.status,
          completed: done,
          version: f.version,
          streamRevision: f.streamRevision,
          home: slot("home"),
          away: slot("away"),
          conflicts: task ? conflictsFor(task.userId) : [],
          sameStartBookings: otherBookings.flatMap((other) =>
            [...new Set(bookedUsers(other.id))].map((userId) => ({
              userId,
              label: other.label,
            })),
          ),
          assignment: task ? assignment(task, candidates) : null,
          commentators: commentary
            .filter((task) => task.fixtureId === f.id)
            .map((task) => ({
              ...assignment(task, commentaryCandidates),
              conflicts: conflictsFor(task.userId),
            })),
        };
      });
      const selected = workspace.filter(
        (f) =>
          (!fixtureId || f.id === fixtureId) &&
          (!filters.round || f.roundId === filters.round) &&
          (!filters.date ||
            (f.scheduledAt &&
              new Intl.DateTimeFormat("en-CA", {
                timeZone: f.timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(f.scheduledAt)) === filters.date)) &&
          (filters.view !== "mine" ||
            f.assignment?.userId === actor.osuId ||
            f.commentators.some((task) => task.userId === actor.osuId)) &&
          (filters.view !== "unassigned" ||
            (((!f.assignment &&
              candidates.some((user) => user.osuId === actor.osuId)) ||
              (!f.commentators.length &&
                commentaryCandidates.some(
                  (user) => user.osuId === actor.osuId,
                )) ||
              (permits(grants, "manage_streaming", slug) &&
                (!f.assignment || !f.commentators.length))) &&
              f.status === "scheduled" &&
              !f.completed)),
      );
      if (fixtureId && !selected.length)
        throw new HttpError(404, "Fixture not found.");
      const history = fixtureId
        ? await tx
            .select({
              id: editionEvents.id,
              actorId: editionEvents.actorId,
              createdAt: editionEvents.createdAt,
              detail: editionEvents.detail,
            })
            .from(editionEvents)
            .where(
              and(
                eq(editionEvents.editionSlug, slug),
                eq(editionEvents.kind, "streaming_task"),
                sql`${editionEvents.detail}->>'fixtureId' = ${fixtureId}`,
              ),
            )
            .orderBy(desc(editionEvents.createdAt))
            .limit(100)
        : [];
      return {
        actorId: actor.osuId,
        canManage: permits(grants, "manage_streaming", slug),
        canSelect:
          permits(grants, "select_streaming", slug) &&
          candidates.some((u) => u.osuId === actor.osuId),
        canSelectCommentary:
          permits(grants, "select_streaming", slug) &&
          commentaryCandidates.some((u) => u.osuId === actor.osuId),
        commentaryCandidates: permits(grants, "manage_streaming", slug)
          ? commentaryCandidates
          : [],
        operational:
          !state.configuration.archive &&
          state.configuration.status !== "completed",
        candidates: permits(grants, "manage_streaming", slug) ? candidates : [],
        filters,
        rounds: [
          ...new Map(
            rows.map((r) => [r.roundId, { id: r.roundId, name: r.roundName }]),
          ).values(),
        ],
        fixtures: selected,
        history: history.map((h) => ({
          ...h,
          createdAt: h.createdAt.toISOString(),
        })),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function streamingWorkspace(
  actor: User,
  slug: string,
  input: unknown = {},
  fixtureId?: string,
): Promise<Awaited<ReturnType<typeof databaseStreamingWorkspace>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<
      Awaited<ReturnType<typeof databaseStreamingWorkspace>>
    >("streamingWorkspace", { slug, input, fixtureId });
  }
  return databaseStreamingWorkspace(actor, slug, input, fixtureId);
}

const commandSchema = z
  .object({
    action: z.enum(["select", "assign", "cancel", "reconfirm"]),
    task: z.literal("commentary").optional(),
    userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    requestKey: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    expectedFixtureVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  })
  .strict();
export async function streamingCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
) {
  const access = await staffAccess(actor);
  if (
    !permits(access, "select_streaming", slug) &&
    !permits(access, "manage_streaming", slug)
  )
    throw new HttpError(403, "You do not have permission for this operation.");
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(fixtureId).success)
    throw new HttpError(400, "Confirm a valid streaming task change.");
  const c = parsed.data;
  const commentaryTask = c.task === "commentary";
  const table = commentaryTask ? fixtureCommentators : fixtureStreams;
  if (
    (c.action === "assign" && c.userId === undefined) ||
    (c.userId !== undefined &&
      c.action !== "assign" &&
      !(commentaryTask && (c.action === "cancel" || c.action === "reconfirm")))
  )
    throw new HttpError(
      400,
      "Only assignment or an individual commentary change accepts a target user.",
    );
  await assertCapability(
    actor,
    c.action === "assign"
      ? "manage_streaming"
      : c.action === "select"
        ? "select_streaming"
        : "view_streaming",
    slug,
  );
  return db().transaction(async (tx) => {
    // Same lock as role management; eligibility/revocation and writes are serialized.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await assertCapability(
      actor,
      c.action === "assign"
        ? "manage_streaming"
        : c.action === "select"
          ? "select_streaming"
          : "view_streaming",
      slug,
      tx,
    );
    const [state] = await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    if (!state?.configuration)
      throw new HttpError(404, "Tournament not found.");
    const command = { ...c, fixtureId };
    const [prior] = await tx
      .select()
      .from(editionEvents)
      .where(eq(editionEvents.id, c.requestKey));
    if (prior) {
      if (
        prior.kind !== "streaming_task" ||
        prior.actorId !== actor.osuId ||
        prior.editionSlug !== slug ||
        !isDeepStrictEqual(prior.detail.command, command)
      )
        throw new HttpError(
          409,
          "This request key was already used for a different operation.",
        );
      return { saved: true, replayed: true };
    }
    await assertOperationalEdition(slug, tx);
    const [fixture] = await tx
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)))
      .for("update");
    if (!fixture) throw new HttpError(404, "Fixture not found.");
    const [before] = await tx
      .select()
      .from(table)
      .where(
        and(
          eq(table.fixtureId, fixtureId),
          commentaryTask
            ? eq(table.userId, c.userId ?? actor.osuId)
            : undefined,
        ),
      );
    const grants = await staffAccess(actor, tx);
    const manager = permits(grants, "manage_streaming", slug);
    if ((c.action === "cancel" || c.action === "reconfirm") && !manager) {
      await assertCapability(actor, "select_streaming", slug, tx);
      const eligible = await eligibleBroadcastStaff(
        tx,
        slug,
        commentaryTask ? "commentator" : "streamer",
      );
      if (
        before?.userId !== actor.osuId ||
        !eligible.some((user) => user.osuId === actor.osuId)
      )
        throw new HttpError(
          403,
          "You may change only your own streaming task.",
        );
    }
    if (
      fixture.streamRevision !== c.expectedRevision ||
      fixture.version !== c.expectedFixtureVersion
    )
      throw new HttpError(
        409,
        "The fixture or streaming task changed. Refresh before continuing.",
      );
    if (c.action !== "cancel") {
      const [approved] = await tx
        .select({ id: resultRevisions.fixtureId })
        .from(resultRevisions)
        .where(
          and(
            eq(resultRevisions.fixtureId, fixtureId),
            isNotNull(resultRevisions.approvedAt),
          ),
        )
        .limit(1);
      const [result] = await tx
        .select()
        .from(matchResults)
        .where(eq(matchResults.fixtureId, fixtureId));
      if (
        fixture.status !== "scheduled" ||
        approved ||
        result?.state === "approved" ||
        state.configuration.status === "completed"
      )
        throw new HttpError(
          409,
          "Only upcoming, unfinished fixtures accept streaming bookings.",
        );
      const target =
        c.action === "assign"
          ? c.userId!
          : c.action === "reconfirm"
            ? before?.userId
            : actor.osuId;
      if (
        !target ||
        !(
          await eligibleBroadcastStaff(
            tx,
            slug,
            commentaryTask ? "commentator" : "streamer",
          )
        ).some((u) => u.osuId === target)
      )
        throw new HttpError(
          400,
          commentaryTask
            ? "Choose an active Commentator authorized for this edition."
            : "Choose an active Streamer authorized for this edition.",
        );
      if (
        before &&
        (c.action === "select" || (commentaryTask && c.action === "assign"))
      )
        throw new HttpError(
          409,
          commentaryTask
            ? "This Commentator already has a task for this fixture."
            : "This fixture already has a Streamer. Self-selection cannot replace a booking.",
        );
      if (c.action === "reconfirm" && !before)
        throw new HttpError(409, "There is no streaming task to reconfirm.");
      if (c.action === "reconfirm") {
        await tx
          .update(table)
          .set({
            confirmedScheduledAt: fixture.scheduledAt,
            confirmedTimeZone: fixture.timeZone,
          })
          .where(
            and(
              eq(table.fixtureId, fixtureId),
              eq(table.userId, before!.userId),
            ),
          );
      } else {
        const values = {
          fixtureId,
          userId: target,
          source:
            c.action === "select" ? ("self" as const) : ("staff" as const),
          assignedBy: actor.osuId,
          assignedAt: new Date(),
          confirmedScheduledAt: fixture.scheduledAt,
          confirmedTimeZone: fixture.timeZone,
        };
        if (commentaryTask) await tx.insert(fixtureCommentators).values(values);
        else
          await tx.insert(fixtureStreams).values(values).onConflictDoUpdate({
            target: fixtureStreams.fixtureId,
            set: values,
          });
      }
    } else {
      if (!before)
        throw new HttpError(409, "There is no streaming task to cancel.");
      await tx
        .delete(table)
        .where(
          and(eq(table.fixtureId, fixtureId), eq(table.userId, before.userId)),
        );
    }
    await tx
      .update(fixtures)
      .set({ streamRevision: fixture.streamRevision + 1 })
      .where(eq(fixtures.id, fixtureId));
    const [after] = await tx
      .select()
      .from(table)
      .where(
        and(
          eq(table.fixtureId, fixtureId),
          commentaryTask
            ? eq(table.userId, c.userId ?? actor.osuId)
            : undefined,
        ),
      );
    await tx.insert(editionEvents).values({
      id: c.requestKey,
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "streaming_task",
      detail: {
        entity: { type: "fixture", id: fixtureId },
        fixtureId,
        command,
        before: before ?? null,
        after: after ?? null,
        fixture: {
          label: fixture.label,
          scheduledAt: fixture.scheduledAt,
          timeZone: fixture.timeZone,
          version: fixture.version,
        },
        revision: fixture.streamRevision + 1,
      },
    });
    return { saved: true, replayed: false };
  });
}
export type StreamingWorkspace = Awaited<ReturnType<typeof streamingWorkspace>>;
