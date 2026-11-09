import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
  captains,
  fixtures,
  matchResults,
  memberships,
  refereeEvents,
  resultRevisions,
  teams,
  tournamentRounds,
  users,
} from "@/db/schema";
import { editionOperationState } from "./archive-guard";
import type { User } from "./auth/sessions";
import { permits, staffAccess } from "./auth/staff";
import { remoteMode } from "./data-source";
import { HttpError } from "./http-error";
import { publicCompetition } from "./public-competition";
import { inReadChannel } from "./read-channel";
import type { ScheduleBasis } from "./schedule-model";

type Reader = Pick<ReturnType<typeof db>, "select">;
export function assertScheduleBrowserChannel() {
  if (remoteMode() || inReadChannel())
    throw new HttpError(
      403,
      "Schedule requests require a direct browser session.",
    );
}
/** Read eligibility in the caller's snapshot, after locking for commands. */
export async function readScheduleContext(
  reader: Reader,
  actor: User,
  slug: string,
) {
  const state = await editionOperationState(slug, reader);
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
      !state.hasArchive &&
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
