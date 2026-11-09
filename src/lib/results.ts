import { db } from "@/db";
import {
  editionState,
  fixtures,
  mappoolEvents,
  mappools,
  matchImports,
  matchResults,
  resultAuditEvents,
  resultGameClaims,
  resultRevisions,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { scoringRulesSchema } from "./competition-model";
import { fixtureForReview, type FixtureReviewContext } from "./fixture-reads";
import { HttpError } from "./http-error";
import {
  reviewedResultSchema,
  type GameDecision,
  type MatchSource,
  type ReviewedResult,
} from "./match-model";
import { changeMatchResultWrite } from "./match-result-write-contracts";
import { previewMatch } from "./match-scoring";
import { checkedStoredMatchSource } from "./match-source";
import {
  hasResultCommandReceipt,
  resultRequestHash,
} from "./result-command-receipts";
import { matchReview, type MatchReview } from "./result-review";

function proposalFrom(
  context: FixtureReviewContext,
  source: MatchSource,
  decisions: GameDecision[],
  publicNote: string,
  useRoundRules = false,
): ReviewedResult {
  const exhibitionMp = context.round.stage === "exhibition" && !useRoundRules;
  const preview = previewMatch(source, context, decisions, useRoundRules);
  if (!preview.canSubmit)
    throw new HttpError(
      400,
      preview.blockers[0] ?? "Resolve the game review before submitting.",
    );
  return reviewedResultSchema.parse({
    ...(!exhibitionMp && context.exDeclarations.some((p) => p.exMode)
      ? { exDeclarations: context.exDeclarations }
      : {}),
    schemaVersion: 1,
    fixtureVersion: context.fixture.version,
    roundId: context.fixture.roundId,
    poolSnapshot: context.pool
      ? {
          poolId: context.pool.id,
          fmMode: context.pool.fmMode,
          fmRestrictions: context.pool.fmRestrictions,
          entries: context.pool.entries
            .map(({ beatmapId, category, position }) => ({
              beatmapId,
              category,
              position,
            }))
            .sort(
              (a, b) =>
                a.category.localeCompare(b.category) || a.position - b.position,
            ),
        }
      : null,
    poolVersion: context.pool?.version ?? null,
    teamIds: [context.fixture.homeTeamId, context.fixture.awayTeamId],
    rosterSnapshot: context.teams
      .map((t) => ({
        teamId: t.id,
        osuIds: t.members.map((m) => m.osuId).sort((a, b) => a - b),
      }))
      .sort((a, b) => a.teamId.localeCompare(b.teamId)),
    rulesSnapshot: exhibitionMp
      ? null
      : scoringRulesSchema.parse(context.round.scoringRules),
    sourceFingerprint: source.fingerprint,
    decisions,
    publicNote,
    games: preview.games
      .filter((g) => g.decision?.included)
      .map((g) => ({
        ...(g.exMode ? { exMode: true } : {}),
        gameId: g.game.id,
        confidence: g.confidence,
        attribution: g.players.map(({ osuId, teamId, evidence }) => ({
          osuId,
          teamId,
          evidence,
        })),
        warnings: g.warnings,
        beatmapId: g.game.beatmapId,
        beatmap: g.game.beatmap,
        mods: g.game.mods,
        scoringType: g.game.scoringType,
        homeScore: g.homeScore!,
        awayScore: g.awayScore!,
        winnerTeamId: g.winnerTeamId,
        tied: g.tied,
      })),
    series: preview.series,
  });
}

export async function resultCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
): Promise<{ review: MatchReview; publicChanged: boolean }> {
  await fixtureForReview(actor, slug, fixtureId);
  const parsed = changeMatchResultWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Confirm a valid result operation, complete review and current versions.",
    );
  const c = parsed.data;
  const capability =
    c.action === "submit"
      ? "record_results"
      : c.action === "publish" || c.action === "unpublish"
        ? "publish_results"
        : "approve_results";
  await assertCapability(actor, capability, slug);
  if (c.action === "approve_publish")
    await assertCapability(actor, "publish_results", slug);
  const hash = resultRequestHash(c);
  const publicChanged = [
    "approve_publish",
    "publish",
    "unpublish",
    "void",
  ].includes(c.action);
  try {
    await db().transaction(async (tx) => {
      await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug))
        .for("update");
      await tx
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, fixtureId))
        .for("update");
      const context = await fixtureForReview(actor, slug, fixtureId, tx);
      await assertCapability(actor, capability, slug, tx);
      if (c.action === "approve_publish")
        await assertCapability(actor, "publish_results", slug, tx);
      if (
        await hasResultCommandReceipt(tx, actor, fixtureId, c.requestKey, hash)
      )
        return;
      const state = context.result;
      if (
        !state ||
        state.version !== c.expectedVersion ||
        context.fixture.version !== c.expectedFixtureVersion
      )
        throw new HttpError(
          409,
          "Fixture or result changed. Refresh and review the authoritative state.",
        );
      const before = { ...state };
      let detail: Record<string, unknown> = {};
      if (c.action === "submit") {
        if (context.round.stage !== "exhibition" && c.rulesConfirmed !== true)
          throw new HttpError(
            400,
            "Confirm the approved scoring rules before submitting.",
          );
        if (!state.latestImportId || c.importId !== state.latestImportId)
          throw new HttpError(
            409,
            "The upstream source changed. Review the latest import explicitly.",
          );
        const [record] = await tx
          .select()
          .from(matchImports)
          .where(
            and(
              eq(matchImports.id, c.importId),
              eq(matchImports.fixtureId, fixtureId),
            ),
          );
        if (!record)
          throw new HttpError(404, "Import not found for this fixture.");
        const source = checkedStoredMatchSource(
          record.source,
          record.fingerprint,
        );
        const proposal = proposalFrom(
          context,
          source,
          c.decisions,
          c.publicNote,
        );
        const revision = state.currentRevision + 1;
        await tx.insert(resultRevisions).values({
          fixtureId,
          revision,
          importId: record.id,
          proposal,
          createdBy: actor.osuId,
        });
        await tx
          .update(matchResults)
          .set({
            currentRevision: revision,
            state: "submitted",
            version: state.version + 1,
          })
          .where(eq(matchResults.fixtureId, fixtureId));
        detail = { revision, importId: record.id, series: proposal.series };
      } else if (
        c.action === "approve" ||
        c.action === "publish" ||
        c.action === "approve_publish"
      ) {
        if (
          context.fixture.status === "cancelled" ||
          c.revision !== state.currentRevision ||
          state.state !== (c.action === "publish" ? "approved" : "submitted")
        )
          throw new HttpError(
            409,
            "Review the current submitted/approved revision before this action.",
          );
        const [revision] = await tx
          .select()
          .from(resultRevisions)
          .where(
            and(
              eq(resultRevisions.fixtureId, fixtureId),
              eq(resultRevisions.revision, c.revision),
            ),
          );
        const proposal = reviewedResultSchema.safeParse(revision?.proposal);
        if (
          !revision ||
          !proposal.success ||
          revision.importId !== state.latestImportId
        )
          throw new HttpError(
            409,
            "The proposal or source changed. Submit a fresh reviewed revision.",
          );
        const p = proposal.data;
        if (
          p.roundId !== context.fixture.roundId ||
          !isDeepStrictEqual(p.teamIds, [
            context.fixture.homeTeamId,
            context.fixture.awayTeamId,
          ]) ||
          (p.rulesSnapshot === null
            ? context.round.stage !== "exhibition"
            : !isDeepStrictEqual(p.rulesSnapshot, context.round.scoringRules))
        )
          throw new HttpError(
            409,
            "Fixture, mappool or scoring rules changed after review. Submit a fresh proposal.",
          );
        const [sourceRecord] = await tx
          .select()
          .from(matchImports)
          .where(
            and(
              eq(matchImports.id, revision.importId),
              eq(matchImports.fixtureId, fixtureId),
            ),
          );
        if (!sourceRecord)
          throw new HttpError(409, "The proposal's source is missing.");
        const source = checkedStoredMatchSource(
          sourceRecord.source,
          sourceRecord.fingerprint,
        );
        const reconstructed = proposalFrom(
          context,
          source,
          p.decisions,
          p.publicNote,
          p.rulesSnapshot !== null,
        );
        if (
          !isDeepStrictEqual(
            {
              ...reconstructed,
              fixtureVersion: p.fixtureVersion,
              poolVersion: p.poolVersion,
            },
            p,
          )
        )
          throw new HttpError(
            409,
            "The reviewed proposal no longer matches the verified source.",
          );
        if (c.action !== "publish") {
          const [oldPublished] = state.publishedRevision
            ? await tx
                .select()
                .from(resultRevisions)
                .where(
                  and(
                    eq(resultRevisions.fixtureId, fixtureId),
                    eq(resultRevisions.revision, state.publishedRevision),
                  ),
                )
            : [];
          const old = reviewedResultSchema.safeParse(oldPublished?.proposal);
          const gameIds = [
            ...new Set([
              ...p.games.map((g) => g.gameId),
              ...(old.success ? old.data.games.map((g) => g.gameId) : []),
            ]),
          ];
          await tx
            .delete(resultGameClaims)
            .where(eq(resultGameClaims.fixtureId, fixtureId));
          if (gameIds.length)
            await tx.insert(resultGameClaims).values(
              gameIds.map((externalGameId) => ({
                fixtureId,
                editionSlug: slug,
                externalGameId,
              })),
            );
          await tx
            .update(resultRevisions)
            .set({ approvedAt: new Date(), approvedBy: actor.osuId })
            .where(
              and(
                eq(resultRevisions.fixtureId, fixtureId),
                eq(resultRevisions.revision, c.revision),
              ),
            );
          await tx
            .update(matchResults)
            .set({ state: "approved", version: state.version + 1 })
            .where(eq(matchResults.fixtureId, fixtureId));
          if (context.fixture.mappoolId) {
            const [pool] = await tx
              .select()
              .from(mappools)
              .where(eq(mappools.id, context.fixture.mappoolId))
              .for("update");
            if (pool && !pool.lockedAt) {
              const [locked] = await tx
                .update(mappools)
                .set({ lockedAt: new Date() })
                .where(eq(mappools.id, pool.id))
                .returning();
              await tx.insert(mappoolEvents).values({
                editionSlug: slug,
                poolId: pool.id,
                actorId: actor.osuId,
                action: "completed_fixture_lock",
                before: { pool },
                after: { pool: locked, fixtureId, revision: c.revision },
              });
            }
          }
        }
        if (c.action !== "approve") {
          if (
            (c.action === "publish" &&
              (!revision.approvedAt || !revision.approvedBy)) ||
            !context.fixture.publishedAt
          )
            throw new HttpError(
              409,
              "Publish the fixture and approve this revision before publishing its result.",
            );
          await tx
            .update(matchResults)
            .set({
              publishedRevision: c.revision,
              publishedAt: new Date(),
              version: state.version + 1,
            })
            .where(eq(matchResults.fixtureId, fixtureId));
          await tx
            .delete(resultGameClaims)
            .where(eq(resultGameClaims.fixtureId, fixtureId));
          await tx.insert(resultGameClaims).values(
            p.games.map((g) => ({
              fixtureId,
              editionSlug: slug,
              externalGameId: g.gameId,
            })),
          );
        }
        detail = {
          revision: c.revision,
          sourceFingerprint: source.fingerprint,
          series: p.series,
        };
      } else if (c.action === "reject") {
        if (state.state !== "submitted" || c.revision !== state.currentRevision)
          throw new HttpError(
            409,
            "Only the current submitted proposal can be rejected.",
          );
        await tx
          .update(matchResults)
          .set({ state: "draft", version: state.version + 1 })
          .where(eq(matchResults.fixtureId, fixtureId));
        detail = { revision: c.revision };
      } else if (c.action === "unpublish") {
        if (!state.publishedRevision)
          throw new HttpError(409, "No result is currently published.");
        await tx
          .update(matchResults)
          .set({
            publishedRevision: null,
            publishedAt: null,
            version: state.version + 1,
          })
          .where(eq(matchResults.fixtureId, fixtureId));
      } else {
        if (!state.currentRevision)
          throw new HttpError(409, "No reviewed result exists to withdraw.");
        await tx
          .update(matchResults)
          .set({
            state: "draft",
            publishedRevision: null,
            publishedAt: null,
            version: state.version + 1,
          })
          .where(eq(matchResults.fixtureId, fixtureId));
        await tx
          .delete(resultGameClaims)
          .where(eq(resultGameClaims.fixtureId, fixtureId));
        detail = {
          withdrawnRevision: state.currentRevision,
          historyPreserved: true,
        };
      }
      const [after] = await tx
        .select()
        .from(matchResults)
        .where(eq(matchResults.fixtureId, fixtureId));
      await tx.insert(resultAuditEvents).values({
        fixtureId,
        actorId: actor.osuId,
        action: `result_${c.action}`,
        reason: "decisionNote" in c ? c.decisionNote : null,
        requestKey: c.requestKey,
        requestHash: hash,
        detail: {
          entity: { type: "fixture_result", id: fixtureId },
          before,
          after,
          ...detail,
        },
      });
    });
  } catch (error) {
    if (
      (error instanceof Error ? (error.cause as { code?: string }) : undefined)
        ?.code === "23505"
    )
      throw new HttpError(
        409,
        "A game is already claimed by another approved fixture, or this command was already confirmed. Refresh the authoritative state.",
      );
    throw error;
  }
  return { review: await matchReview(actor, slug, fixtureId), publicChanged };
}
