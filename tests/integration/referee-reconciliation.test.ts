import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  matchResults,
  matchGames,
  resultGameClaims,
  refereeReconciliations,
  fixtureReferees,
  matchImports,
  mappools,
  fixtures,
  resultAuditEvents,
} from "../../src/db/schema";
import {
  seedRefereeFixture,
  refereeTestAdmin as admin,
  refereeTestUser as actor,
} from "../fixtures/referee";
import { assertTestDatabase } from "../database";
import { matchReview } from "../../src/lib/result-review";
import { resultCommand } from "../../src/lib/results";
import { publicFixture } from "../../src/lib/public-competition";
import { refereeCommand } from "../../src/lib/referee";
import { type RefereeWorkspace } from "../../src/lib/referee-workspace";
import {
  refereeReconciliation,
  reconcileRefereeAttempt,
} from "../../src/lib/referee-reconciliation";
import {
  GET,
  POST as route,
} from "../../src/app/api/admin/tournaments/[edition]/matches/[fixtureId]/referee/reconciliation/route";
import {
  reconcileRefereeAttemptWrite,
  refereeReconciliationReceipt,
} from "../../src/lib/referee-write-contracts";
import { matchSourceSchema } from "../../src/lib/match-model";
import { extendedSchemas } from "../../src/lib/extended-read-resources";
const origin = "https://oclr.example.test";
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => actor,
}));
function post(fixtureId: string, input: unknown) {
  return route(
    new Request(
      origin +
        reconcileRefereeAttemptWrite.path
          .replace("{edition}", "test-cup")
          .replace("{fixtureId}", fixtureId),
      {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
    { params: Promise.resolve({ edition: "test-cup", fixtureId }) },
  );
}
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("saved referee MP reconciliation boundaries", () => {
  let fixtureId: string, w: RefereeWorkspace;
  beforeAll(() => {
    assertTestDatabase(url);
    if (new URL(url!).pathname === "/oclr_frontend_test")
      throw Error("Not the preview DB");
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    const setup = await seedRefereeFixture();
    fixtureId = setup.fixtureId;
    w = setup.workspace;
    async function run(extra: Record<string, unknown>) {
      w = (
        await refereeCommand(actor, "test-cup", fixtureId, {
          ...extra,
          requestKey: randomUUID(),
          expectedRevision: w.session?.revision ?? 0,
          dependencyFingerprint: w.dependencyFingerprint,
        })
      ).workspace;
    }
    await run({
      action: "set_order",
      firstBanTeamId: w.teams[0].id,
      firstPickTeamId: w.teams[1].id,
    });
    await run({
      action: "record_selection",
      entryId: w.maps.find((m) => m.beatmapId === 10004)!.id,
    });
    await run({
      action: "record_selection",
      entryId: w.maps.find((m) => m.beatmapId === 10001)!.id,
    });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function command() {
    const data = await refereeReconciliation(actor, "test-cup", fixtureId);
    const source = data.sources.find((s) => s.current)!;
    const game = source.games.find((g) => g.beatmapId === 10001)!;
    return {
      requestKey: randomUUID(),
      expectedRevision: data.revision,
      expectedSessionRevision: data.sessionRevision,
      dependencyFingerprint: data.dependencyFingerprint,
      attemptId: data.rows[0].attemptId,
      importId: source.importId,
      sourceFingerprint: source.fingerprint,
      gameId: game.id,
    };
  }
  it("publishes a reviewed referee series without MP data and rejects stale revisions", async () => {
    const [result] = await db()
      .delete(matchResults)
      .where(eq(matchResults.fixtureId, fixtureId))
      .returning();
    await db()
      .delete(matchGames)
      .where(eq(matchGames.importId, result.latestImportId!));
    await db()
      .delete(matchImports)
      .where(eq(matchImports.id, result.latestImportId!));

    async function record(payload: Record<string, unknown>) {
      w = (
        await refereeCommand(actor, "test-cup", fixtureId, {
          ...payload,
          requestKey: randomUUID(),
          expectedRevision: w.session!.revision,
          dependencyFingerprint: w.dependencyFingerprint,
        })
      ).workspace;
    }
    const home = w.teams[0].id;
    const away = w.teams[1].id;
    const resolve = (winnerTeamId: string | null) =>
      record({
        action: "resolve_attempt",
        pickId: w.projection.lastSelectionId,
        status: winnerTeamId ? "completed" : "aborted",
        winnerTeamId,
      });
    const submit = (review: Awaited<ReturnType<typeof matchReview>>) => ({
      action: "submit_referee",
      confirmed: true,
      expectedVersion: review.context.result?.version ?? 0,
      expectedFixtureVersion: review.context.fixture.version,
      refereeRevision: review.refereeReview!.revision,
      dependencyFingerprint: review.refereeReview!.dependencyFingerprint,
      publicNote: "",
      requestKey: randomUUID(),
    });

    const incomplete = await matchReview(actor, "test-cup", fixtureId);
    expect(incomplete.refereeReview?.blocker).toBeTruthy();
    await expect(
      resultCommand(actor, "test-cup", fixtureId, submit(incomplete)),
    ).rejects.toMatchObject({ status: 409 });
    await resolve(null);
    await record({
      action: "replay_attempt",
      pickId: w.projection.lastSelectionId,
    });
    await resolve(home);
    await record({
      action: "record_selection",
      entryId: w.maps.find((m) => m.beatmapId === 10005)!.id,
    });
    await record({
      action: "record_selection",
      entryId: w.maps.find((m) => m.beatmapId === 10002)!.id,
    });
    await resolve(home);

    const reviewed = await matchReview(actor, "test-cup", fixtureId);
    expect(reviewed.source).toBeNull();
    expect(reviewed.refereeReview?.games.map((g) => g.beatmapId)).toEqual([
      10001, 10002,
    ]);
    const submission = submit(reviewed);
    let submitted = (
      await resultCommand(actor, "test-cup", fixtureId, submission)
    ).review;
    const replay = await resultCommand(
      actor,
      "test-cup",
      fixtureId,
      submission,
    );
    expect(replay.review.current?.revision).toBe(submitted.current?.revision);
    const approval = () => ({
      action: "approve_publish",
      expectedVersion: submitted.context.result!.version,
      expectedFixtureVersion: submitted.context.fixture.version,
      revision: submitted.current!.revision,
      confirmed: true,
      progressionAcknowledged: true,
      requestKey: randomUUID(),
    });
    expect((await publicFixture("test-cup", fixtureId))?.result).toBeNull();
    await expect(
      resultCommand(actor, "test-cup", fixtureId, approval()),
    ).rejects.toMatchObject({ status: 403 });
    await resolve(away);
    await expect(
      resultCommand(admin, "test-cup", fixtureId, approval()),
    ).rejects.toMatchObject({ status: 409 });

    await resolve(home);
    submitted = (
      await resultCommand(
        actor,
        "test-cup",
        fixtureId,
        submit(await matchReview(actor, "test-cup", fixtureId)),
      )
    ).review;
    await resultCommand(admin, "test-cup", fixtureId, approval());
    const published = await publicFixture("test-cup", fixtureId);
    expect(published?.result).toMatchObject({
      homeWins: 2,
      awayWins: 0,
      winnerTeamId: home,
      mpId: null,
      mpUrl: null,
      games: [],
      refereeGames: [
        { beatmapId: 10001, winnerTeamId: home },
        { beatmapId: 10002, winnerTeamId: home },
      ],
    });
    expect(published?.details).toBeNull();
    expect(await db().select().from(resultGameClaims)).toHaveLength(0);
    await resolve(away);
    expect((await publicFixture("test-cup", fixtureId))?.result).toEqual(
      published?.result,
    );
  });
  it("reads no automatic mappings and preserves official result state", async () => {
    const before = await db().select().from(matchResults);
    const data = await refereeReconciliation(actor, "test-cup", fixtureId);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].status).toBe("unmatched");
    expect(await db().select().from(refereeReconciliations)).toHaveLength(0);
    const input = await command();
    await reconcileRefereeAttempt(actor, "test-cup", fixtureId, input);
    expect(await db().select().from(matchResults)).toEqual(before);
    await expect(
      refereeReconciliation(actor, "other-test-cup", fixtureId),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("retries return one receipt and payload changes cannot reuse request IDs", async () => {
    const input = await command();
    const first = await post(fixtureId, input);
    expect(first.status).toBe(200);
    const saved = await first.json();
    expect(refereeReconciliationReceipt.parse(saved.receipt)).toEqual(
      saved.receipt,
    );
    expect(
      extendedSchemas.refereeReconciliation.parse(saved.workspace),
    ).toEqual(saved.workspace);
    const replay = await post(fixtureId, input);
    expect(replay.status).toBe(200);
    expect((await replay.json()).receipt).toEqual(saved.receipt);
    expect(await db().select().from(refereeReconciliations)).toHaveLength(1);
    const conflict = await post(fixtureId, { ...input, gameId: 999 });
    expect(conflict.status).toBe(409);
  });
  it("saves a batch atomically, replays one receipt, and returns both links on reload", async () => {
    const pickId = w.projection.lastSelectionId!;
    for (const action of ["resolve_attempt", "replay_attempt"] as const) {
      w = (
        await refereeCommand(actor, "test-cup", fixtureId, {
          action,
          pickId,
          ...(action === "resolve_attempt"
            ? { status: "aborted", winnerTeamId: null }
            : {}),
          requestKey: randomUUID(),
          expectedRevision: w.session!.revision,
          dependencyFingerprint: w.dependencyFingerprint,
        })
      ).workspace;
    }
    const [original] = await db()
      .select()
      .from(matchImports)
      .where(eq(matchImports.fixtureId, fixtureId));
    const source = matchSourceSchema.parse(original.source);
    const replayGameId = 20001;
    const firstGame = source.games.find((game) => game.beatmapId === 10001)!;
    await db()
      .update(matchImports)
      .set({
        source: {
          ...source,
          games: [...source.games, { ...firstGame, id: replayGameId }],
        },
      })
      .where(eq(matchImports.id, original.id));
    const data = await refereeReconciliation(actor, "test-cup", fixtureId);
    const {
      requestKey,
      expectedRevision,
      expectedSessionRevision,
      dependencyFingerprint,
      ...firstLink
    } = await command();
    const secondAttempt = data.rows[1].attemptId;
    const batch = {
      requestKey,
      expectedRevision,
      expectedSessionRevision,
      dependencyFingerprint,
    };
    const duplicate = await post(fixtureId, {
      ...batch,
      links: [firstLink, { ...firstLink, attemptId: secondAttempt }],
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toContain("already linked");
    expect(await db().select().from(refereeReconciliations)).toHaveLength(0);

    const links = [
      firstLink,
      { ...firstLink, attemptId: secondAttempt, gameId: replayGameId },
    ];
    const saved = await post(fixtureId, { ...batch, links });
    expect(saved.status, await saved.clone().text()).toBe(200);
    const { receipt } = await saved.json();
    expect(receipt.revision).toBe(2);
    const retry = await post(fixtureId, { ...batch, links });
    expect((await retry.json()).receipt).toEqual(receipt);
    const params = { edition: "test-cup", fixtureId };
    const reloaded = await GET(
      new Request(
        origin +
          reconcileRefereeAttemptWrite.path
            .replace("{edition}", params.edition)
            .replace("{fixtureId}", fixtureId),
      ),
      { params: Promise.resolve(params) },
    );
    expect(reloaded.status).toBe(200);
    const fresh = await reloaded.json();
    expect(fresh.rows.map((row: { link: unknown }) => row.link)).toEqual(
      links.map((link) => expect.objectContaining(link)),
    );
    expect(await db().select().from(refereeReconciliations)).toHaveLength(2);
    expect(
      await db()
        .select()
        .from(resultAuditEvents)
        .where(eq(resultAuditEvents.action, "referee_reconcile")),
    ).toHaveLength(2);
  });
  it("serializes concurrent confirmation and requires current session revision", async () => {
    const input = await command();
    const results = await Promise.allSettled([
      reconcileRefereeAttempt(actor, "test-cup", fixtureId, input),
      reconcileRefereeAttempt(actor, "test-cup", fixtureId, {
        ...input,
        requestKey: randomUUID(),
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      reconcileRefereeAttempt(actor, "test-cup", fixtureId, {
        ...input,
        requestKey: randomUUID(),
        expectedRevision: 1,
        expectedSessionRevision: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("revocation rejects old idempotent receipts", async () => {
    const input = await command();
    await reconcileRefereeAttempt(actor, "test-cup", fixtureId, input);
    await db()
      .delete(fixtureReferees)
      .where(eq(fixtureReferees.userId, actor.osuId));
    await expect(
      reconcileRefereeAttempt(actor, "test-cup", fixtureId, input),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a fresh fingerprint while the saved ledger still uses stale dependencies", async () => {
    const [fixture] = await db()
      .select()
      .from(fixtures)
      .where(eq(fixtures.id, fixtureId));
    await db()
      .update(mappools)
      .set({ version: 99 })
      .where(eq(mappools.id, fixture.mappoolId!));
    expect(
      (await refereeReconciliation(actor, "test-cup", fixtureId)).canRecord,
    ).toBe(false);
    const freshInput = await command();
    expect(freshInput.dependencyFingerprint).not.toBe(
      w.session!.dependencyFingerprint,
    );
    await expect(
      reconcileRefereeAttempt(actor, "test-cup", fixtureId, freshInput),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db().select().from(refereeReconciliations)).toHaveLength(0);
  });
  it("records a transactional audit once, including unlink history", async () => {
    const input = await command();
    await reconcileRefereeAttempt(actor, "test-cup", fixtureId, input);
    await reconcileRefereeAttempt(actor, "test-cup", fixtureId, input);
    let audit = await db()
      .select()
      .from(resultAuditEvents)
      .where(eq(resultAuditEvents.action, "referee_reconcile"));
    expect(audit).toHaveLength(1);
    const unlink = {
      ...input,
      requestKey: randomUUID(),
      expectedRevision: 1,
      importId: null,
      sourceFingerprint: null,
      gameId: null,
    };
    await reconcileRefereeAttempt(actor, "test-cup", fixtureId, unlink);
    audit = await db()
      .select()
      .from(resultAuditEvents)
      .where(eq(resultAuditEvents.action, "referee_reconcile"));
    expect(audit).toHaveLength(2);
    expect(
      (await refereeReconciliation(actor, "test-cup", fixtureId)).rows[0]
        .status,
    ).toBe("unmatched");
    expect(await db().select().from(refereeReconciliations)).toHaveLength(2);
  });
  it("rejects malformed fixture IDs before issuing a UUID database query", async () => {
    const input = await command();
    await expect(
      reconcileRefereeAttempt(actor, "test-cup", "not-a-fixture-id", input),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("new source fingerprints invalidate old links without rewriting history", async () => {
    const input = await command();
    await reconcileRefereeAttempt(actor, "test-cup", fixtureId, input);
    const [old] = await db()
      .select()
      .from(matchImports)
      .where(eq(matchImports.id, input.importId));
    const fingerprint = "e".repeat(64);
    await db()
      .insert(matchImports)
      .values({
        fixtureId,
        externalMatchId: old.externalMatchId,
        fingerprint,
        source: { ...(old.source as object), fingerprint },
        createdBy: actor.osuId,
        createdAt: new Date(Date.now() + 1000),
      });
    expect(
      (await refereeReconciliation(actor, "test-cup", fixtureId)).rows[0]
        .status,
    ).toBe("stale");
    await expect(
      reconcileRefereeAttempt(actor, "test-cup", fixtureId, {
        ...input,
        requestKey: randomUUID(),
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db().select().from(refereeReconciliations)).toHaveLength(1);
  });
});
