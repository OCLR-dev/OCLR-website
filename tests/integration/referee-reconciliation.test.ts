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
import { refereeCommand } from "../../src/lib/referee";
import { type RefereeWorkspace } from "../../src/lib/referee-workspace";
import {
  refereeReconciliation,
  reconcileRefereeAttempt,
} from "../../src/lib/referee-reconciliation";
import { POST as route } from "../../src/app/api/admin/tournaments/[edition]/matches/[fixtureId]/referee/reconciliation/route";
import {
  reconcileRefereeAttemptWrite,
  refereeReconciliationReceipt,
} from "../../src/lib/referee-write-contracts";
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
