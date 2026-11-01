import { randomUUID } from "node:crypto";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  refereeMpBindings,
  refereeMpScores,
  mappools,
  refereeEvents,
  refereeSessions,
  fixtureReferees,
  matchResults,
  resultRevisions,
  resultAuditEvents,
  refereeReconciliations,
} from "../../src/db/schema";
import {
  refereeCommand,
  refereeWorkspace,
  type RefereeWorkspace,
} from "../../src/lib/referee";
import { refereeMpCommand } from "../../src/lib/referee-mp";
import { fetchMatchSource } from "../../src/lib/osu-matches";
import { mpSource, fingerprint } from "../fixtures/referee-mp";
import {
  seedRefereeFixture,
  refereeTestAdmin as admin,
  refereeTestUser as actor,
} from "../fixtures/referee";
import { assertTestDatabase } from "../database";
vi.mock("../../src/lib/osu-matches", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/osu-matches")>()),
  fetchMatchSource: vi.fn(),
}));
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("MP binding and atomic provisional scores", () => {
  let w: RefereeWorkspace;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.mocked(fetchMatchSource).mockReset();
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    w = (await seedRefereeFixture()).workspace;
    await action({
      action: "set_order",
      firstBanTeamId: w.teams[0].id,
      firstPickTeamId: w.teams[1].id,
    });
    await action({
      action: "record_selection",
      entryId: w.maps.find((m) => m.beatmapId === 10004)!.id,
    });
    await action({
      action: "record_selection",
      entryId: w.maps.find((m) => m.beatmapId === 10001)!.id,
    });
    vi.mocked(fetchMatchSource).mockResolvedValue(mpSource(w));
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function action(c: Record<string, unknown>) {
    w = (
      await refereeCommand(actor, "test-cup", w.fixture.id, {
        ...c,
        requestKey: randomUUID(),
        expectedRevision: w.session?.revision ?? 0,
        dependencyFingerprint: w.dependencyFingerprint,
      })
    ).workspace;
  }
  const call = (input: unknown, user = actor) =>
    refereeMpCommand(user, "test-cup", w.fixture.id, input);
  async function bind() {
    return call({
      action: "bind",
      match: "https://osu.ppy.sh/community/matches/880001",
      expectedRevision: 0,
      expectedSessionRevision: w.session?.revision ?? 0,
      dependencyFingerprint: w.dependencyFingerprint,
    });
  }
  async function sync() {
    await db()
      .update(refereeMpBindings)
      .set({ nextPollAt: new Date(0) });
    const status = await call({ action: "status" });
    return call({ action: "sync", expectedRevision: status.binding!.revision });
  }
  it("binds without provider work, automatically scores once across simultaneous polls and reload, without official publication", async () => {
    await bind();
    expect(fetchMatchSource).not.toHaveBeenCalled();
    const before = (await db().select().from(matchResults))[0];
    await Promise.all([sync(), sync()]);
    w = await refereeWorkspace(actor, "test-cup", w.fixture.id);
    expect(w.projection.score[w.teams[0].id]).toBe(1);
    expect(await db().select().from(refereeMpScores)).toHaveLength(1);
    await sync();
    expect(
      (await call({ action: "status" })).workspace.projection.score[
        w.teams[0].id
      ],
    ).toBe(1);
    expect((await db().select().from(matchResults))[0]).toEqual(before);
    expect(await db().select().from(resultRevisions)).toHaveLength(0);
    expect(
      await db()
        .select()
        .from(resultAuditEvents)
        .where(eq(resultAuditEvents.action, "referee_mp_source_imported")),
    ).toHaveLength(1);
    expect(await db().select().from(refereeReconciliations)).toHaveLength(0);
  });
  it("moves changed or replayed automatic results to human review and never automatically restores them", async () => {
    await bind();
    await sync();
    const changed = mpSource(w);
    changed.games.push({ ...changed.games[0], id: 880002 });
    vi.mocked(fetchMatchSource).mockResolvedValue(fingerprint(changed));
    const review = await sync();
    expect(review.workspace.projection.score[w.teams[0].id]).toBe(0);
    expect(review.binding!.issues[0].reason).toBe("replay");
    vi.mocked(fetchMatchSource).mockResolvedValue(mpSource(w));
    expect((await sync()).workspace.projection.score[w.teams[0].id]).toBe(0);
    w = review.workspace;
    await action({
      action: "resolve_attempt",
      pickId: w.projection.lastSelectionId,
      status: "completed",
      winnerTeamId: w.teams[1].id,
    });
    expect((await sync()).workspace.projection.score[w.teams[1].id]).toBe(1);
  });
  it("leaves ties and roster anomalies for review without adding ledger events", async () => {
    vi.mocked(fetchMatchSource).mockResolvedValue(mpSource(w, { tie: true }));
    await bind();
    const before = w.session!.revision;
    const result = await sync();
    expect(result.workspace.session!.revision).toBe(before);
    expect(result.binding!.issues.length).toBeGreaterThan(0);
  });
  it("fences late responses after unbinding and rejects unassigned or read-only callers", async () => {
    await bind();
    let resolve!: (s: ReturnType<typeof mpSource>) => void;
    vi.mocked(fetchMatchSource).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = sync();
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    await call({ action: "unbind", expectedRevision: 1 });
    resolve(mpSource(w));
    await pending;
    expect((await call({ action: "status" })).binding!.enabled).toBe(false);
    expect(await db().select().from(refereeMpScores)).toHaveLength(0);
    await db()
      .delete(fixtureReferees)
      .where(eq(fixtureReferees.fixtureId, w.fixture.id));
    await expect(call({ action: "status" })).rejects.toMatchObject({
      status: 403,
    });
    vi.stubEnv("OCLR_DATA_SOURCE", "remote");
    await expect(
      call({ action: "sync", expectedRevision: 2 }, admin),
    ).rejects.toMatchObject({ status: 403 });
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  it("can bind before BP begins, without creating a session or inventing selections", async () => {
    await db()
      .delete(refereeEvents)
      .where(eq(refereeEvents.fixtureId, w.fixture.id));
    await db()
      .delete(refereeSessions)
      .where(eq(refereeSessions.fixtureId, w.fixture.id));
    w = await refereeWorkspace(actor, "test-cup", w.fixture.id);
    expect(w.session).toBeNull();
    await bind();
    const result = await sync();
    expect(result.workspace.session).toBeNull();
    expect(result.workspace.projection.activeSelections).toHaveLength(0);
    expect(await db().select().from(refereeMpScores)).toHaveLength(0);
  });
  it("withdraws only automatic points when pool dependencies change", async () => {
    await bind();
    await sync();
    await db()
      .update(mappools)
      .set({ version: sql`${mappools.version} + 1` });
    const result = await sync();
    expect(result.binding!.error).toBe("dependencies");
    expect(result.workspace.projection.score[w.teams[0].id]).toBe(0);
    expect((await db().select().from(refereeMpScores))[0].review).toBe(true);
  });
  it("rechecks appointments after provider work, before writing any point", async () => {
    await bind();
    let resolve!: (s: ReturnType<typeof mpSource>) => void;
    vi.mocked(fetchMatchSource).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = sync();
    const rejected = expect(pending).rejects.toMatchObject({ status: 403 });
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    await db()
      .delete(fixtureReferees)
      .where(eq(fixtureReferees.fixtureId, w.fixture.id));
    resolve(mpSource(w));
    await rejected;
    expect(await db().select().from(refereeMpScores)).toHaveLength(0);
  });
  it("respects the cross-request cooldown and never calls the provider during status reads", async () => {
    await bind();
    await call({ action: "sync", expectedRevision: 1 });
    expect(fetchMatchSource).toHaveBeenCalledTimes(1);
    await Promise.all([
      call({ action: "sync", expectedRevision: 1 }),
      call({ action: "status" }),
    ]);
    expect(fetchMatchSource).toHaveBeenCalledTimes(1);
  });
  it("preserves human outcomes and provider failures, and rejects stale binding versions and malicious URLs", async () => {
    await expect(
      call({
        action: "bind",
        match: "https://evil.invalid/1",
        expectedRevision: 0,
        expectedSessionRevision: w.session?.revision ?? 0,
        dependencyFingerprint: w.dependencyFingerprint,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await bind();
    await expect(
      call({ action: "unbind", expectedRevision: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    await action({
      action: "resolve_attempt",
      pickId: w.projection.lastSelectionId,
      status: "completed",
      winnerTeamId: w.teams[1].id,
    });
    expect((await sync()).workspace.projection.score[w.teams[1].id]).toBe(1);
    vi.mocked(fetchMatchSource).mockRejectedValue(
      Error("provider unavailable"),
    );
    const result = await sync();
    expect(result.binding!.error).toBe("provider");
    expect(result.workspace.projection.score[w.teams[1].id]).toBe(1);
  });
});
