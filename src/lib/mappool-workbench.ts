import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  editionState,
  mappoolCandidateComments,
  mappoolCandidateRounds,
  mappoolCandidates,
  mappoolEvents,
  tournamentRounds,
} from "@/db/schema";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { getEdition } from "./content";
import { HttpError } from "./http-error";
import type { BeatmapSnapshot } from "./mappool-model";
import { canonicalSkillsets } from "./mappool-skillsets";
import { candidateLimit, commentLimit } from "./mappool-workbench-model";
import {
  selectionCommandInput,
  type SelectionReceipt,
} from "./mappool-write-contracts";
import { fetchBeatmaps } from "./osu-beatmaps";

export async function selectionCommand(
  actor: User,
  slug: string,
  input: unknown,
): Promise<SelectionReceipt> {
  await assertCapability(actor, "select_mappools", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  const parsed = selectionCommandInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Enter a valid selection workbench change.");
  const c = parsed.data;
  const snapshots = new Map<number, BeatmapSnapshot>();
  if (c.action === "add") {
    const existing = await db()
      .select({
        id: mappoolCandidates.beatmapId,
        category: mappoolCandidates.category,
      })
      .from(mappoolCandidates)
      .where(eq(mappoolCandidates.editionSlug, slug));
    const known = new Set(
      existing.filter((r) => r.category === c.category).map((r) => r.id),
    );
    const ids = c.rows
      .filter((r) => !known.has(r.beatmapId))
      .map((r) => r.beatmapId);
    if (ids.length) {
      const results = await fetchBeatmaps(ids);
      for (const row of c.rows.filter((r) => !known.has(r.beatmapId))) {
        const snapshot = results.get(row.beatmapId);
        if (!snapshot || snapshot instanceof HttpError)
          throw snapshot ?? new HttpError(502, "Beatmap lookup failed.");
        if (snapshot.fingerprint !== row.fingerprint)
          throw new HttpError(
            409,
            "Official metadata changed. Preview the batch again.",
          );
        snapshots.set(row.beatmapId, snapshot);
      }
    }
  }
  return db().transaction(async (tx) => {
    // Shared edition lock serializes candidate deduplication and comment retries.
    await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, "select_mappools", slug, tx);
    await assertOperationalEdition(slug, tx);
    if (
      (c.action === "add" || c.action === "assign_rounds") &&
      c.roundIds.length
    ) {
      const rounds = await tx
        .select({ id: tournamentRounds.id })
        .from(tournamentRounds)
        .where(
          and(
            eq(tournamentRounds.editionSlug, slug),
            inArray(tournamentRounds.id, c.roundIds),
          ),
        );
      if (rounds.length !== c.roundIds.length)
        throw new HttpError(400, "Choose rounds from this edition.");
    }
    if (c.action === "add") {
      const existing = await tx
        .select({
          id: mappoolCandidates.beatmapId,
          category: mappoolCandidates.category,
        })
        .from(mappoolCandidates)
        .where(eq(mappoolCandidates.editionSlug, slug));
      const known = new Set(
        existing.filter((r) => r.category === c.category).map((r) => r.id),
      );
      const pending = c.rows.filter((r) => !known.has(r.beatmapId));
      if (existing.length + pending.length > candidateLimit)
        throw new HttpError(
          409,
          "This workbench has reached its candidate limit.",
        );
      const added: number[] = [];
      for (const row of pending) {
        const snapshot = snapshots.get(row.beatmapId);
        // A previously known candidate may have moved while provider work ran.
        if (!snapshot)
          throw new HttpError(
            409,
            "Candidate category changed. Refresh the list.",
          );
        const [candidate] = await tx
          .insert(mappoolCandidates)
          .values({
            editionSlug: slug,
            beatmapId: row.beatmapId,
            category: c.category,
            metadata: snapshot.metadata,
            metadataFetchedAt: new Date(snapshot.fetchedAt),
            authorId: actor.osuId,
            authorName: actor.username,
          })
          .returning({ id: mappoolCandidates.id });
        if (c.roundIds.length)
          await tx.insert(mappoolCandidateRounds).values(
            c.roundIds.map((roundId) => ({
              candidateId: candidate.id,
              roundId,
              editionSlug: slug,
            })),
          );
        await tx.insert(mappoolEvents).values({
          editionSlug: slug,
          actorId: actor.osuId,
          action: "candidate_add",
          after: {
            candidateId: candidate.id,
            beatmapId: row.beatmapId,
            category: c.category,
            roundIds: [...c.roundIds].sort(),
          },
        });
        added.push(row.beatmapId);
      }
      return { added: added.length, skipped: c.rows.length - added.length };
    }
    const [candidate] = await tx
      .select()
      .from(mappoolCandidates)
      .where(
        and(
          eq(mappoolCandidates.id, c.candidateId),
          eq(mappoolCandidates.editionSlug, slug),
        ),
      );
    if (!candidate) throw new HttpError(404, "Candidate not found.");
    if (c.action === "skillsets") {
      if (candidate.skillsetVersion !== c.expectedVersion)
        throw new HttpError(
          409,
          "Skillset tags changed. Reopen the editor before trying again.",
        );
      const tags = canonicalSkillsets(c.tags);
      if (JSON.stringify(tags) === JSON.stringify(candidate.skillsetTags))
        return { added: 0, skipped: 1 };
      await tx
        .update(mappoolCandidates)
        .set({
          skillsetTags: tags,
          skillsetVersion: candidate.skillsetVersion + 1,
        })
        .where(eq(mappoolCandidates.id, candidate.id));
      await tx.insert(mappoolEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        action: "candidate_skillsets",
        before: {
          candidateId: candidate.id,
          tags: candidate.skillsetTags,
          version: candidate.skillsetVersion,
        },
        after: {
          candidateId: candidate.id,
          tags,
          version: candidate.skillsetVersion + 1,
        },
      });
      return { added: 0, skipped: 0 };
    }
    if (c.action === "assign_rounds") {
      const links = await tx
        .select({ roundId: mappoolCandidateRounds.roundId })
        .from(mappoolCandidateRounds)
        .where(eq(mappoolCandidateRounds.candidateId, candidate.id));
      const current = links.map((l) => l.roundId).sort(),
        next = [...c.roundIds].sort();
      if (
        JSON.stringify(current) !==
        JSON.stringify([...c.expectedRoundIds].sort())
      )
        throw new HttpError(
          409,
          "Candidate rounds changed. Refresh the list before trying again.",
        );
      if (JSON.stringify(current) === JSON.stringify(next))
        return { added: 0, skipped: 1 };
      await tx
        .delete(mappoolCandidateRounds)
        .where(eq(mappoolCandidateRounds.candidateId, candidate.id));
      if (next.length)
        await tx.insert(mappoolCandidateRounds).values(
          next.map((roundId) => ({
            candidateId: candidate.id,
            roundId,
            editionSlug: slug,
          })),
        );
      await tx.insert(mappoolEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        action: "candidate_assign_rounds",
        before: { candidateId: candidate.id, roundIds: current },
        after: { candidateId: candidate.id, roundIds: next },
      });
      return { added: 0, skipped: 0 };
    }
    if (c.action === "classify") {
      if (candidate.category === c.category) return { added: 0, skipped: 1 };
      if (candidate.category !== c.expectedCategory)
        throw new HttpError(
          409,
          "Candidate category changed. Refresh the list.",
        );
      const [duplicate] = await tx
        .select({ id: mappoolCandidates.id })
        .from(mappoolCandidates)
        .where(
          and(
            eq(mappoolCandidates.editionSlug, slug),
            eq(mappoolCandidates.category, c.category),
            eq(mappoolCandidates.beatmapId, candidate.beatmapId),
          ),
        );
      if (duplicate)
        throw new HttpError(
          409,
          "This map already exists in that Mod category.",
        );
      await tx
        .update(mappoolCandidates)
        .set({ category: c.category })
        .where(eq(mappoolCandidates.id, candidate.id));
      await tx.insert(mappoolEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        action: "candidate_classify",
        before: { candidateId: candidate.id, category: candidate.category },
        after: { candidateId: candidate.id, category: c.category },
      });
      return { added: 0, skipped: 0 };
    }
    const bodyHash = (body: string) =>
      createHash("sha256").update(body).digest("hex");
    async function originalBodyHash(requestId: string, fallbackBody: string) {
      const [event] = await tx
        .select({ after: mappoolEvents.after })
        .from(mappoolEvents)
        .where(
          and(
            eq(mappoolEvents.editionSlug, slug),
            eq(mappoolEvents.actorId, actor.osuId),
            inArray(mappoolEvents.action, [
              "candidate_comment",
              "candidate_comment_edit",
              "candidate_comment_delete",
            ]),
            sql`${mappoolEvents.after}->>'candidateId' = ${candidate.id}`,
            sql`${mappoolEvents.after}->>'requestId' = ${requestId}`,
            sql`${mappoolEvents.after}->>'requestBodyHash' IS NOT NULL`,
          ),
        )
        .limit(1);
      // Pre-feature comments have no hash until their first edit/delete.
      return typeof event?.after.requestBodyHash === "string"
        ? event.after.requestBodyHash
        : bodyHash(fallbackBody);
    }
    if (c.action === "comment_edit" || c.action === "comment_delete") {
      const [current] = await tx
        .select({
          id: mappoolCandidateComments.id,
          requestId: mappoolCandidateComments.requestId,
          body: mappoolCandidateComments.body,
          version: sql<string>`xmin::text`,
        })
        .from(mappoolCandidateComments)
        .where(
          and(
            eq(mappoolCandidateComments.id, c.commentId),
            eq(mappoolCandidateComments.candidateId, candidate.id),
            eq(mappoolCandidateComments.editionSlug, slug),
            eq(mappoolCandidateComments.authorId, actor.osuId),
          ),
        )
        .for("update");
      if (!current) throw new HttpError(404, "Comment not found.");
      if (current.version !== c.version)
        throw new HttpError(
          409,
          "This comment has changed. Cancel and refresh before trying again.",
        );
      const requestBodyHash = await originalBodyHash(
        current.requestId,
        current.body,
      );
      if (c.action === "comment_edit") {
        await tx
          .update(mappoolCandidateComments)
          .set({ body: c.body })
          .where(eq(mappoolCandidateComments.id, current.id));
      } else {
        await tx
          .delete(mappoolCandidateComments)
          .where(eq(mappoolCandidateComments.id, current.id));
      }
      await tx.insert(mappoolEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        action:
          c.action === "comment_edit"
            ? "candidate_comment_edit"
            : "candidate_comment_delete",
        before: {
          candidateId: candidate.id,
          commentId: current.id,
          version: current.version,
        },
        // Retain the creation request identity so a lost-response retry cannot
        // resurrect a deleted comment. Audit metadata contains no comment text.
        after: {
          candidateId: candidate.id,
          commentId: current.id,
          requestId: current.requestId,
          requestBodyHash,
        },
      });
      return { added: 0, skipped: 0 };
    }
    const [prior] = await tx
      .select()
      .from(mappoolCandidateComments)
      .where(
        and(
          eq(mappoolCandidateComments.candidateId, c.candidateId),
          eq(mappoolCandidateComments.authorId, actor.osuId),
          eq(mappoolCandidateComments.requestId, c.requestId),
        ),
      );
    if (prior) {
      if (
        prior.candidateId !== c.candidateId ||
        (await originalBodyHash(c.requestId, prior.body)) !== bodyHash(c.body)
      )
        throw new HttpError(
          409,
          "This comment request was already used. Reload the comments.",
        );
      return { added: 0, skipped: 1 };
    }
    const [deleted] = await tx
      .select({ id: mappoolEvents.id })
      .from(mappoolEvents)
      .where(
        and(
          eq(mappoolEvents.editionSlug, slug),
          eq(mappoolEvents.actorId, actor.osuId),
          eq(mappoolEvents.action, "candidate_comment_delete"),
          sql`${mappoolEvents.after}->>'candidateId' = ${candidate.id}`,
          sql`${mappoolEvents.after}->>'requestId' = ${c.requestId}`,
        ),
      )
      .limit(1);
    if (deleted)
      throw new HttpError(
        409,
        "This comment request was already used. Reload the comments.",
      );
    const [count] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(mappoolCandidateComments)
      .where(eq(mappoolCandidateComments.candidateId, candidate.id));
    if (count.value >= commentLimit)
      throw new HttpError(409, "This candidate has reached its comment limit.");
    const [comment] = await tx
      .insert(mappoolCandidateComments)
      .values({
        candidateId: candidate.id,
        editionSlug: slug,
        requestId: c.requestId,
        body: c.body,
        authorId: actor.osuId,
        authorName: actor.username,
      })
      .returning({ id: mappoolCandidateComments.id });
    await tx.insert(mappoolEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      action: "candidate_comment",
      after: {
        candidateId: candidate.id,
        commentId: comment.id,
        requestId: c.requestId,
        requestBodyHash: bodyHash(c.body),
      },
    });
    return { added: 1, skipped: 0 };
  });
}
