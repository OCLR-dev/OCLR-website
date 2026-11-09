import { db } from "@/db";
import {
  fixtures,
  matchImports,
  resultAuditEvents,
  resultRevisions,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth/sessions";
import { remoteMode } from "./data-source";
import type { MatchReview as MatchReviewData } from "./fixture-read-contracts";
import { fixtureForReview, type FixtureReviewContext } from "./fixture-reads";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { matchSourceSchema, reviewedResultSchema } from "./match-model";
import { previewMatch } from "./match-scoring";
import { compareMatchSources } from "./match-source";

const sourceDiffSchema = z
  .object({
    added: z.array(z.number().int().positive()).max(3000),
    removed: z.array(z.number().int().positive()).max(3000),
    changed: z.array(z.number().int().positive()).max(3000),
    historyChanged: z.boolean(),
  })
  .strict();

async function databaseMatchReview(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<MatchReview> {
  return db().transaction(
    async (tx) => {
      const context = await fixtureForReview(actor, slug, fixtureId, tx, true);
      const [latest] = context.result?.latestImportId
        ? await tx
            .select()
            .from(matchImports)
            .where(
              and(
                eq(matchImports.id, context.result.latestImportId),
                eq(matchImports.fixtureId, fixtureId),
              ),
            )
        : [];
      const parsedSource = latest
        ? matchSourceSchema.safeParse(latest.source)
        : null;
      const source = parsedSource?.success ? parsedSource.data : null;
      const history = await tx
        .select()
        .from(resultRevisions)
        .where(eq(resultRevisions.fixtureId, fixtureId))
        .orderBy(desc(resultRevisions.revision))
        .limit(50);
      const revisions = history.map((r) => {
        const p = reviewedResultSchema.safeParse(r.proposal);
        return { ...r, proposal: p.success ? p.data : null };
      });
      const current =
        revisions.find((r) => r.revision === context.result?.currentRevision) ??
        null;
      let published =
        revisions.find(
          (r) => r.revision === context.result?.publishedRevision,
        ) ?? null;
      if (!published && context.result?.publishedRevision) {
        const [record] = await tx
          .select()
          .from(resultRevisions)
          .where(
            and(
              eq(resultRevisions.fixtureId, fixtureId),
              eq(resultRevisions.revision, context.result.publishedRevision),
            ),
          );
        if (record) {
          const parsed = reviewedResultSchema.safeParse(record.proposal);
          published = {
            ...record,
            proposal: parsed.success ? parsed.data : null,
          };
        }
      }
      const [baseline] =
        current && current.importId !== latest?.id
          ? await tx
              .select()
              .from(matchImports)
              .where(
                and(
                  eq(matchImports.id, current.importId),
                  eq(matchImports.fixtureId, fixtureId),
                ),
              )
          : [];
      const previous = baseline
        ? matchSourceSchema.safeParse(baseline.source)
        : null;
      const [lastImportEvent] = latest
        ? await tx
            .select({ detail: resultAuditEvents.detail })
            .from(resultAuditEvents)
            .where(
              and(
                eq(resultAuditEvents.fixtureId, fixtureId),
                eq(resultAuditEvents.action, "source_imported"),
                sql`${resultAuditEvents.detail}->>'importId' = ${latest.id}`,
              ),
            )
            .orderBy(desc(resultAuditEvents.createdAt))
            .limit(1)
        : [];
      const recordedDiff = sourceDiffSchema.safeParse(
        lastImportEvent?.detail.diff,
      );
      const diff =
        source && previous?.success
          ? compareMatchSources(previous.data, source)
          : !current && recordedDiff.success
            ? recordedDiff.data
            : null;
      const imports = await tx
        .select({
          id: matchImports.id,
          externalMatchId: matchImports.externalMatchId,
          fingerprint: matchImports.fingerprint,
          createdBy: matchImports.createdBy,
          createdAt: matchImports.createdAt,
        })
        .from(matchImports)
        .where(eq(matchImports.fixtureId, fixtureId))
        .orderBy(desc(matchImports.createdAt))
        .limit(50);
      const all = context.canViewAll
        ? await tx
            .select({
              id: fixtures.id,
              label: fixtures.label,
              homeSourceId: fixtures.homeSourceId,
              awaySourceId: fixtures.awaySourceId,
              publishedAt: fixtures.publishedAt,
            })
            .from(fixtures)
            .where(eq(fixtures.editionSlug, slug))
        : [];
      const affected = new Set([fixtureId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of all)
          if (
            !affected.has(f.id) &&
            ((f.homeSourceId && affected.has(f.homeSourceId)) ||
              (f.awaySourceId && affected.has(f.awaySourceId)))
          ) {
            affected.add(f.id);
            changed = true;
          }
      }
      return {
        context,
        source,
        importId: latest?.id ?? null,
        sourceError:
          latest && !source ? "The stored source needs a fresh import." : null,
        preview: source ? previewMatch(source, context) : null,
        imports,
        revisions,
        current,
        published,
        diff,
        dependents: all
          .filter((f) => f.id !== fixtureId && affected.has(f.id))
          .map((f) => ({
            id: f.id,
            label: f.label,
            published: Boolean(f.publishedAt),
          })),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function matchReview(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<MatchReview> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<MatchReview>("matchReview", { slug, fixtureId });
  }
  return databaseMatchReview(actor, slug, fixtureId);
}

export type MatchReview = MatchReviewData<FixtureReviewContext>;
