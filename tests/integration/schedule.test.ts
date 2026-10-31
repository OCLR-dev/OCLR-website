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
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  captains,
  editionState,
  fixtures,
  fixtureStreams,
  memberships,
  scheduleRequests,
  scheduleEvents,
  scheduleAvailability,
  teams,
  tournamentStages,
  tournamentRounds,
  users,
} from "../../src/db/schema";
import { scheduleCommand, scheduleWorkspace } from "../../src/lib/schedule";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { withReadChannel } from "../../src/lib/read-channel";
const url = process.env.TEST_DATABASE_URL;
const a = { osuId: 591001, username: "Captain A" },
  b = { osuId: 591002, username: "Captain B" },
  player = { osuId: 591003, username: "Player A" },
  other = { osuId: 591004, username: "Other" },
  admin = { osuId: 591005, username: "Admin" };
const slug = edition.slug;
const official = "2090-01-01T12:00:00.000Z",
  proposed = "2090-01-02T12:00:00.000Z";
describe.skipIf(!url)("private schedule negotiation #591", () => {
  let id: string, ta: string, tb: string;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    await seedEditions([edition]);
    await db().insert(users).values([a, b, player, other, admin]);
    await db()
      .insert(captains)
      .values([
        { editionSlug: slug, userId: a.osuId, position: 1, published: true },
        { editionSlug: slug, userId: b.osuId, position: 2, published: true },
      ]);
    const ts = await db()
      .insert(teams)
      .values(
        [a, b].map((u) => ({
          editionSlug: slug,
          captainId: u.osuId,
          name: u.username,
          identityPublished: true,
          rosterPublished: true,
          finalizedAt: new Date(),
        })),
      )
      .returning();
    [ta, tb] = ts.map((t) => t.id);
    await db()
      .insert(memberships)
      .values(
        [a, b, player].map((u, n) => ({
          editionSlug: slug,
          teamId: n === 1 ? tb : ta,
          userId: u.osuId,
          origin: "captain",
        })),
      );
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: slug, kind: "group" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: slug,
        stageId: stage.id,
        name: "Synthetic round",
        position: 1,
      })
      .returning();
    const [f] = await db()
      .insert(fixtures)
      .values({
        editionSlug: slug,
        roundId: round.id,
        label: "A vs B",
        homeTeamId: ta,
        awayTeamId: tb,
        timeZone: "Asia/Taipei",
        position: 1,
        scheduledAt: new Date(official),
        publishedAt: new Date(),
      })
      .returning();
    id = f.id;
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  const command = (action: string, extra = {}) => ({
    action,
    fixtureId: id,
    expectedFixtureVersion: 0,
    requestKey: randomUUID(),
    ...(action === "availability" ? {} : { confirmed: true }),
    ...extra,
  });
  async function propose() {
    await scheduleCommand(
      a,
      slug,
      command("propose", {
        requestId: null,
        expectedVersion: 0,
        proposedAt: proposed,
      }),
    );
    return (await scheduleWorkspace(a, slug)).requests[0];
  }
  async function pending() {
    const r = await propose();
    await scheduleCommand(
      b,
      slug,
      command("accept", { requestId: r.id, expectedVersion: 1 }),
    );
    return r;
  }
  it("only changes the official time after two captains and independent staff approval; retry is idempotent", async () => {
    await db()
      .insert(fixtureStreams)
      .values({
        fixtureId: id,
        userId: other.osuId,
        source: "staff",
        assignedBy: admin.osuId,
        confirmedScheduledAt: new Date(official),
        confirmedTimeZone: "Asia/Taipei",
      });
    const r = await pending();
    expect(
      (await db().select().from(fixtures))[0].scheduledAt?.toISOString(),
    ).toBe(official);
    const cmd = command("approve", { requestId: r.id, expectedVersion: 2 });
    await scheduleCommand(admin, slug, cmd);
    await scheduleCommand(admin, slug, cmd);
    expect((await db().select().from(fixtures))[0]).toMatchObject({
      scheduledAt: new Date(proposed),
      version: 1,
    });
    expect((await db().select().from(scheduleRequests))[0].status).toBe(
      "approved",
    );
    expect(
      (
        await db().select().from(fixtureStreams)
      )[0].confirmedScheduledAt?.toISOString(),
    ).toBe(official);
    const businessHistory = (await scheduleWorkspace(a, slug)).requests[0]
      .history;
    expect(
      businessHistory.find((e) => e.action === "approve")?.actor,
    ).toBeNull();
    expect(businessHistory[0]).not.toHaveProperty("detail");
    expect(
      (await db().select().from(scheduleEvents)).filter(
        (e) => e.action === "approve",
      ),
    ).toHaveLength(1);
  });
  it("protects personal slots and ignores overlapping duplicate intervals when counting people", async () => {
    const intervals = [{ start: official, end: "2090-01-01T14:00:00Z" }];
    await scheduleCommand(player, slug, {
      ...command("availability"),
      expectedVersion: 0,
      intervals,
    });
    expect(
      (await scheduleWorkspace(player, slug)).fixtures[0].ownAvailability
        .intervals,
    ).toEqual(intervals);
    const captain = (await scheduleWorkspace(a, slug)).fixtures[0];
    expect(captain.summary[0].count).toBe(1);
    expect(captain.unreported).toBe(1);
    expect(JSON.stringify(await scheduleWorkspace(b, slug))).not.toContain(
      "2090-01-01T14:00:00Z",
    );
    expect(JSON.stringify(await scheduleWorkspace(admin, slug))).not.toContain(
      "2090-01-01T14:00:00Z",
    );
    expect(
      (await db().select().from(fixtures))[0].scheduledAt?.toISOString(),
    ).toBe(official);
  });
  it("replaces and clears saved availability with revision checks and payload identity", async () => {
    const cmd = {
      action: "availability",
      fixtureId: id,
      expectedFixtureVersion: 0,
      requestKey: randomUUID(),
      expectedVersion: 0,
      intervals: [{ start: official, end: proposed }],
    };
    await scheduleCommand(player, slug, cmd);
    await scheduleCommand(player, slug, cmd);
    await expect(
      scheduleCommand(player, slug, { ...cmd, intervals: [] }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      scheduleCommand(player, slug, { ...cmd, requestKey: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    await scheduleCommand(player, slug, {
      ...cmd,
      requestKey: randomUUID(),
      expectedVersion: 1,
      intervals: [],
    });
    expect(
      (await db().select().from(scheduleAvailability))[0].intervals,
    ).toEqual([]);
  });
  it("requires a fresh confirmation after a counterproposal and blocks accepting one's own time", async () => {
    const r = await propose();
    await expect(
      scheduleCommand(
        a,
        slug,
        command("accept", { requestId: r.id, expectedVersion: 1 }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await scheduleCommand(
      b,
      slug,
      command("propose", {
        requestId: r.id,
        expectedVersion: 1,
        proposedAt: "2090-01-03T12:00:00Z",
      }),
    );
    await expect(
      scheduleCommand(
        b,
        slug,
        command("accept", { requestId: r.id, expectedVersion: 2 }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await scheduleCommand(
      a,
      slug,
      command("accept", { requestId: r.id, expectedVersion: 2 }),
    );
    expect((await db().select().from(scheduleRequests))[0]).toMatchObject({
      status: "pending",
      version: 3,
    });
  });
  it("serializes competing first proposals", async () => {
    const results = await Promise.allSettled(
      [a, b].map((u) =>
        scheduleCommand(
          u,
          slug,
          command("propose", {
            requestId: null,
            expectedVersion: 0,
            proposedAt: proposed,
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(scheduleRequests)).toHaveLength(1);
  });
  it("serializes withdrawal versus approval without partial writes", async () => {
    const r = await pending();
    const result = await Promise.allSettled([
      scheduleCommand(
        a,
        slug,
        command("withdraw", { requestId: r.id, expectedVersion: 2 }),
      ),
      scheduleCommand(
        admin,
        slug,
        command("approve", { requestId: r.id, expectedVersion: 2 }),
      ),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [saved] = await db().select().from(scheduleRequests);
    expect(
      (await db().select().from(fixtures))[0].scheduledAt?.toISOString(),
    ).toBe(saved.status === "approved" ? proposed : official);
  });
  it("rejects outsiders, players negotiating, forged actor and read-only channels", async () => {
    await expect(scheduleWorkspace(other, slug)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      scheduleCommand(
        player,
        slug,
        command("propose", {
          requestId: null,
          expectedVersion: 0,
          proposedAt: proposed,
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      scheduleCommand(a, slug, {
        ...command("propose", {
          requestId: null,
          expectedVersion: 0,
          proposedAt: proposed,
        }),
        actorId: b.osuId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      withReadChannel(() => scheduleWorkspace(a, slug)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      withReadChannel(() => scheduleCommand(a, slug, {})),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      scheduleCommand(
        a,
        "other-cup",
        command("propose", {
          requestId: null,
          expectedVersion: 0,
          proposedAt: proposed,
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("rejects self review even when captain is also Admin", async () => {
    const r = await pending();
    vi.stubEnv("ADMIN_OSU_IDS", `${admin.osuId},${a.osuId}`);
    try {
      await expect(
        scheduleCommand(
          a,
          slug,
          command("approve", { requestId: r.id, expectedVersion: 2 }),
        ),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    }
  });
  it("staff rejection requires a decision note and retains the original time", async () => {
    const r = await pending();
    await expect(
      scheduleCommand(
        admin,
        slug,
        command("reject", { requestId: r.id, expectedVersion: 2 }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await scheduleCommand(
      admin,
      slug,
      command("reject", {
        requestId: r.id,
        expectedVersion: 2,
        decisionNote: "No referee coverage",
      }),
    );
    expect((await scheduleWorkspace(a, slug)).requests[0].decisionNote).toBe(
      "No referee coverage",
    );
    expect(
      (await db().select().from(fixtures))[0].scheduledAt?.toISOString(),
    ).toBe(official);
  });
  it.each(["time", "cancel", "unpublish", "lock", "captain"])(
    "permanently invalidates a proposal after %s changes through existing data paths",
    async (change) => {
      const r = await pending();
      if (change === "time") {
        await db()
          .update(fixtures)
          .set({ scheduledAt: new Date("2090-01-05T12:00:00Z") })
          .where(eq(fixtures.id, id));
        await db()
          .update(fixtures)
          .set({ scheduledAt: new Date(official) })
          .where(eq(fixtures.id, id));
      }
      if (change === "cancel")
        await db()
          .update(fixtures)
          .set({ status: "cancelled" })
          .where(eq(fixtures.id, id));
      if (change === "unpublish")
        await db()
          .update(fixtures)
          .set({ publishedAt: null })
          .where(eq(fixtures.id, id));
      if (change === "lock")
        await db()
          .update(editionState)
          .set({ lockedAt: new Date() })
          .where(eq(editionState.slug, slug));
      if (change === "captain")
        await db()
          .delete(captains)
          .where(
            and(eq(captains.editionSlug, slug), eq(captains.userId, a.osuId)),
          );
      expect((await db().select().from(scheduleRequests))[0].status).toBe(
        "expired",
      );
      expect(
        (await db().select().from(scheduleEvents)).filter(
          (e) => e.action === "expired",
        ),
      ).toHaveLength(1);
      await expect(
        scheduleCommand(
          admin,
          slug,
          command("approve", { requestId: r.id, expectedVersion: 2 }),
        ),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it("retains request and audit history after fixture deletion", async () => {
    await propose();
    await db().delete(fixtures).where(eq(fixtures.id, id));
    const [r] = await db().select().from(scheduleRequests);
    expect(r).toMatchObject({
      status: "expired",
      fixtureId: null,
      fixtureSnapshotId: id,
    });
    expect(
      (await scheduleWorkspace(admin, slug)).requests[0].history,
    ).toHaveLength(2);
  });
  it("allows saved referee settings but invalidates once operational refereeing begins", async () => {
    await db().execute(
      sql`INSERT INTO referee_sessions (fixture_id,edition_slug,settings,dependency_fingerprint,basis) VALUES (${id},${slug},'{}',repeat('0',64),'{}')`,
    );
    await db().execute(
      sql`INSERT INTO referee_events (fixture_id,ordinal,actor_id,request_key,request_hash,payload) VALUES (${id},1,${admin.osuId},${randomUUID()},repeat('0',64),'${sql.raw('{"type":"settings_saved"}')}')`,
    );
    const r = await pending();
    await db().execute(
      sql`INSERT INTO referee_events (fixture_id,ordinal,actor_id,request_key,request_hash,payload) VALUES (${id},2,${admin.osuId},${randomUUID()},repeat('0',64),'${sql.raw('{"type":"order_set"}')}')`,
    );
    expect((await db().select().from(scheduleRequests))[0].status).toBe(
      "expired",
    );
    await expect(
      scheduleCommand(
        admin,
        slug,
        command("approve", { requestId: r.id, expectedVersion: 2 }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects stale, excessive and inverted interval payloads", async () => {
    for (const intervals of [
      [{ start: proposed, end: official }],
      Array.from({ length: 41 }, () => ({ start: official, end: proposed })),
    ])
      await expect(
        scheduleCommand(player, slug, {
          action: "availability",
          fixtureId: id,
          expectedFixtureVersion: 0,
          requestKey: randomUUID(),
          expectedVersion: 0,
          intervals,
        }),
      ).rejects.toMatchObject({ status: 400 });
  });
  it("removes access on membership revocation and excludes a previous membership's availability", async () => {
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.userId, player.osuId));
    await expect(scheduleWorkspace(player, slug)).rejects.toMatchObject({
      status: 403,
    });
  });
});
