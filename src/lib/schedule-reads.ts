import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  fixtureCommentators,
  fixtureReferees,
  fixtures,
  fixtureStreams,
  scheduleAvailability,
  scheduleEvents,
  scheduleRequests,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { openExhibitionSides } from "./exhibition-sides";
import { fixtureAvailabilityReadColumns } from "./live-season-columns";
import {
  assertScheduleBrowserChannel,
  readScheduleContext,
} from "./schedule-data";
import { availabilitySummary, scheduleStatus } from "./schedule-model";

export async function scheduleWorkspace(actor: User, slug: string) {
  assertScheduleBrowserChannel();
  return db().transaction(
    async (tx) => {
      const c = await readScheduleContext(tx, actor, slug);
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
              .select(fixtureAvailabilityReadColumns)
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
      const staffBookings = [
        ...refereeRows.map((row) => ({
          fixtureId: row.fixture_referees.fixtureId,
          userId: row.fixture_referees.userId,
        })),
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
            home:
              openExhibitionSides(f)?.redName ??
              c.teamRows.find((t) => t.id === f.homeTeamId)?.name ??
              "TBA",
            away:
              openExhibitionSides(f)?.blueName ??
              c.teamRows.find((t) => t.id === f.awayTeamId)?.name ??
              "TBA",
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
                  f.status !== "cancelled" &&
                  v.fixture.status !== "cancelled" &&
                  f.scheduledAt &&
                  v.fixture.scheduledAt?.getTime() ===
                    f.scheduledAt.getTime() &&
                  ([f.homeTeamId, f.awayTeamId].some(
                    (id) =>
                      id &&
                      [v.fixture.homeTeamId, v.fixture.awayTeamId].includes(id),
                  ) ||
                    staffBookings.some(
                      (booking) =>
                        booking.fixtureId === f.id &&
                        staffBookings.some(
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
