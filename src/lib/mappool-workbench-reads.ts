import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  mappoolCandidateComments,
  mappoolCandidateRounds,
  mappoolCandidates,
  tournamentRounds,
  tournamentStages,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import { getEdition } from "./content";
import { remoteMode } from "./data-source";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import { candidateLimit, commentLimit } from "./mappool-workbench-model";

async function databaseSelectionWorkspace(
  actor: User,
  slug: string,
): Promise<SelectionWorkspace> {
  await assertReadCapability(actor, "select_mappools", slug);
  const edition = await getEdition(slug);
  if (!edition) throw new HttpError(404, "Edition not found.");
  return db().transaction(
    async (tx) => {
      const candidates = await tx
        .select({
          id: mappoolCandidates.id,
          beatmapId: mappoolCandidates.beatmapId,
          category: mappoolCandidates.category,
          skillsetTags: mappoolCandidates.skillsetTags,
          skillsetVersion: mappoolCandidates.skillsetVersion,
          metadata: mappoolCandidates.metadata,
          metadataFetchedAt: mappoolCandidates.metadataFetchedAt,
          authorId: mappoolCandidates.authorId,
          authorName: mappoolCandidates.authorName,
          createdAt: mappoolCandidates.createdAt,
          commentCount: sql<number>`count(${mappoolCandidateComments.id})::int`,
        })
        .from(mappoolCandidates)
        .leftJoin(
          mappoolCandidateComments,
          eq(mappoolCandidateComments.candidateId, mappoolCandidates.id),
        )
        .where(eq(mappoolCandidates.editionSlug, slug))
        .groupBy(mappoolCandidates.id)
        .orderBy(mappoolCandidates.createdAt, mappoolCandidates.id)
        .limit(candidateLimit);
      const rounds = await tx
        .select({
          id: tournamentRounds.id,
          name: tournamentRounds.name,
          stage: tournamentStages.kind,
          position: tournamentRounds.position,
        })
        .from(tournamentRounds)
        .innerJoin(
          tournamentStages,
          eq(tournamentStages.id, tournamentRounds.stageId),
        )
        .where(eq(tournamentRounds.editionSlug, slug))
        .orderBy(
          tournamentStages.kind,
          tournamentRounds.position,
          tournamentRounds.id,
        );
      const links = await tx
        .select({
          candidateId: mappoolCandidateRounds.candidateId,
          roundId: mappoolCandidateRounds.roundId,
        })
        .from(mappoolCandidateRounds)
        .where(eq(mappoolCandidateRounds.editionSlug, slug));
      const byCandidate = new Map<string, string[]>();
      for (const link of links) {
        const ids = byCandidate.get(link.candidateId) ?? [];
        ids.push(link.roundId);
        byCandidate.set(link.candidateId, ids);
      }
      return {
        candidates: candidates.map((c) => ({
          ...c,
          roundIds: (byCandidate.get(c.id) ?? []).sort(),
        })),
        rounds,
        asOf: new Date(),
        archived: Boolean(edition.archive),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function selectionWorkspace(
  actor: User,
  slug: string,
): Promise<SelectionWorkspace> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource("selectionWorkspace", { slug });
  }
  return databaseSelectionWorkspace(actor, slug);
}
export type SelectionWorkspace =
  ExplicitReadData<"selectionWorkspace">;
export type CandidateComments = ExplicitReadData<"candidateComments">;
async function databaseCandidateComments(
  actor: User,
  slug: string,
  id: string,
): Promise<CandidateComments> {
  await assertReadCapability(actor, "select_mappools", slug);
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(400, "Invalid candidate.");
  const [candidate] = await db()
    .select({ id: mappoolCandidates.id })
    .from(mappoolCandidates)
    .where(
      and(
        eq(mappoolCandidates.id, id),
        eq(mappoolCandidates.editionSlug, slug),
      ),
    );
  if (!candidate) throw new HttpError(404, "Candidate not found.");
  return db()
    .select({
      id: mappoolCandidateComments.id,
      authorId: mappoolCandidateComments.authorId,
      authorName: mappoolCandidateComments.authorName,
      body: mappoolCandidateComments.body,
      version: sql<string>`xmin::text`,
      createdAt: mappoolCandidateComments.createdAt,
    })
    .from(mappoolCandidateComments)
    .where(eq(mappoolCandidateComments.candidateId, id))
    .orderBy(mappoolCandidateComments.createdAt, mappoolCandidateComments.id)
    .limit(commentLimit);
}
export async function candidateComments(
  actor: User,
  slug: string,
  id: string,
): Promise<CandidateComments> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource("candidateComments", { slug, id });
  }
  return databaseCandidateComments(actor, slug, id);
}
