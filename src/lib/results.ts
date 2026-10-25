import { db } from "@/db";
import {
  editionEvents,
  editionState,
  fixtureReferees,
  fixtures,
  mappoolEvents,
  mappools,
  matchGames,
  matchImports,
  matchResults,
  resultAuditEvents,
  resultGameClaims,
  resultRevisions,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { User } from "./auth/sessions";
import { assertCapability, hasCapability } from "./auth/staff";
import { scoringRulesSchema } from "./competition-model";
import { remoteMode } from "./data-source";
import {
  fixtureForReview,
  officialTeams,
  staffFixtures,
  type FixtureReviewContext,
} from "./fixtures";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
import {
  gameDecisionSchema,
  matchSourceSchema,
  reviewedResultSchema,
  type MatchSource,
  type ReviewedResult,
} from "./match-model";
import { previewMatch } from "./match-scoring";
import {
  compareMatchSources,
  fetchMatchSource,
  parseMatchId,
} from "./osu-matches";
type Reader = Pick<ReturnType<typeof db>, "select">;
const common = {
  requestKey: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  expectedFixtureVersion: z.number().int().nonnegative(),
  confirmed: z.literal(true),
};
const sourceDiffSchema = z
  .object({
    added: z.array(z.number().int().positive()).max(3000),
    removed: z.array(z.number().int().positive()).max(3000),
    changed: z.array(z.number().int().positive()).max(3000),
    historyChanged: z.boolean(),
  })
  .strict();
const importSchema = z
  .object({
    ...common,
    match: z.string().trim().min(1).max(250),
    completion: z
      .object({
        homeTeamId: z.uuid(),
        awayTeamId: z.uuid(),
        sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("submit"),
      importId: z.uuid(),
      rulesConfirmed: z.literal(true),
      sourceChangesConfirmed: z.literal(true),
      decisions: z.array(gameDecisionSchema).max(3000),
      publicNote: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("approve"),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("approve_publish"),
      revision: z.number().int().positive(),
      progressionAcknowledged: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("reject"),
      decisionNote: z.string().trim().min(1).max(1000),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("publish"),
      revision: z.number().int().positive(),
      progressionAcknowledged: z.literal(true),
    })
    .strict(),
  z.object({ ...common, action: z.literal("unpublish") }).strict(),
  z
    .object({
      ...common,
      action: z.literal("void"),
      decisionNote: z.string().trim().min(1).max(1000),
      progressionAcknowledged: z.literal(true),
    })
    .strict(),
]);
function commandHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function replay(
  reader: Reader,
  actor: User,
  fixtureId: string,
  requestKey: string,
  hash: string,
) {
  const [event] = await reader
    .select()
    .from(resultAuditEvents)
    .where(
      and(
        eq(resultAuditEvents.fixtureId, fixtureId),
        eq(resultAuditEvents.actorId, actor.osuId),
        eq(resultAuditEvents.requestKey, requestKey),
      ),
    );
  if (event && event.requestHash !== hash)
    throw new HttpError(
      409,
      "This request key was already used for a different operation.",
    );
  return Boolean(event);
}
function checkedSource(value: unknown, fingerprint?: string): MatchSource {
  const parsed = matchSourceSchema.safeParse(value);
  if (
    !parsed.success ||
    (fingerprint && parsed.data.fingerprint !== fingerprint)
  )
    throw new HttpError(
      409,
      "This stored source is incomplete or unsupported. Import a fresh snapshot before reviewing.",
    );
  return parsed.data;
}
function proposalFrom(
  context: FixtureReviewContext,
  source: MatchSource,
  decisions: z.infer<typeof gameDecisionSchema>[],
  publicNote: string,
): ReviewedResult {
  const preview = previewMatch(source, context, decisions);
  if (!preview.canSubmit)
    throw new HttpError(
      400,
      preview.blockers[0] ?? "Resolve the game review before submitting.",
    );
  return reviewedResultSchema.parse({
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
    rulesSnapshot: scoringRulesSchema.parse(context.round.scoringRules),
    sourceFingerprint: source.fingerprint,
    decisions,
    publicNote,
    games: preview.games
      .filter((g) => g.decision?.included)
      .map((g) => ({
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
async function databaseMatchReview(
  actor: User,
  slug: string,
  fixtureId: string,
) {
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
): Promise<Awaited<ReturnType<typeof databaseMatchReview>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseMatchReview>>>(
      "matchReview",
      { slug, fixtureId },
    );
  }
  return databaseMatchReview(actor, slug, fixtureId);
}

export type MatchReview = Awaited<ReturnType<typeof matchReview>>;
export async function importFixtureMatch(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
) {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm a valid MP link and current versions.");
  const c = parsed.data;
  let before;
  if (c.completion) {
    await assertCapability(actor, "manage_fixtures", slug);
    const workspace = await staffFixtures(actor, slug);
    const fixture = workspace.fixtures.find((f) => f.id === fixtureId);
    if (!fixture) throw new HttpError(404, "Fixture not found.");
    before = { fixture, result: fixture.result };
  } else before = await fixtureForReview(actor, slug, fixtureId);
  const hash = commandHash({ action: "import", ...c });
  if (await replay(db(), actor, fixtureId, c.requestKey, hash))
    return matchReview(actor, slug, fixtureId);
  if (before.fixture.status === "cancelled")
    throw new HttpError(409, "Cancelled fixtures cannot import new results.");
  if (
    before.fixture.version !== c.expectedFixtureVersion ||
    (before.result?.version ?? 0) !== c.expectedVersion
  )
    throw new HttpError(
      409,
      "Fixture or report changed. Refresh before importing.",
    );
  const source = await fetchMatchSource(parseMatchId(c.match));
  if (c.completion && source.fingerprint !== c.completion.sourceFingerprint)
    throw new HttpError(
      409,
      "Match source changed. Retrieve the preview again.",
    );
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
    if (await replay(tx, actor, fixtureId, c.requestKey, hash)) return;
    let completed = false;
    if (c.completion) {
      await assertCapability(actor, "manage_fixtures", slug, tx);
      const [fixture] = await tx
        .select()
        .from(fixtures)
        .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)));
      const [result] = await tx
        .select()
        .from(matchResults)
        .where(eq(matchResults.fixtureId, fixtureId));
      if (
        !fixture ||
        fixture.version !== c.expectedFixtureVersion ||
        (result?.version ?? 0) !== c.expectedVersion ||
        fixture.status === "cancelled"
      )
        throw new HttpError(
          409,
          "Fixture or report changed. Refresh before importing.",
        );
      const selected = c.completion;
      if (
        selected.homeTeamId === selected.awayTeamId ||
        (fixture.homeTeamId && fixture.homeTeamId !== selected.homeTeamId) ||
        (fixture.awayTeamId && fixture.awayTeamId !== selected.awayTeamId) ||
        (!fixture.homeTeamId && fixture.homeSourceId) ||
        (!fixture.awayTeamId && fixture.awaySourceId)
      )
        throw new HttpError(
          409,
          "Existing teams and bracket sources are preserved. Amend conflicting fixture settings first.",
        );
      const [protectedRevision] = await tx
        .select({ revision: resultRevisions.revision })
        .from(resultRevisions)
        .where(
          and(
            eq(resultRevisions.fixtureId, fixtureId),
            sql`${resultRevisions.approvedAt} IS NOT NULL`,
          ),
        )
        .limit(1);
      if (protectedRevision)
        throw new HttpError(
          409,
          "Approved fixture history cannot be completed from an MP preview.",
        );
      const eligible = await officialTeams(tx, slug);
      if (
        ![selected.homeTeamId, selected.awayTeamId].every((id) =>
          eligible.some((t) => t.id === id),
        )
      )
        throw new HttpError(
          409,
          "Both teams must have finalized published identities and rosters before reporting.",
        );
      completed = !fixture.homeTeamId || !fixture.awayTeamId;
      if (completed) {
        const [after] = await tx
          .update(fixtures)
          .set({
            homeTeamId: selected.homeTeamId,
            awayTeamId: selected.awayTeamId,
            version: fixture.version + 1,
          })
          .where(eq(fixtures.id, fixtureId))
          .returning();
        await tx.insert(editionEvents).values({
          editionSlug: slug,
          actorId: actor.osuId,
          kind: "fixture_completed_from_mp",
          detail: {
            entity: { type: "fixture", id: fixtureId },
            before: fixture,
            after,
            source: {
              matchId: source.match.id,
              fingerprint: source.fingerprint,
              startTime: source.match.startTime,
              endTime: source.match.endTime,
            },
          },
        });
      }
    }
    const context = await fixtureForReview(actor, slug, fixtureId, tx);
    if (
      context.fixture.status === "cancelled" ||
      context.fixture.version !==
        c.expectedFixtureVersion + (completed ? 1 : 0) ||
      (context.result?.version ?? 0) !== c.expectedVersion
    )
      throw new HttpError(
        409,
        "Fixture or report changed while osu! was responding. Refresh before retrying.",
      );
    const [prior] = context.result?.latestImportId
      ? await tx
          .select()
          .from(matchImports)
          .where(eq(matchImports.id, context.result.latestImportId))
      : [];
    const [existing] = await tx
      .select()
      .from(matchImports)
      .where(
        and(
          eq(matchImports.fixtureId, fixtureId),
          eq(matchImports.externalMatchId, source.match.id),
          eq(matchImports.fingerprint, source.fingerprint),
        ),
      );
    let importId = existing?.id;
    if (existing) checkedSource(existing.source, existing.fingerprint);
    else {
      const [created] = await tx
        .insert(matchImports)
        .values({
          fixtureId,
          externalMatchId: source.match.id,
          fingerprint: source.fingerprint,
          source,
          createdBy: actor.osuId,
        })
        .returning();
      importId = created.id;
      if (source.games.length)
        await tx.insert(matchGames).values(
          source.games.map((game) => ({
            importId: created.id,
            externalGameId: game.id,
            beatmapId: game.beatmapId,
            data: game,
          })),
        );
    }
    const didChange = context.result?.latestImportId !== importId;
    const version = (context.result?.version ?? 0) + (didChange ? 1 : 0);
    if (context.result)
      await tx
        .update(matchResults)
        .set({ latestImportId: importId!, version })
        .where(eq(matchResults.fixtureId, fixtureId));
    else
      await tx
        .insert(matchResults)
        .values({ fixtureId, latestImportId: importId!, version });
    const priorParsed = prior
      ? matchSourceSchema.safeParse(prior.source)
      : null;
    await tx.insert(resultAuditEvents).values({
      fixtureId,
      actorId: actor.osuId,
      action: didChange ? "source_imported" : "source_checked",
      requestKey: c.requestKey,
      requestHash: hash,
      detail: {
        entity: { type: "match_import", id: importId },
        before: {
          latestImportId: context.result?.latestImportId ?? null,
          version: context.result?.version ?? 0,
        },
        after: { latestImportId: importId, version },
        importId,
        externalMatchId: source.match.id,
        fingerprint: source.fingerprint,
        observedAt: source.fetchedAt,
        fromVersion: context.result?.version ?? 0,
        toVersion: version,
        diff: priorParsed?.success
          ? compareMatchSources(priorParsed.data, source)
          : null,
      },
    });
  });
  return matchReview(actor, slug, fixtureId);
}
export async function resultCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
) {
  await fixtureForReview(actor, slug, fixtureId);
  const parsed = commandSchema.safeParse(input);
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
  const hash = commandHash(c);
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
      if (await replay(tx, actor, fixtureId, c.requestKey, hash)) return;
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
        const source = checkedSource(record.source, record.fingerprint);
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
          !isDeepStrictEqual(p.rulesSnapshot, context.round.scoringRules)
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
        const source = checkedSource(
          sourceRecord.source,
          sourceRecord.fingerprint,
        );
        const reconstructed = proposalFrom(
          context,
          source,
          p.decisions,
          p.publicNote,
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

export async function previewFixtureMatch(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
) {
  await assertCapability(actor, "record_results", slug);
  if (!(await hasCapability(actor, "manage_fixtures", slug))) {
    const [assignment] = await db()
      .select()
      .from(fixtureReferees)
      .where(
        and(
          eq(fixtureReferees.fixtureId, fixtureId),
          eq(fixtureReferees.userId, actor.osuId),
        ),
      );
    if (!assignment)
      throw new HttpError(403, "You are not assigned to this fixture.");
  }
  const workspace = await staffFixtures(actor, slug);
  const fixture = workspace.fixtures.find((f) => f.id === fixtureId);
  if (!fixture) throw new HttpError(404, "Fixture not found.");
  const parsed = z
    .object({ match: z.string().trim().min(1).max(250) })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm a valid MP link and current versions.");
  if (fixture.status === "cancelled")
    throw new HttpError(409, "Cancelled fixtures cannot import new results.");
  const source = await fetchMatchSource(parseMatchId(parsed.data.match));
  // Repeat authorization after the network call; revocations take effect immediately.
  const refreshed = await staffFixtures(actor, slug);
  if (!refreshed.fixtures.some((f) => f.id === fixtureId))
    throw new HttpError(403, "You are not assigned to this fixture.");
  const teams = refreshed.canManage
    ? await officialTeams(db(), slug)
    : refreshed.teams;
  const playerIds = [
    ...new Set(
      source.games.flatMap((g) =>
        g.scores.flatMap((s) => (s.osuId ? [s.osuId] : [])),
      ),
    ),
  ];
  const attribution = playerIds.map((osuId) => ({
    osuId,
    teamIds: teams
      .filter((t) => t.members.some((m) => m.osuId === osuId))
      .map((t) => t.id),
  }));
  const matched = [...new Set(attribution.flatMap((p) => p.teamIds))];
  const currentFixture = refreshed.fixtures.find((f) => f.id === fixtureId)!;
  const unique =
    attribution.length > 0 &&
    attribution.every((p) => p.teamIds.length === 1) &&
    matched.length === 2 &&
    (!currentFixture.homeTeamId ||
      matched.includes(currentFixture.homeTeamId)) &&
    (!currentFixture.awayTeamId || matched.includes(currentFixture.awayTeamId));
  const home =
    currentFixture.homeTeamId ??
    (unique
      ? (matched.find((id) => id !== currentFixture.awayTeamId) ?? null)
      : null);
  const away =
    currentFixture.awayTeamId ??
    (unique ? (matched.find((id) => id !== home) ?? null) : null);
  return {
    source,
    teams,
    attribution,
    fixture: currentFixture,
    suggested: { homeTeamId: home, awayTeamId: away },
    unique,
    expectedFixtureVersion: refreshed.fixtures.find((f) => f.id === fixtureId)!
      .version,
    expectedVersion:
      refreshed.fixtures.find((f) => f.id === fixtureId)!.result?.version ?? 0,
  };
}
export type FixtureMatchPreview = Awaited<
  ReturnType<typeof previewFixtureMatch>
>;
