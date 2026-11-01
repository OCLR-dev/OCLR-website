import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  editionState,
  fixtures,
  matchImports,
  matchGames,
  refereeMpBindings,
  refereeMpScores,
  refereeEvents,
  refereeSessions,
  resultAuditEvents,
  resultGameClaims,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertBusinessWrite } from "./auth/staff";
import { assertOperationalEdition } from "./archive-guard";
import { HttpError } from "./http";
import {
  assertRefereeAccess,
  readRefereeWorkspace,
  refereeCommand,
  type RefereeWorkspace,
} from "./referee";
import { fetchMatchSource, parseMatchId } from "./osu-matches";
import {
  gameHash,
  lastAttemptOutcome,
  planMpResults,
  type MpReceipt,
} from "./referee-mp-model";
import type { RefereeEventPayload } from "./referee-model";

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
const version = z.number().int().nonnegative();
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z
    .object({
      action: z.literal("bind"),
      match: z.string().trim().min(1).max(250),
      expectedRevision: version,
      expectedSessionRevision: version,
      dependencyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ action: z.literal("unbind"), expectedRevision: version }).strict(),
  z.object({ action: z.literal("sync"), expectedRevision: version }).strict(),
]);
async function lock(tx: Tx, actor: User, slug: string, fixtureId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
  await tx
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug))
    .for("update");
  await tx
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)))
    .for("update");
  await assertRefereeAccess(tx, actor, slug, fixtureId, true);
  await assertOperationalEdition(slug, tx);
  return readRefereeWorkspace(tx, actor, slug, fixtureId);
}
async function bindingFor(tx: Pick<Tx, "select">, fixtureId: string) {
  const [binding] = await tx
    .select()
    .from(refereeMpBindings)
    .where(eq(refereeMpBindings.fixtureId, fixtureId));
  return binding;
}
async function view(
  tx: Pick<Tx, "select">,
  actor: User,
  slug: string,
  fixtureId: string,
) {
  const workspace = await readRefereeWorkspace(tx, actor, slug, fixtureId);
  const binding = await bindingFor(tx, fixtureId);
  return {
    workspace,
    binding: binding
      ? {
          matchId: binding.matchId,
          revision: binding.revision,
          enabled: binding.enabled,
          lastCheckedAt: binding.lastCheckedAt?.toISOString() ?? null,
          nextPollAt: binding.nextPollAt.toISOString(),
          error: binding.error,
          issues: binding.issues,
          issueCount: binding.issueCount,
          syncing:
            !!binding.leaseId &&
            !!binding.leaseUntil &&
            binding.leaseUntil > new Date(),
        }
      : null,
  };
}
export type RefereeMpView = Awaited<ReturnType<typeof view>>;

/** Source corrections append an aborted provisional outcome; no human event is overwritten. */
async function invalidate(
  tx: Tx,
  actor: User,
  w: RefereeWorkspace,
  rows: MpReceipt[],
) {
  let revision = w.session?.revision ?? 0;
  for (const row of rows) {
    if (
      row.review ||
      !row.eventId ||
      lastAttemptOutcome(w, row.attemptId)?.id !== row.eventId ||
      !w.projection.activeSelections.some((s) => s.id === row.pickId)
    )
      continue;
    const eventId = randomUUID(),
      requestKey = randomUUID();
    const payload: RefereeEventPayload = {
      type: "attempt_resolved",
      pickId: row.pickId,
      attemptId: row.attemptId,
      status: "aborted",
      winnerTeamId: null,
    };
    await tx.insert(refereeEvents).values({
      id: eventId,
      fixtureId: w.fixture.id,
      ordinal: ++revision,
      actorId: actor.osuId,
      requestKey,
      requestHash: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
      payload,
    });
    await tx
      .update(refereeMpScores)
      .set({ review: true, eventId })
      .where(eq(refereeMpScores.attemptId, row.attemptId));
    await tx.insert(resultAuditEvents).values({
      fixtureId: w.fixture.id,
      actorId: actor.osuId,
      action: "referee_mp_review_required",
      detail: {
        pickId: row.pickId,
        attemptId: row.attemptId,
        matchId: row.matchId,
        gameId: row.gameId,
        previousEventId: row.eventId,
        eventId,
      },
    });
  }
  if (revision !== (w.session?.revision ?? 0))
    await tx
      .update(refereeSessions)
      .set({ revision, updatedAt: new Date() })
      .where(eq(refereeSessions.fixtureId, w.fixture.id));
}
export async function refereeMpCommand(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
): Promise<RefereeMpView> {
  await assertBusinessWrite(actor, slug);
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Choose a valid MP link and current binding revision.",
    );
  const c = parsed.data;
  if (c.action === "status")
    return db().transaction((tx) => view(tx, actor, slug, fixtureId), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
  const matchId = c.action === "bind" ? parseMatchId(c.match) : null;
  const lease = randomUUID();
  const claim = await db().transaction(async (tx) => {
    const w = await lock(tx, actor, slug, fixtureId);
    const old = await bindingFor(tx, fixtureId);
    if ((old?.revision ?? 0) !== c.expectedRevision)
      throw new HttpError(
        409,
        "The MP binding changed. Refresh before continuing.",
      );
    if (c.action === "unbind") {
      if (old)
        await tx
          .update(refereeMpBindings)
          .set({
            enabled: false,
            revision: old.revision + 1,
            leaseId: null,
            leaseUntil: null,
          })
          .where(eq(refereeMpBindings.fixtureId, fixtureId));
      await tx.insert(resultAuditEvents).values({
        fixtureId,
        actorId: actor.osuId,
        action: "referee_mp_unbound",
        detail: { matchId: old?.matchId ?? null },
      });
      return null;
    }
    if (c.action === "bind") {
      if (
        !w.canRecord ||
        w.readiness.length ||
        (w.session?.revision ?? 0) !== c.expectedSessionRevision ||
        w.dependencyFingerprint !== c.dependencyFingerprint ||
        (w.session &&
          w.session.dependencyFingerprint !== w.dependencyFingerprint)
      )
        throw new HttpError(
          409,
          "Refresh the referee workspace and resolve its readiness issues first.",
        );
      const value = {
        matchId: matchId!,
        revision: (old?.revision ?? 0) + 1,
        enabled: true,
        dependencyFingerprint: w.dependencyFingerprint,
        actorId: actor.osuId,
        lastCheckedAt: null,
        nextPollAt: old?.nextPollAt ?? new Date(),
        leaseId: null,
        leaseUntil: null,
        importId: null,
        error: null,
        issues: [],
        issueCount: 0,
      };
      await tx
        .insert(refereeMpBindings)
        .values({ fixtureId, ...value })
        .onConflictDoUpdate({
          target: refereeMpBindings.fixtureId,
          set: value,
        });
      await tx.insert(resultAuditEvents).values({
        fixtureId,
        actorId: actor.osuId,
        action: "referee_mp_bound",
        detail: {
          before: old?.matchId ?? null,
          matchId,
          revision: value.revision,
        },
      });
      return null;
    }
    if (!old?.enabled)
      throw new HttpError(409, "Bind an MP link before syncing results.");
    const rows = await tx
      .select()
      .from(refereeMpScores)
      .where(eq(refereeMpScores.fixtureId, fixtureId));
    if (
      old.dependencyFingerprint !== w.dependencyFingerprint ||
      (w.session &&
        w.session.dependencyFingerprint !== w.dependencyFingerprint) ||
      !w.canRecord ||
      w.readiness.length
    ) {
      await invalidate(tx, actor, w, rows);
      await tx
        .update(refereeMpBindings)
        .set({
          error: "dependencies",
          issueCount: 1,
          issues: [{ gameId: null, beatmapId: null, reason: "dependencies" }],
          leaseId: null,
          leaseUntil: null,
          nextPollAt: new Date(Date.now() + 60000),
        })
        .where(eq(refereeMpBindings.fixtureId, fixtureId));
      return null;
    }
    if (
      old.nextPollAt > new Date() ||
      (old.leaseId && old.leaseUntil && old.leaseUntil > new Date())
    )
      return null;
    await tx
      .update(refereeMpBindings)
      .set({
        leaseId: lease,
        leaseUntil: new Date(Date.now() + 120000),
        nextPollAt: new Date(Date.now() + 30000),
      })
      .where(eq(refereeMpBindings.fixtureId, fixtureId));
    return {
      matchId: old.matchId,
      revision: old.revision,
      dependencyFingerprint: w.dependencyFingerprint,
    };
  });
  if (!claim) return view(db(), actor, slug, fixtureId);
  let source;
  try {
    source = await fetchMatchSource(claim.matchId);
  } catch {
    await db().transaction(async (tx) => {
      await lock(tx, actor, slug, fixtureId);
      await tx
        .update(refereeMpBindings)
        .set({
          error: "provider",
          leaseId: null,
          leaseUntil: null,
          nextPollAt: new Date(Date.now() + 60000),
        })
        .where(
          and(
            eq(refereeMpBindings.fixtureId, fixtureId),
            eq(refereeMpBindings.leaseId, lease),
          ),
        );
    });
    return view(db(), actor, slug, fixtureId);
  }
  await db().transaction(async (tx) => {
    let w = await lock(tx, actor, slug, fixtureId);
    const binding = await bindingFor(tx, fixtureId);
    if (
      !binding?.enabled ||
      binding.revision !== claim.revision ||
      binding.leaseId !== lease
    )
      return;
    const rows = await tx
      .select()
      .from(refereeMpScores)
      .where(eq(refereeMpScores.fixtureId, fixtureId));
    if (
      binding.dependencyFingerprint !== w.dependencyFingerprint ||
      (w.session &&
        w.session.dependencyFingerprint !== w.dependencyFingerprint) ||
      !w.canRecord ||
      w.readiness.length
    ) {
      await invalidate(tx, actor, w, rows);
      await tx
        .update(refereeMpBindings)
        .set({
          error: "dependencies",
          issueCount: 1,
          issues: [{ gameId: null, beatmapId: null, reason: "dependencies" }],
          leaseId: null,
          leaseUntil: null,
        })
        .where(eq(refereeMpBindings.fixtureId, fixtureId));
      return;
    }
    if (source.match.id !== binding.matchId)
      throw new HttpError(502, "The MP source did not match the bound room.");
    let [saved] = await tx
      .select()
      .from(matchImports)
      .where(
        and(
          eq(matchImports.fixtureId, fixtureId),
          eq(matchImports.externalMatchId, source.match.id),
          eq(matchImports.fingerprint, source.fingerprint),
        ),
      );
    if (!saved) {
      [saved] = await tx
        .insert(matchImports)
        .values({
          fixtureId,
          externalMatchId: source.match.id,
          fingerprint: source.fingerprint,
          source,
          createdBy: actor.osuId,
        })
        .returning();
      if (source.games.length)
        await tx.insert(matchGames).values(
          source.games.map((game) => ({
            importId: saved.id,
            externalGameId: game.id,
            beatmapId: game.beatmapId,
            data: game,
          })),
        );
    }
    const claimed = source.games.length
      ? await tx
          .select({ gameId: refereeMpScores.gameId })
          .from(refereeMpScores)
          .where(
            inArray(
              refereeMpScores.gameId,
              source.games.map((g) => g.id),
            ),
          )
      : [];
    const officialClaims = source.games.length
      ? await tx
          .select({ gameId: resultGameClaims.externalGameId })
          .from(resultGameClaims)
          .where(
            and(
              eq(resultGameClaims.editionSlug, slug),
              ne(resultGameClaims.fixtureId, fixtureId),
              inArray(
                resultGameClaims.externalGameId,
                source.games.map((g) => g.id),
              ),
            ),
          )
      : [];
    const plan = planMpResults(
      w,
      source,
      rows,
      new Set([...claimed, ...officialClaims].map((r) => r.gameId)),
    );
    await invalidate(tx, actor, w, plan.invalidate);
    w = await readRefereeWorkspace(tx, actor, slug, fixtureId);
    for (const item of plan.score) {
      const result = await refereeCommand(
        actor,
        slug,
        fixtureId,
        {
          action: "resolve_attempt",
          pickId: item.pickId,
          status: "completed",
          winnerTeamId: item.winnerTeamId,
          requestKey: randomUUID(),
          expectedRevision: w.session?.revision ?? 0,
          dependencyFingerprint: w.dependencyFingerprint,
        },
        tx,
      );
      w = result.workspace;
      await tx.insert(refereeMpScores).values({
        fixtureId,
        attemptId: item.attemptId,
        pickId: item.pickId,
        matchId: source.match.id,
        gameId: item.game.id,
        gameHash: gameHash(item.game),
        eventId: result.receipt.eventId,
      });
      await tx.insert(resultAuditEvents).values({
        fixtureId,
        actorId: actor.osuId,
        action: "referee_mp_scored",
        detail: {
          attemptId: item.attemptId,
          eventId: result.receipt.eventId,
          importId: saved.id,
          matchId: source.match.id,
          gameId: item.game.id,
          gameHash: gameHash(item.game),
          sourceFingerprint: source.fingerprint,
        },
      });
    }
    await tx
      .update(refereeMpBindings)
      .set({
        lastCheckedAt: new Date(),
        importId: saved.id,
        error: null,
        issues: plan.issues.slice(0, 100),
        issueCount: plan.issues.length,
        leaseId: null,
        leaseUntil: null,
      })
      .where(eq(refereeMpBindings.fixtureId, fixtureId));
  });
  return view(db(), actor, slug, fixtureId);
}
