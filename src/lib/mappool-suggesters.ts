import { db } from "@/db";
import {
  mappoolCandidates,
  mappoolEntries,
  mappoolEntrySuggesters,
  mappoolEvents,
  mappools,
  staffRoles,
  users,
} from "@/db/schema";
import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { User } from "./auth/sessions";
import { hasCapability } from "./auth/staff";
import { remoteMode } from "./data-source";
import { HttpError } from "./http-error";
import type { changeMappoolWrite } from "./mappool-write-contracts";
import type { z } from "zod";

type Reader = Pick<ReturnType<typeof db>, "select" | "selectDistinct">;
type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
type Command = Extract<
  z.infer<typeof changeMappoolWrite.request>,
  { action: "entry_suggester_set" }
>;

function mappoolers(reader: Reader, slug: string, osuId?: number) {
  return reader
    .selectDistinct({ osuId: users.osuId, username: users.username })
    .from(users)
    .innerJoin(staffRoles, eq(staffRoles.userId, users.osuId))
    .where(
      and(
        eq(staffRoles.role, "mappooler"),
        isNull(staffRoles.revokedAt),
        or(isNull(staffRoles.editionSlug), eq(staffRoles.editionSlug, slug)),
        osuId === undefined ? undefined : eq(users.osuId, osuId),
      ),
    )
    .orderBy(users.username, users.osuId);
}

function workbenchCandidates(
  reader: Reader,
  slug: string,
  filter: SQL | undefined,
) {
  return reader
    .select({
      candidateId: mappoolCandidates.id,
      beatmapId: mappoolCandidates.beatmapId,
      category: mappoolCandidates.category,
      osuId: mappoolCandidates.authorId,
      username: mappoolCandidates.authorName,
    })
    .from(mappoolCandidates)
    .where(and(eq(mappoolCandidates.editionSlug, slug), filter));
}

const suggesterFields = {
  osuId: mappoolEntrySuggesters.osuId,
  username: mappoolEntrySuggesters.username,
  candidateId: mappoolEntrySuggesters.candidateId,
};

/** Candidate attribution and the staff picker belong to the native editor. */
export async function mappoolSuggesterEditorData(
  actor: User,
  slug: string,
  entries: readonly { id: string; beatmapId: number }[],
) {
  if (remoteMode()) return null;
  return db().transaction(
    async (tx) => {
      if (!(await hasCapability(actor, "manage_mappools", slug, tx)))
        return null;
      const entryIds = entries.map(({ id }) => id);
      const beatmapIds = [
        ...new Set(entries.map(({ beatmapId }) => beatmapId)),
      ];
      return {
        mappoolers: entryIds.length ? await mappoolers(tx, slug) : [],
        candidates: beatmapIds.length
          ? await workbenchCandidates(
              tx,
              slug,
              inArray(mappoolCandidates.beatmapId, beatmapIds),
            ).orderBy(mappoolCandidates.beatmapId, mappoolCandidates.category)
          : [],
        saved: entryIds.length
          ? await tx
              .select({
                entryId: mappoolEntrySuggesters.entryId,
                ...suggesterFields,
              })
              .from(mappoolEntrySuggesters)
              .innerJoin(
                mappoolEntries,
                eq(mappoolEntries.id, mappoolEntrySuggesters.entryId),
              )
              .innerJoin(mappools, eq(mappools.id, mappoolEntries.poolId))
              .where(
                and(
                  eq(mappools.editionSlug, slug),
                  inArray(mappoolEntrySuggesters.entryId, entryIds),
                ),
              )
          : [],
      };
    },
    { isolationLevel: "repeatable read" },
  );
}

export type MappoolSuggesterEditorData = NonNullable<
  Awaited<ReturnType<typeof mappoolSuggesterEditorData>>
>;

/** Called inside the existing edition, pool, version and publication guards. */
export async function setMappoolEntrySuggester(
  tx: Transaction,
  actor: User,
  slug: string,
  command: Command,
) {
  const { entryId, poolId, suggester } = command;
  const [entry] = await tx
    .select({ beatmapId: mappoolEntries.beatmapId })
    .from(mappoolEntries)
    .where(
      and(eq(mappoolEntries.id, entryId), eq(mappoolEntries.poolId, poolId)),
    );
  if (!entry) throw new HttpError(404, "Map slot not found in this pool.");

  let next: Omit<typeof mappoolEntrySuggesters.$inferInsert, "entryId"> | null =
    null;
  if (suggester?.source === "mappooler") {
    const [staff] = await mappoolers(tx, slug, suggester.osuId);
    if (!staff)
      throw new HttpError(409, "Choose a current Mappooler for this edition.");
    next = { ...staff, candidateId: null };
  } else if (suggester?.source === "workbench") {
    const [candidate] = await workbenchCandidates(
      tx,
      slug,
      and(
        eq(mappoolCandidates.beatmapId, entry.beatmapId),
        eq(mappoolCandidates.id, suggester.candidateId),
      ),
    );
    if (!candidate)
      throw new HttpError(
        409,
        "This workbench suggestion is no longer available for this beatmap.",
      );
    next = {
      candidateId: candidate.candidateId,
      osuId: candidate.osuId,
      username: candidate.username,
    };
  }

  const [previous] = await tx
    .select(suggesterFields)
    .from(mappoolEntrySuggesters)
    .where(eq(mappoolEntrySuggesters.entryId, entryId));
  if (
    previous?.osuId === next?.osuId &&
    previous?.username === next?.username &&
    previous?.candidateId === next?.candidateId
  )
    return;
  if (next)
    await tx
      .insert(mappoolEntrySuggesters)
      .values({ entryId, ...next })
      .onConflictDoUpdate({
        target: mappoolEntrySuggesters.entryId,
        set: next,
      });
  else
    await tx
      .delete(mappoolEntrySuggesters)
      .where(eq(mappoolEntrySuggesters.entryId, entryId));
  await tx
    .update(mappools)
    .set({ version: command.expectedVersion + 1, updatedAt: new Date() })
    .where(eq(mappools.id, poolId));
  await tx.insert(mappoolEvents).values({
    editionSlug: slug,
    poolId,
    actorId: actor.osuId,
    action: command.action,
    before: {
      entryId,
      beatmapId: entry.beatmapId,
      suggester: previous ?? null,
    },
    after: { entryId, beatmapId: entry.beatmapId, suggester: next },
  });
}
