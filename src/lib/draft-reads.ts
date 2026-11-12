import { db, readOnlyData } from "@/db";
import { captains, draftSessions, editionState, teams } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { User } from "./auth/sessions";
import { assertReadCapability, hasCapability } from "./auth/staff";
import { captainAppointment } from "./captain-reads";
import { getEdition, getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { availableDraftPool, unassignedPlayers } from "./draft-board";
import { acceptedPlayers, readDraftData } from "./draft-data";
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
