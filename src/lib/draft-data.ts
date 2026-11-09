import type { db } from "@/db";
import {
  captains,
  draftPicks,
  draftSessions,
  editionState,
  memberships,
  registrations,
  teams,
  users,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { draftSessionReadColumns } from "./live-season-columns";

type Reader = Pick<ReturnType<typeof db>, "select">;

export async function acceptedPlayers(tx: Reader, slug: string) {
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

export async function readDraftData(tx: Reader, slug: string) {
  const [session] = await tx
    .select(draftSessionReadColumns)
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
export type DraftData = Awaited<ReturnType<typeof readDraftData>>;
