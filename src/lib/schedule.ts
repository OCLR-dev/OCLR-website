import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  captains,
  editionEvents,
  editionState,
  fixtureReferees,
  fixtureStreams,
  fixtureCommentators,
  fixtures,
  matchResults,
  memberships,
  refereeEvents,
  resultAuditEvents,
  resultRevisions,
  scheduleAvailability,
  scheduleEvents,
  scheduleRequests,
  teams,
  tournamentRounds,
  users,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertBusinessWrite, permits, staffAccess } from "./auth/staff";
import { remoteMode } from "./data-source";
import { inReadChannel } from "./read-channel";
import { HttpError } from "./http";
import { publicCompetition } from "./public-competition";
import {
  activeSchedule,
  availabilitySchema,
  availabilitySummary,
  scheduleStatus,
  type ScheduleBasis,
} from "./schedule-model";

type Reader = Pick<ReturnType<typeof db>, "select">;
function localOnly() {
  if (remoteMode() || inReadChannel())
    throw new HttpError(
      403,
      "Schedule requests require a direct browser session.",
    );
}
async function context(reader: Reader, actor: User, slug: string) {
  const [state] = await reader
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!state?.configuration) throw new HttpError(404, "Tournament not found.");
  const grants = await staffAccess(actor, reader);
  const admin = permits(grants, "manage_fixtures", slug);
  const teamRows = await reader
    .select()
    .from(teams)
    .where(eq(teams.editionSlug, slug));
  const memberRows = await reader
    .select({ membership: memberships, username: users.username })
    .from(memberships)
    .innerJoin(users, eq(users.osuId, memberships.userId))
    .where(and(eq(memberships.editionSlug, slug), isNull(memberships.leftAt)));
  const appointments = await reader
    .select()
    .from(captains)
    .where(eq(captains.editionSlug, slug));
  const currentCaptain = (teamId: string | null) => {
    const team = teamRows.find((t) => t.id === teamId && !t.archivedAt);
    return team &&
      appointments.some((c) => c.userId === team.captainId) &&
      memberRows.some(
        (m) =>
          m.membership.teamId === team.id &&
          m.membership.userId === team.captainId,
      )
      ? team.captainId
      : null;
  };
  const own = memberRows.find(
    (m) =>
      m.membership.userId === actor.osuId &&
      teamRows.some((t) => t.id === m.membership.teamId && !t.archivedAt),
  );
  if (!admin && (!own || !state.configuration.published))
    throw new HttpError(
      403,
      "Schedule access requires current team membership.",
    );
  const matches = await reader
    .select({ fixture: fixtures, roundName: tournamentRounds.name })
    .from(fixtures)
    .innerJoin(tournamentRounds, eq(tournamentRounds.id, fixtures.roundId))
    .where(eq(fixtures.editionSlug, slug))
    .orderBy(asc(fixtures.scheduledAt));
  const results = await reader
    .select({ id: matchResults.fixtureId })
    .from(matchResults)
    .innerJoin(fixtures, eq(fixtures.id, matchResults.fixtureId))
    .where(eq(fixtures.editionSlug, slug));
  const revisions = await reader
    .select({ id: resultRevisions.fixtureId })
    .from(resultRevisions)
    .innerJoin(fixtures, eq(fixtures.id, resultRevisions.fixtureId))
    .where(eq(fixtures.editionSlug, slug));
  const sessions = await reader
    .select({ id: refereeEvents.fixtureId })
    .from(refereeEvents)
    .innerJoin(fixtures, eq(fixtures.id, refereeEvents.fixtureId))
    .where(
      and(
        eq(fixtures.editionSlug, slug),
        sql`${refereeEvents.payload}->>'type' NOT IN ('settings_saved','policy_configured','dependencies_reconfirmed')`,
      ),
    );
  const published = await publicCompetition(slug, reader);
  const confirmedIds = new Set(
    published?.fixtures.filter((f) => f.confirmed).map((f) => f.id) ?? [],
  );
  const now = Date.now();
  const match = (f: typeof fixtures.$inferSelect) => {
    const homeCaptainId = currentCaptain(f.homeTeamId),
      awayCaptainId = currentCaptain(f.awayTeamId);
    const basis: ScheduleBasis | null =
      f.scheduledAt &&
      f.homeTeamId &&
      f.awayTeamId &&
      homeCaptainId &&
      awayCaptainId
        ? {
            scheduledAt: f.scheduledAt.toISOString(),
            timeZone: f.timeZone,
            homeTeamId: f.homeTeamId,
            awayTeamId: f.awayTeamId,
            homeCaptainId,
            awayCaptainId,
          }
        : null;
    const eligible = Boolean(
      confirmedIds.has(f.id) &&
      basis &&
      homeCaptainId !== awayCaptainId &&
      state.configuration?.published &&
      !state.configuration.archive &&
      !state.lockedAt &&
      state.configuration.status !== "completed" &&
      f.publishedAt &&
      f.status === "scheduled" &&
      f.scheduledAt!.getTime() > now &&
      !results.some((r) => r.id === f.id) &&
      !revisions.some((r) => r.id === f.id) &&
      !sessions.some((r) => r.id === f.id),
    );
    return { basis, eligible };
  };
  return {
    state,
    admin,
    teamRows,
    memberRows,
    own,
    currentCaptain,
    matches,
    confirmedIds,
    match,
    now,
  };
}
export async function scheduleWorkspace(actor: User, slug: string) {
  localOnly();
  return db().transaction(
    async (tx) => {
      const c = await context(tx, actor, slug);
      const visible = c.matches.filter(
        ({ fixture: f }) =>
          c.admin ||
          (f.publishedAt &&
            [f.homeTeamId, f.awayTeamId].includes(c.own!.membership.teamId)),
      );
      const requestRows = await tx
        .select()
        .from(scheduleRequests)
        .where(eq(scheduleRequests.editionSlug, slug))
        .orderBy(asc(scheduleRequests.updatedAt));
      const requests = requestRows.filter(
        (r) => c.admin || visible.some((v) => v.fixture.id === r.fixtureId),
      );
      const events = requests.length
        ? await tx
            .select()
            .from(scheduleEvents)
            .where(
              inArray(
                scheduleEvents.requestId,
                requests.map((r) => r.id),
              ),
            )
            .orderBy(asc(scheduleEvents.createdAt))
        : [];
      // Staff review never loads personal availability. Captains only read their own team's rows.
      const ownTeamId = c.own?.membership.teamId;
      const captain = ownTeamId
        ? c.currentCaptain(ownTeamId) === actor.osuId
        : false;
      const roster = c.memberRows.filter(
        (m) =>
          m.membership.teamId === ownTeamId &&
          (captain || m.membership.userId === actor.osuId),
      );
      const availability =
        visible.length && roster.length
          ? await tx
              .select()
              .from(scheduleAvailability)
              .where(
                and(
                  inArray(
                    scheduleAvailability.fixtureId,
                    visible.map((v) => v.fixture.id),
                  ),
                  inArray(
                    scheduleAvailability.userId,
                    roster.map((m) => m.membership.userId),
                  ),
                ),
              )
          : [];
      const refereeRows = c.admin
        ? await tx
            .select()
            .from(fixtureReferees)
            .innerJoin(fixtures, eq(fixtures.id, fixtureReferees.fixtureId))
            .where(eq(fixtures.editionSlug, slug))
        : [];
      const streamRows = c.admin
        ? await tx
            .select()
            .from(fixtureStreams)
            .innerJoin(fixtures, eq(fixtures.id, fixtureStreams.fixtureId))
            .where(eq(fixtures.editionSlug, slug))
        : [];
      const commentaryRows = c.admin
        ? await tx
            .select({
              userId: fixtureCommentators.userId,
              fixtureId: fixtureCommentators.fixtureId,
            })
            .from(fixtureCommentators)
            .innerJoin(fixtures, eq(fixtures.id, fixtureCommentators.fixtureId))
            .where(eq(fixtures.editionSlug, slug))
        : [];
      const broadcastBookings = [
        ...streamRows.map((row) => ({
          fixtureId: row.fixture_streams.fixtureId,
          userId: row.fixture_streams.userId,
        })),
        ...commentaryRows,
      ];
      const name = (id: number) =>
        c.memberRows.find((m) => m.membership.userId === id)?.username ??
        String(id);
      return {
        admin: c.admin,
        actorId: actor.osuId,
        captain,
        ownTeamId: ownTeamId ?? null,
        fixtures: visible.map(({ fixture: f, roundName }) => {
          const { eligible } = c.match(f);
          const rows = availability.filter(
            (a) =>
              a.fixtureId === f.id &&
              roster.some((m) => m.membership.id === a.membershipId),
          );
          const ownRow = availability.find(
            (a) => a.fixtureId === f.id && a.userId === actor.osuId,
          );
          return {
            id: f.id,
            label: f.label,
            roundId: f.roundId,
            roundName,
            version: f.version,
            timeZone: f.timeZone,
            scheduledAt: f.scheduledAt?.toISOString() ?? null,
            eligible,
            home: c.teamRows.find((t) => t.id === f.homeTeamId)?.name ?? "TBA",
            away: c.teamRows.find((t) => t.id === f.awayTeamId)?.name ?? "TBA",
            participant: Boolean(
              ownTeamId && [f.homeTeamId, f.awayTeamId].includes(ownTeamId),
            ),
            ownAvailability: {
              version: ownRow?.version ?? 0,
              intervals:
                rows.find((a) => a.userId === actor.osuId)?.intervals ?? [],
            },
            roster: captain
              ? roster.map((m) => ({
                  userId: m.membership.userId,
                  username: m.username,
                  intervals:
                    rows.find((a) => a.userId === m.membership.userId)
                      ?.intervals ?? [],
                }))
              : [],
            summary: captain ? availabilitySummary(rows) : [],
            unreported: captain
              ? roster.filter(
                  (m) =>
                    !rows.some(
                      (a) =>
                        a.userId === m.membership.userId && a.intervals.length,
                    ),
                ).length
              : 0,
            sameStart: visible
              .filter(
                (v) =>
                  v.fixture.id !== f.id &&
                  v.fixture.status !== "cancelled" &&
                  f.scheduledAt &&
                  v.fixture.scheduledAt?.getTime() ===
                    f.scheduledAt.getTime() &&
                  ([f.homeTeamId, f.awayTeamId].some(
                    (id) =>
                      id &&
                      [v.fixture.homeTeamId, v.fixture.awayTeamId].includes(id),
                  ) ||
                    refereeRows.some(
                      (r) =>
                        r.fixture_referees.fixtureId === f.id &&
                        refereeRows.some(
                          (o) =>
                            o.fixture_referees.fixtureId === v.fixture.id &&
                            o.fixture_referees.userId ===
                              r.fixture_referees.userId,
                        ),
                    ) ||
                    broadcastBookings.some(
                      (booking) =>
                        booking.fixtureId === f.id &&
                        broadcastBookings.some(
                          (other) =>
                            other.fixtureId === v.fixture.id &&
                            other.userId === booking.userId,
                        ),
                    )),
              )
              .map((v) => v.fixture.label),
            referees: refereeRows
              .filter((r) => r.fixture_referees.fixtureId === f.id)
              .map((r) => r.fixture_referees.userId),
            commentators: commentaryRows
              .filter((row) => row.fixtureId === f.id)
              .map((row) => row.userId),
            streamer:
              streamRows.find((r) => r.fixture_streams.fixtureId === f.id)
                ?.fixture_streams.userId ?? null,
          };
        }),
        requests: requests.map((r) => {
          const f = c.matches.find(
            (m) => m.fixture.id === r.fixtureId,
          )?.fixture;
          const live = f ? c.match(f) : null;
          return {
            id: r.id,
            fixtureId: r.fixtureId,
            label: r.label,
            basis: r.basis,
            proposedAt: r.proposedAt.toISOString(),
            proposerId: r.proposerId,
            proposerName: name(r.proposerId),
            status: scheduleStatus(
              r.status,
              live?.eligible ?? false,
              r.basis,
              live?.basis ?? null,
              r.proposedAt.toISOString(),
              c.now,
            ),
            version: r.version,
            decisionNote: r.decisionNote,
            updatedAt: r.updatedAt.toISOString(),
            canReview:
              c.admin &&
              actor.osuId !== r.basis.homeCaptainId &&
              actor.osuId !== r.basis.awayCaptainId,
            history: events
              .filter((e) => e.requestId === r.id)
              .map((e) => {
                const after = e.detail.after;
                const proposedAt =
                  after &&
                  typeof after === "object" &&
                  "proposedAt" in after &&
                  typeof after.proposedAt === "string"
                    ? after.proposedAt
                    : null;
                return {
                  id: e.id,
                  action: e.action,
                  actor:
                    e.actorId &&
                    (c.admin ||
                      [r.basis.homeCaptainId, r.basis.awayCaptainId].includes(
                        e.actorId,
                      ))
                      ? name(e.actorId)
                      : null,
                  at: e.createdAt.toISOString(),
                  proposedAt,
                };
              }),
          };
        }),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type ScheduleWorkspace = Awaited<ReturnType<typeof scheduleWorkspace>>;
const common = {
  fixtureId: z.uuid(),
  expectedFixtureVersion: z.number().int().nonnegative(),
  requestKey: z.uuid(),
};
const version = {
  requestId: z.uuid(),
  expectedVersion: z.number().int().positive(),
};
const command = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("availability"),
      expectedVersion: z.number().int().nonnegative(),
      intervals: availabilitySchema,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("propose"),
      requestId: z.uuid().nullable(),
      expectedVersion: z.number().int().nonnegative(),
      proposedAt: z.iso.datetime({ offset: true }),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...common,
      ...version,
      action: z.enum(["accept", "withdraw", "reject", "approve"]),
      confirmed: z.literal(true),
      decisionNote: z.string().trim().max(1000).optional(),
    })
    .strict(),
]);
export async function scheduleCommand(
  actor: User,
  slug: string,
  input: unknown,
) {
  localOnly();
  await assertBusinessWrite(actor, slug);
  const parsed = command.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Enter valid schedule details and the current revision.",
    );
  const cmd = parsed.data;
  const hash = createHash("sha256").update(JSON.stringify(cmd)).digest("hex");
  return db().transaction(async (tx) => {
    // Same lock order as role changes, fixture editing, results and referee start.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertBusinessWrite(actor, slug, tx);
    const c = await context(tx, actor, slug);
    const f = c.matches.find((m) => m.fixture.id === cmd.fixtureId)?.fixture;
    if (
      !f ||
      (!c.admin &&
        (!c.confirmedIds.has(f.id) ||
          ![f.homeTeamId, f.awayTeamId].includes(c.own!.membership.teamId)))
    )
      throw new HttpError(404, "Fixture not found.");
    const [prior] = await tx
      .select()
      .from(scheduleEvents)
      .where(
        and(
          eq(scheduleEvents.editionSlug, slug),
          eq(scheduleEvents.actorId, actor.osuId),
          eq(scheduleEvents.requestKey, cmd.requestKey),
        ),
      );
    if (prior) {
      if (prior.requestHash !== hash)
        throw new HttpError(
          409,
          "This request key was already used for a different operation.",
        );
      return { saved: true };
    }
    const live = c.match(f);
    if (!live.eligible || !live.basis)
      throw new HttpError(
        409,
        "This fixture is no longer available for rescheduling.",
      );
    if (f.version !== cmd.expectedFixtureVersion)
      throw new HttpError(
        409,
        "The schedule changed. Reload before continuing.",
      );
    let requestId: string | null = null;
    let detail: Record<string, unknown>;
    if (cmd.action === "availability") {
      if (
        !c.own ||
        ![f.homeTeamId, f.awayTeamId].includes(c.own.membership.teamId)
      )
        throw new HttpError(
          403,
          "Only current players can save their own availability.",
        );
      const [before] = await tx
        .select()
        .from(scheduleAvailability)
        .where(
          and(
            eq(scheduleAvailability.fixtureId, f.id),
            eq(scheduleAvailability.userId, actor.osuId),
          ),
        );
      if ((before?.version ?? 0) !== cmd.expectedVersion)
        throw new HttpError(
          409,
          "The schedule changed. Reload before continuing.",
        );
      await tx
        .insert(scheduleAvailability)
        .values({
          fixtureId: f.id,
          userId: actor.osuId,
          membershipId: c.own.membership.id,
          intervals: cmd.intervals,
          version: cmd.expectedVersion + 1,
        })
        .onConflictDoUpdate({
          target: [scheduleAvailability.fixtureId, scheduleAvailability.userId],
          set: {
            intervals: cmd.intervals,
            version: cmd.expectedVersion + 1,
            membershipId: c.own.membership.id,
          },
        });
      detail = { fixtureId: f.id, version: cmd.expectedVersion + 1 }; // personal intervals are not copied into shared audit/history
    } else {
      const isCaptain = [
        live.basis.homeCaptainId,
        live.basis.awayCaptainId,
      ].includes(actor.osuId);
      if (
        !isCaptain &&
        !(c.admin && ["approve", "reject"].includes(cmd.action))
      )
        throw new HttpError(
          403,
          "Only the participating captains can negotiate this request.",
        );
      const rows = await tx
        .select()
        .from(scheduleRequests)
        .where(
          and(
            eq(scheduleRequests.fixtureId, f.id),
            eq(scheduleRequests.editionSlug, slug),
          ),
        );
      for (const row of rows)
        if (
          activeSchedule(row.status) &&
          scheduleStatus(
            row.status,
            true,
            row.basis,
            live.basis,
            row.proposedAt.toISOString(),
            c.now,
          ) === "expired"
        )
          await tx
            .update(scheduleRequests)
            .set({
              status: "expired",
              version: row.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(scheduleRequests.id, row.id));
      const before = cmd.requestId
        ? rows.find((r) => r.id === cmd.requestId)
        : null;
      if (
        cmd.requestId &&
        (!before ||
          before.version !== cmd.expectedVersion ||
          scheduleStatus(
            before.status,
            true,
            before.basis,
            live.basis,
            before.proposedAt.toISOString(),
            c.now,
          ) === "expired")
      )
        throw new HttpError(
          409,
          "The schedule changed. Reload before continuing.",
        );
      if (cmd.action === "propose") {
        if (!isCaptain)
          throw new HttpError(
            403,
            "Only the participating captains can negotiate this request.",
          );
        if (
          Date.parse(cmd.proposedAt) <= c.now ||
          Date.parse(cmd.proposedAt) === f.scheduledAt!.getTime()
        )
          throw new HttpError(
            400,
            "Choose a future time different from the official time.",
          );
        if (before && before.status !== "waiting")
          throw new HttpError(
            409,
            "Withdraw the pending request before proposing another time.",
          );
        if (
          !before &&
          (cmd.expectedVersion !== 0 ||
            rows.some(
              (r) =>
                activeSchedule(r.status) &&
                scheduleStatus(
                  r.status,
                  true,
                  r.basis,
                  live.basis,
                  r.proposedAt.toISOString(),
                  c.now,
                ) !== "expired",
            ))
        )
          throw new HttpError(
            409,
            "An active request already exists. Reload before continuing.",
          );
        const values = {
          basis: live.basis,
          proposedAt: new Date(cmd.proposedAt),
          proposerId: actor.osuId,
          status: "waiting" as const,
          version: (before?.version ?? 0) + 1,
          updatedAt: new Date(),
          decisionNote: null,
        };
        const [after] = before
          ? await tx
              .update(scheduleRequests)
              .set(values)
              .where(eq(scheduleRequests.id, before.id))
              .returning()
          : await tx
              .insert(scheduleRequests)
              .values({
                ...values,
                fixtureId: f.id,
                fixtureSnapshotId: f.id,
                editionSlug: slug,
                label: f.label,
              })
              .returning();
        requestId = after.id;
        detail = { before: before ?? null, after };
      } else {
        if (!before || !activeSchedule(before.status))
          throw new HttpError(
            409,
            "The schedule changed. Reload before continuing.",
          );
        if (
          cmd.action === "accept" &&
          (before.status !== "waiting" ||
            before.proposerId === actor.osuId ||
            !isCaptain)
        )
          throw new HttpError(
            403,
            "The other captain must confirm this proposal.",
          );
        if (
          cmd.action === "withdraw" &&
          (!isCaptain ||
            (before.status === "waiting" && before.proposerId !== actor.osuId))
        )
          throw new HttpError(
            403,
            "You can only withdraw your own proposal or agreement.",
          );
        const review =
          cmd.action === "approve" ||
          (cmd.action === "reject" && before.status === "pending");
        if (review && (!c.admin || isCaptain || before.status !== "pending"))
          throw new HttpError(
            403,
            "An independent schedule administrator must review this request.",
          );
        if (
          cmd.action === "reject" &&
          before.status === "waiting" &&
          (!isCaptain || before.proposerId === actor.osuId)
        )
          throw new HttpError(
            403,
            "The other captain must respond to this proposal.",
          );
        if (review && cmd.action === "reject" && !cmd.decisionNote)
          throw new HttpError(
            400,
            "Explain the rejected schedule request to both captains.",
          );
        const status =
          cmd.action === "accept"
            ? "pending"
            : cmd.action === "approve"
              ? "approved"
              : cmd.action === "withdraw"
                ? "withdrawn"
                : "rejected";
        const [after] = await tx
          .update(scheduleRequests)
          .set({
            status,
            version: before.version + 1,
            decisionNote: cmd.decisionNote ?? null,
            updatedAt: new Date(),
          })
          .where(eq(scheduleRequests.id, before.id))
          .returning();
        if (cmd.action === "approve") {
          const [updated] = await tx
            .update(fixtures)
            .set({
              scheduledAt: before.proposedAt,
              version: f.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(fixtures.id, f.id))
            .returning();
          await tx.insert(resultAuditEvents).values({
            fixtureId: f.id,
            actorId: actor.osuId,
            action: "fixture_reschedule",
            detail: {
              entity: { type: "fixture", id: f.id },
              before: f,
              after: updated,
              requestId: before.id,
            },
          });
        }
        requestId = after.id;
        detail = { before, after };
      }
    }
    await tx.insert(scheduleEvents).values({
      editionSlug: slug,
      requestId,
      actorId: actor.osuId,
      requestKey: cmd.requestKey,
      requestHash: hash,
      action: cmd.action,
      detail,
    });
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "competition_schedule",
      detail: { action: cmd.action, requestId, ...detail },
    });
    return { saved: true };
  });
}
