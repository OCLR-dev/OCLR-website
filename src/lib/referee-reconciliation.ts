import { remoteMode } from "./data-source";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, readOnlyData } from "@/db";
import {
  editionState,
  fixtures,
  matchImports,
  refereeReconciliations,
  resultAuditEvents,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertBusinessWrite } from "./auth/staff";
import { fixtureForReview } from "./fixture-reads";
import {
  reconcileRefereeAttemptWrite,
  type RefereeReconciliationResult,
} from "./referee-write-contracts";
import { HttpError } from "./http-error";
import { matchSourceSchema } from "./match-model";
import { previewMatch } from "./match-scoring";
import { matchReview } from "./result-review";
import {
  assertRefereeAccess,
  readRefereeWorkspace,
  refereeWorkspace,
} from "./referee-workspace";
import {
  compareRefereeAttempts,
  type ReconciliationSource,
} from "./referee-reconciliation-model";

type Reader = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
async function sourcesFor(
  tx: Reader,
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<ReconciliationSource[]> {
  const context = await fixtureForReview(actor, slug, fixtureId, tx, true);
  const imports = await tx
    .select()
    .from(matchImports)
    .where(eq(matchImports.fixtureId, fixtureId))
    .orderBy(desc(matchImports.createdAt), desc(matchImports.id))
    .limit(100);
  const seen = new Set<number>();
  return imports.flatMap((record) => {
    const current = !seen.has(record.externalMatchId);
    seen.add(record.externalMatchId);
    const parsed = matchSourceSchema.safeParse(record.source);
    if (!parsed.success) return [];
    const preview = previewMatch(parsed.data, context);
    return [
      {
        importId: record.id,
        fingerprint: record.fingerprint,
        matchId: record.externalMatchId,
        complete: parsed.data.complete,
        current,
        games: preview.games.map((g) => ({
          id: g.game.id,
          beatmapId: g.game.beatmapId,
          winnerTeamId: g.winnerTeamId,
          tied: g.tied,
          ended: g.game.endTime !== null,
          problems: g.problems,
        })),
      },
    ];
  });
}
async function savedLinks(tx: Reader, fixtureId: string) {
  const history = await tx
    .select()
    .from(refereeReconciliations)
    .where(eq(refereeReconciliations.fixtureId, fixtureId))
    .orderBy(asc(refereeReconciliations.revision));
  const latest = new Map<string, (typeof history)[number]>();
  for (const link of history) latest.set(link.attemptId, link);
  return {
    revision: history.at(-1)?.revision ?? 0,
    links: [...latest.values()],
    history,
  };
}
export type RefereeReconciliation =
  import("./explicit-read-contracts").ExplicitReadData<"refereeReconciliation">;
export async function refereeReconciliation(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<RefereeReconciliation> {
  if (remoteMode()) {
    const { frontendResource, assertRemoteSubject } =
      await import("./frontend-resource");
    await assertRemoteSubject(actor.osuId);
    return frontendResource<RefereeReconciliation>("refereeReconciliation", {
      slug,
      fixtureId,
    });
  }
  return databaseRefereeReconciliation(actor, slug, fixtureId);
}
async function databaseRefereeReconciliation(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<RefereeReconciliation> {
  return readOnlyData(async () => {
    const workspace = await refereeWorkspace(actor, slug, fixtureId);
    const saved = await db().transaction((tx) => savedLinks(tx, fixtureId));
    let sources: ReconciliationSource[] = [];
    let review: Awaited<ReturnType<typeof matchReview>> | null = null;
    try {
      sources = await db().transaction((tx) =>
        sourcesFor(tx, actor, slug, fixtureId),
      );
      review = await matchReview(actor, slug, fixtureId);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409) throw error;
    }
    return {
      fixtureId,
      canRecord:
        workspace.canRecord &&
        workspace.session?.dependencyFingerprint ===
          workspace.dependencyFingerprint,
      teams: workspace.teams,
      sessionRevision: workspace.session?.revision ?? 0,
      dependencyFingerprint: workspace.dependencyFingerprint,
      revision: saved.revision,
      rows: compareRefereeAttempts(
        workspace.projection,
        saved.links,
        sources,
        workspace.session?.revision ?? 0,
        workspace.dependencyFingerprint,
      ),
      sources,
      ledgerScore: workspace.projection.score,
      official: review?.current
        ? {
            revision: review.current.revision,
            state: review.context.result?.state,
            series: review.current.proposal?.series ?? null,
            publishedRevision: review.context.result?.publishedRevision ?? null,
          }
        : null,
      history: saved.history.map(
        ({
          id,
          revision,
          actorId,
          attemptId,
          importId,
          gameId,
          sessionRevision,
          createdAt,
        }) => ({
          id,
          revision,
          actorId,
          attemptId,
          importId,
          gameId,
          sessionRevision,
          createdAt,
        }),
      ),
    };
  });
}
export type RefereeReconciliationWorkspace = Awaited<
  ReturnType<typeof refereeReconciliation>
>;
export async function reconcileRefereeAttempt(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
): Promise<RefereeReconciliationResult> {
  await assertBusinessWrite(actor, slug);
  const parsed = reconcileRefereeAttemptWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Choose a saved MP game and the current reconciliation revision.",
    );
  const command = parsed.data;
  const changes = "links" in command ? command.links : [command];
  if (!z.uuid().safeParse(fixtureId).success)
    throw new HttpError(404, "Fixture not found.");
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  const receipt = await db().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await tx
      .select({ id: fixtures.id })
      .from(fixtures)
      .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)))
      .for("update");
    await assertRefereeAccess(tx, actor, slug, fixtureId, true);
    const saved = await savedLinks(tx, fixtureId);
    const previous = saved.history.find(
      (h) => h.actorId === actor.osuId && h.requestKey === command.requestKey,
    );
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        throw new HttpError(
          409,
          "This request key was already used with different reconciliation data.",
        );
      return { id: previous.id, revision: previous.revision };
    }
    const workspace = await readRefereeWorkspace(tx, actor, slug, fixtureId);
    if (!workspace.canRecord)
      throw new HttpError(409, "This fixture cannot record referee activity.");
    if (
      saved.revision !== command.expectedRevision ||
      workspace.session?.revision !== command.expectedSessionRevision ||
      workspace.dependencyFingerprint !== command.dependencyFingerprint
    )
      throw new HttpError(
        409,
        "The referee record changed. Refresh and reconcile the current record.",
      );
    if (
      workspace.session.dependencyFingerprint !==
      workspace.dependencyFingerprint
    )
      throw new HttpError(
        409,
        "Fixture dependencies changed. Withdraw affected steps and recheck the saved configuration.",
      );
    const attempts = new Map(
      workspace.projection.activeSelections.flatMap((selection) =>
        selection.attempts.map(
          (attempt) => [attempt.id, selection.beatmapId] as const,
        ),
      ),
    );
    const sources = changes.some((change) => change.importId !== null)
      ? await sourcesFor(tx, actor, slug, fixtureId)
      : [];
    const oldLinks = new Map(saved.links.map((link) => [link.attemptId, link]));
    const changedAttempts = new Set(changes.map((change) => change.attemptId));
    // Check the final assignment so a batch can move or swap links atomically.
    const occupied = new Set(
      saved.links.flatMap((link) =>
        link.gameId !== null &&
        link.importId !== null &&
        attempts.has(link.attemptId) &&
        !changedAttempts.has(link.attemptId)
          ? [link.gameId]
          : [],
      ),
    );
    for (const change of changes) {
      const beatmapId = attempts.get(change.attemptId);
      if (beatmapId === undefined)
        throw new HttpError(
          409,
          "This attempt is no longer active. Refresh the referee record.",
        );
      if (change.gameId === null) continue;
      const source = sources.find(
        (s) =>
          s.importId === change.importId &&
          s.current &&
          s.fingerprint === change.sourceFingerprint,
      );
      const game = source?.games.find((g) => g.id === change.gameId);
      if (!game)
        throw new HttpError(
          409,
          "The MP source changed. Refresh and choose a current saved game.",
        );
      if (game.beatmapId !== beatmapId)
        throw new HttpError(
          400,
          "The selected MP game uses a different beatmap.",
        );
      if (occupied.has(game.id))
        throw new HttpError(
          409,
          "This MP game is already linked to another active attempt.",
        );
      occupied.add(game.id);
    }
    const records = changes.map((change, index) => ({
      id: randomUUID(),
      fixtureId,
      actorId: actor.osuId,
      // Keep the public idempotency key on the row returned as the receipt.
      requestKey:
        index === changes.length - 1 ? command.requestKey : randomUUID(),
      payloadHash,
      revision: saved.revision + index + 1,
      sessionRevision: command.expectedSessionRevision,
      dependencyFingerprint: command.dependencyFingerprint,
      attemptId: change.attemptId,
      importId: change.importId,
      sourceFingerprint: change.sourceFingerprint,
      gameId: change.gameId,
    }));
    await tx.insert(refereeReconciliations).values(records);
    await tx.insert(resultAuditEvents).values(
      records.map((record) => {
        const oldLink = oldLinks.get(record.attemptId);
        return {
          fixtureId,
          actorId: actor.osuId,
          action: "referee_reconcile",
          detail: {
            entity: { type: "referee_attempt", id: record.attemptId },
            before: oldLink
              ? {
                  reconciliationId: oldLink.id,
                  importId: oldLink.importId,
                  gameId: oldLink.gameId,
                  sessionRevision: oldLink.sessionRevision,
                }
              : null,
            after: {
              reconciliationId: record.id,
              importId: record.importId,
              gameId: record.gameId,
              sessionRevision: record.sessionRevision,
              dependencyFingerprint: record.dependencyFingerprint,
              sourceFingerprint: record.sourceFingerprint,
            },
          },
        };
      }),
    );
    const last = records[records.length - 1];
    return { id: last.id, revision: last.revision };
  });
  return {
    receipt,
    workspace: await refereeReconciliation(actor, slug, fixtureId),
  };
}
