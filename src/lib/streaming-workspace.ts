import { isActiveFixtureStatus } from "./fixture-status";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  editionEvents,
  fixtureCommentators,
  fixtureStreams,
  fixtures,
  resultRevisions,
  teams,
  tournamentRounds,
  users,
} from "@/db/schema";
import { editionOperationState } from "./archive-guard";
import type { User } from "./auth/sessions";
import { permits, staffAccess } from "./auth/staff";
import { remoteMode } from "./data-source";
import { openExhibitionSides } from "./exhibition-sides";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import { streamingFilters } from "./read-api-queries";
import { canViewStreaming, eligibleBroadcastStaff } from "./streaming-staff";

type Reader = Pick<ReturnType<typeof db>, "select">;
export type StreamingWorkspace = ExplicitReadData<"streamingWorkspace">;

async function assertView(actor: User, slug: string, reader?: Reader) {
  if (!canViewStreaming(await staffAccess(actor, reader), slug))
    throw new HttpError(403, "Streaming access is required for this edition.");
}

async function databaseStreamingWorkspace(
  actor: User,
  slug: string,
  input: unknown = {},
  fixtureId?: string,
): Promise<StreamingWorkspace> {
  await assertView(actor, slug);
  const parsed = streamingFilters.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Choose valid streaming task filters.");
  if (fixtureId && !z.uuid().safeParse(fixtureId).success)
    throw new HttpError(404, "Fixture not found.");
  return db().transaction(
    async (tx) => {
      await assertView(actor, slug, tx);
      const state = await editionOperationState(slug, tx);
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
          exhibitionSides: fixtures.exhibitionSides,
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
          const sides = openExhibitionSides(f);
          if (sides)
            return {
              name: side === "home" ? sides.redName : sides.blueName,
              source: null,
              outcome: null,
            };
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
        const done =
          f.status === "ended" || completed.some((r) => r.id === f.id);
        const otherBookings = f.scheduledAt
          ? rows.filter(
              (other) =>
                other.id !== f.id &&
                isActiveFixtureStatus(other.status) &&
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
          isActiveFixtureStatus(f.status) && !done
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
          !state.hasArchive && state.configuration.status !== "completed",
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
): Promise<StreamingWorkspace> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<StreamingWorkspace>("streamingWorkspace", {
      slug,
      input,
      fixtureId,
    });
  }
  return databaseStreamingWorkspace(actor, slug, input, fixtureId);
}
