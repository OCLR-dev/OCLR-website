import { db, readOnlyData } from "@/db";
import {
  captains,
  draftPicks,
  draftPoolEntries,
  draftSessions,
  editionState,
  memberships,
  registrations,
  teams,
} from "@/db/schema";
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import type { User } from "./auth/sessions";
import { assertReadCapability, hasCapability } from "./auth/staff";
import { captainAppointment } from "./captain-reads";
import { getEdition, getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { availableDraftPool, unassignedPlayers } from "./draft-board";
import {
  acceptedPlayers,
  availableDraftRegistration,
  readDraftData,
} from "./draft-data";
import type { CaptainBoard } from "./draft-types";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import { draftTurnSequence } from "./live-season-columns";

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

/** Only recommend people in the released pool who still pass current eligibility. */
export async function publicDraftCandidatePool(slug: string) {
  return readOnlyData(async () => {
    const draft = await databasePublicDraft(slug);
    if (
      !draft?.pool ||
      !draft.activeTeam ||
      draft.turnIndex >= draft.turnCount ||
      !["ready", "live", "paused"].includes(draft.state)
    )
      return null;

    const reader = db();
    const [session] = await reader
      .select({
        state: draftSessions.state,
        turnIndex: draftSessions.turnIndex,
      })
      .from(draftSessions)
      .where(
        and(
          eq(draftSessions.id, draft.sessionId),
          eq(draftSessions.editionSlug, slug),
        ),
      );
    if (session?.state !== draft.state || session.turnIndex !== draft.turnIndex)
      return null;

    // A private change can exclude a previously published candidate. It cannot
    // supply new names or expose the reason a candidate is no longer eligible.
    const releasedAssignments = new Set([
      draft.activeTeam.captain.osuId,
      ...draft.rosters.flatMap(({ team, players }) => [
        team.captain.osuId,
        ...players.map(({ osuId }) => osuId),
      ]),
      ...draft.picks.flatMap(({ player, team }) => [
        player.osuId,
        team.captain.osuId,
      ]),
    ]);
    const published = draft.pool.filter(
      ({ osuId }) => !releasedAssignments.has(osuId),
    );
    if (!published.length) return { state: draft.state, candidates: [] };

    const candidateId = draftPoolEntries.userId;
    const rows = await reader
      .select({ osuId: candidateId })
      .from(draftPoolEntries)
      .innerJoin(
        registrations,
        and(
          eq(registrations.userId, candidateId),
          availableDraftRegistration(slug),
        ),
      )
      .where(
        and(
          eq(draftPoolEntries.sessionId, draft.sessionId),
          inArray(
            candidateId,
            published.map(({ osuId }) => osuId),
          ),
          notExists(
            reader
              .select({ id: captains.userId })
              .from(captains)
              .where(
                and(
                  eq(captains.editionSlug, slug),
                  eq(captains.userId, candidateId),
                ),
              ),
          ),
          notExists(
            reader
              .select({ id: teams.id })
              .from(teams)
              .where(
                and(
                  eq(teams.editionSlug, slug),
                  eq(teams.captainId, candidateId),
                  isNull(teams.archivedAt),
                ),
              ),
          ),
          notExists(
            reader
              .select({ id: memberships.id })
              .from(memberships)
              .where(
                and(
                  eq(memberships.editionSlug, slug),
                  eq(memberships.userId, candidateId),
                  isNull(memberships.leftAt),
                ),
              ),
          ),
          notExists(
            reader
              .select({ id: draftPicks.id })
              .from(draftPicks)
              .where(
                and(
                  eq(draftPicks.sessionId, draft.sessionId),
                  eq(draftPicks.playerId, candidateId),
                  isNull(draftPicks.voidedAt),
                ),
              ),
          ),
        ),
      );
    const eligible = new Set(rows.map(({ osuId }) => osuId));
    return {
      state: draft.state,
      candidates: published.filter(({ osuId }) => eligible.has(osuId)),
    };
  });
}

async function databaseCaptainDraft(
  actor: User,
  slug: string,
): Promise<CaptainBoard | null> {
  if (!(await captainAppointment(actor.osuId, slug)))
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
    if (!(await captainAppointment(actor.osuId, slug)))
      throw new HttpError(403, "Captain access for this edition is required.");
    return frontendResource<Awaited<ReturnType<typeof databaseCaptainDraft>>>(
      "captainDraft",
      { slug },
    );
  }
  return readOnlyData(() => databaseCaptainDraft(actor, slug));
}
