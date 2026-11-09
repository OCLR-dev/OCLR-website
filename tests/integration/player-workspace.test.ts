import { createHash, randomUUID } from "node:crypto";
import { legacyPracticeContextValue } from "../../src/lib/player-workspace-model";
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
  memberships,
  teams,
  users,
  registrations,
  mappools,
  mappoolEntries,
  mappoolEvents,
  playerPracticeRecords,
  playerSeasonAvailability,
  playerWorkspaceEvents,
  fixtures,
  matchResults,
  staffRoles,
  tournamentStages,
  tournamentRounds,
} from "../../src/db/schema";
import {
  playerPracticeWorkspace,
  playerTimetableWorkspace,
  playerPracticeCommand,
  playerTimetableCommand,
} from "../../src/lib/player-workspace";
import {
  availabilityWrite,
  practiceWrite,
} from "../../src/lib/player-workspace-contracts";
import { POST as savePractice } from "../../src/app/api/tournaments/[edition]/player/practice/route";
import { POST as saveAvailability } from "../../src/app/api/tournaments/[edition]/player/availability/route";
import { publicMappools } from "../../src/lib/mappool-reads";
import { withReadChannel } from "../../src/lib/read-channel";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";

const url = process.env.TEST_DATABASE_URL;
const a = { osuId: 671001, username: "Synthetic Captain A" },
  b = { osuId: 671002, username: "Synthetic Captain B" },
  p = { osuId: 671003, username: "Synthetic Player" },
  q = { osuId: 671004, username: "Synthetic Teammate" },
  unassigned = { osuId: 671005, username: "Synthetic Unassigned" },
  admin = { osuId: 671006, username: "Synthetic Admin" };
const slug = edition.slug;
const origin = "https://oclr.example.test";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => p,
}));
function post(route: string, input: unknown) {
  return new Request(`${origin}${route.replace("{edition}", slug)}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
const routeContext = { params: Promise.resolve({ edition: slug }) };
const metadata = {
  setId: 1,
  artist: "Synthetic Artist",
  title: "Synthetic Song",
  difficulty: "Test",
  mapper: "Synthetic Mapper",
  stars: 4.5,
  bpm: 180,
  duration: 120,
  checksum: "a".repeat(32),
};
const intervals = [
  { start: "2090-01-01T18:00:00+08:00", end: "2090-01-01T20:00:00+08:00" },
];
describe.skipIf(!url)("private player workspace #671", () => {
  let ta: string, tb: string, pool: string, hidden: string, entry: string;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([
      edition,
      { ...edition, slug: "other-test-cup" },
      { ...edition, slug: "private-test-cup", published: false },
    ]);
    await db().insert(users).values([a, b, p, q, unassigned, admin]);
    await db()
      .insert(registrations)
      .values(
        [p, q, unassigned].map((user) => ({
          editionSlug: slug,
          userId: user.osuId,
          status: "accepted" as const,
          answers: {},
        })),
      );
    await db()
      .insert(captains)
      .values(
        [a, b].map((user, index) => ({
          editionSlug: slug,
          userId: user.osuId,
          position: index + 1,
        })),
      );
    const ts = await db()
      .insert(teams)
      .values(
        [a, b].map((user) => ({
          editionSlug: slug,
          captainId: user.osuId,
          name: user.username,
        })),
      )
      .returning();
    [ta, tb] = ts.map((team) => team.id);
    await db()
      .insert(memberships)
      .values(
        [a, b, p, q].map((user) => ({
          editionSlug: slug,
          teamId: user === b ? tb : ta,
          userId: user.osuId,
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
    const ps = await db()
      .insert(mappools)
      .values([
        {
          editionSlug: slug,
          roundId: round.id,
          name: "Published",
          publishedAt: new Date("2089-01-01"),
        },
        { editionSlug: slug, roundId: round.id, name: "Hidden" },
      ])
      .returning();
    [pool, hidden] = ps.map((value) => value.id);
    const [e] = await db()
      .insert(mappoolEntries)
      .values({
        poolId: pool,
        category: "NM",
        position: 1,
        beatmapId: 123,
        metadata,
      })
      .returning();
    entry = e.id;
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function practice(actor = p, extra = {}) {
    const workspace = await playerPracticeWorkspace(actor, slug, pool);
    return {
      action: "save_practice",
      entryId: entry,
      expectedContext: workspace.pool!.entries[0].context,
      expectedVersion: 0,
      requestKey: randomUUID(),
      score: 900000,
      comment: "Team note",
      ...extra,
    };
  }
  async function removePractice(actor = p, extra = {}) {
    const e = (await playerPracticeWorkspace(actor, slug, pool)).pool!
      .entries[0];
    return {
      action: "delete_practice",
      entryId: e.id,
      expectedContext: e.context,
      expectedVersion: e.ownVersion,
      requestKey: randomUUID(),
      ...extra,
    };
  }
  const timetable = (extra = {}) => ({
    action: "save_availability",
    intervals,
    expectedVersion: 0,
    requestKey: randomUUID(),
    ...extra,
  });
  it("loads only published pools and allows accepted players and actual captains", async () => {
    expect(
      (await playerPracticeWorkspace(p, slug)).pools.map((value) => value.id),
    ).toEqual([pool]);
    expect((await playerPracticeWorkspace(a, slug)).actorId).toBe(a.osuId);
    await expect(
      playerPracticeWorkspace(p, slug, hidden),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      playerPracticeWorkspace(p, "other-test-cup"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      playerPracticeWorkspace(p, "private-test-cup"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(playerPracticeWorkspace(admin, slug)).rejects.toMatchObject({
      status: 403,
    });
    await db()
      .update(registrations)
      .set({ status: "pending" })
      .where(eq(registrations.userId, p.osuId));
    await expect(playerPracticeWorkspace(p, slug)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("keeps legacy NM/HD scores current across FM-only edits, but expires FM and replaced charts", async () => {
    const oldPolicy = {
      fmMode: "free_mod" as const,
      fmRestrictions: "HD allowed",
    };
    const newPolicy = { ...oldPolicy, fmRestrictions: "HD or HR allowed" };
    await db().update(mappools).set(oldPolicy).where(eq(mappools.id, pool));
    await db()
      .insert(mappoolEntries)
      .values(
        ["HD", "FM"].map((category) => ({
          poolId: pool,
          category: category as "HD" | "FM",
          position: 1,
          beatmapId: 123,
          metadata,
        })),
      );
    const entries = await db()
      .select()
      .from(mappoolEntries)
      .where(eq(mappoolEntries.poolId, pool));
    const saved = entries.map((map) => ({
      editionSlug: slug,
      userId: p.osuId,
      entryId: map.id,
      beatmapId: map.beatmapId,
      contextKey: createHash("sha256")
        .update(
          JSON.stringify(legacyPracticeContextValue({ ...map, ...oldPolicy })),
        )
        .digest("hex"),
      score: 900000,
    }));
    await db().insert(playerPracticeRecords).values(saved);
    const before = (await playerPracticeWorkspace(p, slug, pool)).pool!;
    expect(before.entries.every((map) => !map.records[0].stale)).toBe(true);
    await db()
      .insert(mappoolEvents)
      .values({
        editionSlug: slug,
        poolId: pool,
        actorId: admin.osuId,
        action: "pool_settings",
        before: { pool: oldPolicy },
        after: { pool: newPolicy },
      });
    await db().update(mappools).set(newPolicy).where(eq(mappools.id, pool));
    const after = (await playerPracticeWorkspace(q, slug, pool)).pool!;
    for (const map of after.entries) {
      expect(map.records[0].stale).toBe(map.category === "FM");
      expect(
        map.context ===
          before.entries.find((old) => old.id === map.id)!.context,
      ).toBe(map.category !== "FM");
    }
    await db()
      .update(mappoolEntries)
      .set({ beatmapId: 456 })
      .where(eq(mappoolEntries.poolId, pool));
    expect(
      (await playerPracticeWorkspace(p, slug, pool)).pool!.entries.every(
        (map) => map.records[0].stale,
      ),
    ).toBe(true);
    expect(
      (await db().select().from(playerPracticeRecords))
        .map((record) => record.contextKey)
        .sort(),
    ).toEqual(saved.map((record) => record.contextKey).sort());
  });
  it("shares practice with the whole current team while keeping other teams and public pools private", async () => {
    const cmd = await practice();
    await playerPracticeCommand(p, slug, cmd);
    for (const actor of [a, p, q])
      expect(
        (await playerPracticeWorkspace(actor, slug, pool)).pool!.entries[0]
          .records,
      ).toEqual([
        expect.objectContaining({
          userId: p.osuId,
          score: 900000,
          comment: "Team note",
        }),
      ]);
    for (const actor of [b, unassigned])
      expect(
        (await playerPracticeWorkspace(actor, slug, pool)).pool!.entries[0]
          .records,
      ).toEqual([]);
    const publicPool = (await publicMappools(slug))[0];
    expect(JSON.stringify(publicPool)).not.toContain("Team note");
    expect(await db().select().from(fixtures)).toEqual([]);
    expect(await db().select().from(matchResults)).toEqual([]);
  });
  it("rechecks current membership and registration for every team read", async () => {
    await playerPracticeCommand(p, slug, await practice());
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(
        and(eq(memberships.userId, p.osuId), eq(memberships.editionSlug, slug)),
      );
    expect(
      (await playerPracticeWorkspace(q, slug)).pool!.entries[0].records,
    ).toEqual([]);
    expect(
      (await playerPracticeWorkspace(p, slug)).pool!.entries[0].records,
    ).toHaveLength(1);
    await db().insert(memberships).values({
      editionSlug: slug,
      teamId: tb,
      userId: p.osuId,
      origin: "captain",
    });
    expect(
      (await playerPracticeWorkspace(b, slug)).pool!.entries[0].records,
    ).toHaveLength(1);
    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(eq(registrations.userId, p.osuId));
    expect(
      (await playerPracticeWorkspace(b, slug)).pool!.entries[0].records,
    ).toEqual([]);
  });
  it("allows only the owner to write, including when the captain knows the entry ID", async () => {
    await expect(
      playerPracticeCommand(a, slug, {
        ...(await practice(a)),
        userId: p.osuId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await playerPracticeCommand(a, slug, await practice(a));
    expect((await db().select().from(playerPracticeRecords))[0].userId).toBe(
      a.osuId,
    );
  });
  it("saves a single transactional receipt on retry and rejects key reuse and stale versions", async () => {
    const cmd = await practice(p, { comment: `Team note${" ".repeat(2000)}` });
    const submit = (input: unknown) =>
      savePractice(post(practiceWrite.path, input), routeContext);
    for (const input of [cmd, cmd]) {
      const response = await submit(input);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ saved: true, version: 1 });
      expect(practiceWrite.response.parse(body)).toEqual(body);
    }
    for (const input of [
      { ...cmd, comment: "Changed" },
      { ...cmd, requestKey: randomUUID() },
    ]) {
      const response = await submit(input);
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(practiceWrite.error.parse(body)).toEqual(body);
    }
    const events = await db().select().from(playerWorkspaceEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      before: null,
      after: { version: 1, comment: "Team note" },
    });
    await playerPracticeCommand(p, slug, {
      ...cmd,
      requestKey: randomUUID(),
      expectedVersion: 1,
      score: null,
      comment: "",
    });
    expect((await db().select().from(playerPracticeRecords))[0]).toMatchObject({
      version: 2,
      score: null,
      rating: null,
      comment: "",
    });
    const response = await submit(await removePractice());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ saved: true, version: 3 });
    expect(practiceWrite.response.parse(body)).toEqual(body);
  });
  it("omits retired ratings from reads, rejects old fields and keeps legacy audit evidence", async () => {
    await playerPracticeCommand(p, slug, await practice());
    await db()
      .update(playerPracticeRecords)
      .set({ rating: 4 })
      .where(eq(playerPracticeRecords.userId, p.osuId));
    const record = (await playerPracticeWorkspace(p, slug)).pool!.entries[0]
      .records[0];
    expect(record).toMatchObject({
      score: 900000,
      comment: "Team note",
      version: 1,
    });
    expect(record).not.toHaveProperty("rating");
    await expect(
      playerPracticeCommand(
        p,
        slug,
        await practice(p, { expectedVersion: 1, rating: 5 }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect((await db().select().from(playerPracticeRecords))[0].rating).toBe(4);
    await playerPracticeCommand(
      p,
      slug,
      await practice(p, { expectedVersion: 1, comment: "Score/comment only" }),
    );
    expect((await db().select().from(playerPracticeRecords))[0]).toMatchObject({
      version: 2,
      score: 900000,
      rating: null,
      comment: "Score/comment only",
    });
    const events = await db()
      .select()
      .from(playerWorkspaceEvents)
      .where(eq(playerWorkspaceEvents.actorId, p.osuId));
    expect(events).toHaveLength(2);
    expect(
      events.find((event) => event.after.version === 2)?.before,
    ).toMatchObject({ rating: 4, comment: "Team note" });
  });
  it("saves, shares and clears feel with private audit and compatible retries", async () => {
    const original = await practice(p, { feel: "good" });
    await playerPracticeCommand(p, slug, original);
    expect(await playerPracticeCommand(p, slug, original)).toEqual({
      saved: true,
      version: 1,
    });
    await expect(
      playerPracticeCommand(p, slug, { ...original, feel: "bad" }),
    ).rejects.toMatchObject({ status: 409 });
    const teamRead = (await playerPracticeWorkspace(q, slug)).pool!.entries[0];
    expect(teamRead.records[0]).toMatchObject({ feel: "good", score: 900000 });
    expect(
      (await playerPracticeWorkspace(b, slug)).pool!.entries[0].records,
    ).toEqual([]);
    const legacy = await practice(p, {
      expectedVersion: 1,
      comment: "Old page",
    });
    await playerPracticeCommand(p, slug, legacy);
    expect(await playerPracticeCommand(p, slug, legacy)).toEqual({
      saved: true,
      version: 2,
    });
    expect((await db().select().from(playerPracticeRecords))[0].feel).toBe(
      "good",
    );
    await playerPracticeCommand(
      p,
      slug,
      await practice(p, { expectedVersion: 2, feel: null }),
    );
    const cleared = (await db().select().from(playerPracticeRecords))[0];
    expect(cleared).toMatchObject({ feel: null, version: 3 });
    const events = await db().select().from(playerWorkspaceEvents);
    expect(events.find((event) => event.after.version === 3)).toMatchObject({
      before: { feel: "good" },
      after: { feel: null },
    });
    await playerPracticeCommand(
      p,
      slug,
      await practice(p, { expectedVersion: 3, feel: "bad" }),
    );
    await playerPracticeCommand(p, slug, await removePractice());
    expect((await db().select().from(playerPracticeRecords))[0]).toMatchObject({
      feel: null,
      version: 5,
    });
    expect(
      (await playerPracticeWorkspace(q, slug)).pool!.entries[0].records,
    ).toEqual([]);
  });
  it("rejects unknown feel values in the command and database", async () => {
    await expect(
      playerPracticeCommand(p, slug, await practice(p, { feel: "excellent" })),
    ).rejects.toMatchObject({ status: 400 });
    await playerPracticeCommand(p, slug, await practice());
    await expect(
      db().execute(sql`UPDATE player_practice_records SET feel = 'excellent'`),
    ).rejects.toThrow();
    expect(
      (await db().select().from(playerPracticeRecords))[0].feel,
    ).toBeNull();
  });
  it("serializes competing creates instead of duplicating records", async () => {
    const cmd = await practice();
    const results = await Promise.allSettled([
      playerPracticeCommand(p, slug, cmd),
      playerPracticeCommand(p, slug, {
        ...cmd,
        requestKey: randomUUID(),
        score: 1,
      }),
    ]);
    expect(
      results.filter((value) => value.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await db().select().from(playerPracticeRecords)).toHaveLength(1);
    expect(await db().select().from(playerWorkspaceEvents)).toHaveLength(1);
  });
  it("deletes only the owner's visible record, records one receipt and retains the version", async () => {
    await playerPracticeCommand(p, slug, await practice());
    await playerPracticeCommand(
      q,
      slug,
      await practice(q, { comment: "Teammate note" }),
    );
    const command = await removePractice();
    expect(await playerPracticeCommand(p, slug, command)).toEqual({
      saved: true,
      version: 2,
    });
    expect(await playerPracticeCommand(p, slug, command)).toEqual({
      saved: true,
      version: 2,
    });
    const own = (await playerPracticeWorkspace(p, slug)).pool!.entries[0];
    expect(own.ownVersion).toBe(2);
    expect(own.records.map((record) => record.userId)).toEqual([q.osuId]);
    expect(own.records[0]).not.toHaveProperty("accuracy");
    const teammate = (await playerPracticeWorkspace(q, slug)).pool!.entries[0];
    expect(teammate.records.map((record) => record.userId)).toEqual([q.osuId]);
    expect(teammate.ownVersion).toBe(1);
    const [deleted] = await db()
      .select()
      .from(playerPracticeRecords)
      .where(eq(playerPracticeRecords.userId, p.osuId));
    expect(deleted).toMatchObject({
      version: 2,
      score: null,
      rating: null,
      accuracy: null,
      comment: "",
    });
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    const events = await db()
      .select()
      .from(playerWorkspaceEvents)
      .where(eq(playerWorkspaceEvents.actorId, p.osuId));
    expect(events).toHaveLength(2);
    expect(
      events.find((event) => event.requestKey === command.requestKey),
    ).toMatchObject({
      before: { comment: "Team note", version: 1 },
      after: { version: 2, comment: "" },
    });
  });
  it("does not let old pages overwrite or delete a record after deletion and recreation", async () => {
    const original = await practice();
    await playerPracticeCommand(p, slug, original);
    const remove = await removePractice();
    await playerPracticeCommand(p, slug, remove);
    await expect(
      playerPracticeCommand(p, slug, await practice()),
    ).rejects.toMatchObject({ status: 409 });
    await playerPracticeCommand(
      p,
      slug,
      await practice(p, { expectedVersion: 2, comment: "Recreated" }),
    );
    await expect(
      playerPracticeCommand(p, slug, {
        ...original,
        expectedVersion: 1,
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      playerPracticeCommand(p, slug, { ...remove, requestKey: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await playerPracticeCommand(p, slug, remove)).toEqual({
      saved: true,
      version: 2,
    });
    const current = (await playerPracticeWorkspace(p, slug)).pool!.entries[0];
    expect(current.ownVersion).toBe(3);
    expect(current.records[0]).toMatchObject({
      comment: "Recreated",
      version: 3,
    });
  });
  it("rejects deleting another player's record, missing records and mismatched request keys", async () => {
    await playerPracticeCommand(p, slug, await practice());
    const remove = await removePractice();
    await expect(
      playerPracticeCommand(a, slug, { ...remove, userId: p.osuId }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      playerPracticeCommand(a, slug, await removePractice(a)),
    ).rejects.toMatchObject({ status: 404 });
    await playerPracticeCommand(p, slug, remove);
    await expect(
      playerPracticeCommand(p, slug, { ...remove, expectedVersion: 2 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      playerPracticeCommand(p, slug, await removePractice()),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("serializes concurrent deletes and rechecks eligibility on retries", async () => {
    await playerPracticeCommand(p, slug, await practice());
    const remove = await removePractice();
    const results = await Promise.allSettled([
      playerPracticeCommand(p, slug, remove),
      playerPracticeCommand(p, slug, { ...remove, requestKey: randomUUID() }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await db().select().from(playerWorkspaceEvents)).toHaveLength(2);
    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(eq(registrations.userId, p.osuId));
    await expect(playerPracticeCommand(p, slug, remove)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("marks changed map/mod contexts and requires the current context to replace a record", async () => {
    const cmd = await practice();
    await playerPracticeCommand(p, slug, cmd);
    await db()
      .update(mappoolEntries)
      .set({ beatmapId: 456 })
      .where(eq(mappoolEntries.id, entry));
    const changed = (await playerPracticeWorkspace(p, slug)).pool!.entries[0];
    expect(changed.records[0].stale).toBe(true);
    await expect(
      playerPracticeCommand(p, slug, {
        ...cmd,
        expectedVersion: 1,
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await playerPracticeCommand(p, slug, {
      ...cmd,
      expectedVersion: 1,
      expectedContext: changed.context,
      requestKey: randomUUID(),
    });
    expect((await db().select().from(playerPracticeRecords))[0].beatmapId).toBe(
      456,
    );
    await db()
      .update(mappools)
      .set({ fmMode: "force_mod", fmRestrictions: "HD required" })
      .where(eq(mappools.id, pool));
    expect(
      (await playerPracticeWorkspace(p, slug)).pool!.entries[0].records[0]
        .stale,
    ).toBe(false);
  });
  it("rechecks publication and appointment even when retrying a saved request", async () => {
    const cmd = await practice(a);
    await playerPracticeCommand(a, slug, cmd);
    await db()
      .update(mappools)
      .set({ publishedAt: null })
      .where(eq(mappools.id, pool));
    await expect(playerPracticeCommand(a, slug, cmd)).rejects.toMatchObject({
      status: 404,
    });
    await db().delete(captains).where(eq(captains.userId, a.osuId));
    await expect(playerPracticeWorkspace(a, slug)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("saves season-wide availability without a team or fixture and normalizes UTC", async () => {
    expect((await playerTimetableWorkspace(unassigned, slug)).canEdit).toBe(
      true,
    );
    const cmd = timetable();
    await playerTimetableCommand(unassigned, slug, cmd);
    await playerTimetableCommand(unassigned, slug, cmd);
    expect(
      (await playerTimetableWorkspace(unassigned, slug)).intervals,
    ).toEqual([
      { start: "2090-01-01T10:00:00.000Z", end: "2090-01-01T12:00:00.000Z" },
    ]);
    expect(await db().select().from(playerWorkspaceEvents)).toHaveLength(1);
    expect(await db().select().from(fixtures)).toEqual([]);
  });
  it("lets the current captain view team timetables without editing them", async () => {
    await playerTimetableCommand(p, slug, timetable());
    expect(await playerTimetableWorkspace(a, slug, p.osuId)).toMatchObject({
      canEdit: false,
      version: 1,
      owner: p,
    });
    await expect(
      playerTimetableWorkspace(q, slug, p.osuId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      playerTimetableWorkspace(b, slug, p.osuId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      playerTimetableWorkspace(admin, slug, p.osuId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      playerTimetableCommand(a, slug, timetable({ userId: p.osuId })),
    ).rejects.toMatchObject({ status: 400 });
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.userId, p.osuId));
    await expect(
      playerTimetableWorkspace(a, slug, p.osuId),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("returns every current teammate's availability together only for the actual captain", async () => {
    await playerTimetableCommand(p, slug, timetable());
    await playerTimetableCommand(
      b,
      slug,
      timetable({
        intervals: [
          { start: "2090-02-01T10:00:00Z", end: "2090-02-01T11:00:00Z" },
        ],
      }),
    );
    const view = await playerTimetableWorkspace(a, slug);
    expect(view).toMatchObject({
      owner: a,
      canEdit: true,
      version: 0,
      intervals: [],
    });
    expect(view.teamAvailability.map((person) => person.userId).sort()).toEqual(
      [a.osuId, p.osuId, q.osuId].sort(),
    );
    expect(
      view.teamAvailability.find((person) => person.userId === p.osuId)
        ?.intervals,
    ).toEqual([
      { start: "2090-01-01T10:00:00.000Z", end: "2090-01-01T12:00:00.000Z" },
    ]);
    expect(
      view.teamAvailability.find((person) => person.userId === q.osuId)
        ?.intervals,
    ).toEqual([]);
    expect(
      view.teamAvailability.some((person) => person.userId === b.osuId),
    ).toBe(false);
    expect((await playerTimetableWorkspace(p, slug)).teamAvailability).toEqual(
      [],
    );
    expect(
      (await playerTimetableWorkspace(unassigned, slug)).teamAvailability,
    ).toEqual([]);
    await db().insert(registrations).values({
      editionSlug: slug,
      userId: admin.osuId,
      status: "accepted",
      answers: {},
    });
    await db().insert(memberships).values({
      editionSlug: slug,
      teamId: ta,
      userId: admin.osuId,
      origin: "captain",
    });
    expect(
      (await playerTimetableWorkspace(admin, slug)).teamAvailability,
    ).toEqual([]);
  });
  it("refreshes aggregate visibility after transfers, withdrawals and captain revocation", async () => {
    await playerTimetableCommand(p, slug, timetable());
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.userId, p.osuId));
    await db().insert(memberships).values({
      editionSlug: slug,
      teamId: tb,
      userId: p.osuId,
      origin: "captain",
    });
    expect(
      (await playerTimetableWorkspace(a, slug)).teamAvailability.some(
        (person) => person.userId === p.osuId,
      ),
    ).toBe(false);
    expect(
      (await playerTimetableWorkspace(b, slug)).teamAvailability.find(
        (person) => person.userId === p.osuId,
      )?.intervals,
    ).toHaveLength(1);
    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(eq(registrations.userId, p.osuId));
    expect(
      (await playerTimetableWorkspace(b, slug)).teamAvailability.some(
        (person) => person.userId === p.osuId,
      ),
    ).toBe(false);
    await db().insert(registrations).values({
      editionSlug: slug,
      userId: a.osuId,
      status: "accepted",
      answers: {},
    });
    await db().delete(captains).where(eq(captains.userId, a.osuId));
    expect((await playerTimetableWorkspace(a, slug)).teamAvailability).toEqual(
      [],
    );
    await expect(
      playerTimetableWorkspace(a, slug, q.osuId),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("persists explicit season states with the existing audit, retry and captain scope", async () => {
    const cmd = timetable({
      intervals: [
        {
          start: "2090-01-01T10:00:00Z",
          end: "2090-01-01T11:00:00Z",
          status: "unsure",
        },
        {
          start: "2090-01-01T11:00:00Z",
          end: "2090-01-01T12:00:00Z",
          status: "unavailable",
        },
      ],
    });
    expect(await playerTimetableCommand(p, slug, cmd)).toEqual({
      saved: true,
      version: 1,
    });
    expect(await playerTimetableCommand(p, slug, cmd)).toEqual({
      saved: true,
      version: 1,
    });
    const own = await playerTimetableWorkspace(p, slug);
    expect(own.intervals.map((slot) => slot.status)).toEqual([
      "unsure",
      "unavailable",
    ]);
    const team = await playerTimetableWorkspace(a, slug);
    expect(
      team.teamAvailability.find((person) => person.userId === p.osuId)
        ?.intervals,
    ).toEqual(own.intervals);
    await expect(
      playerTimetableWorkspace(b, slug, p.osuId),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db().select().from(playerWorkspaceEvents)).toHaveLength(1);
  });
  it("rejects stale timetable writes and permits clearing all slots with a versioned audit", async () => {
    const cmd = timetable();
    const submit = (input: unknown) =>
      saveAvailability(post(availabilityWrite.path, input), routeContext);
    const expectSaved = async (input: unknown, version: number) => {
      const response = await submit(input);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ saved: true, version });
      expect(availabilityWrite.response.parse(body)).toEqual(body);
    };
    await expectSaved(cmd, 1);
    for (const input of [timetable(), { ...cmd, intervals: [] }]) {
      const response = await submit(input);
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(availabilityWrite.error.parse(body)).toEqual(body);
    }
    await expectSaved(timetable({ expectedVersion: 1, intervals: [] }), 2);
    expect(
      (await db().select().from(playerSeasonAvailability))[0],
    ).toMatchObject({ version: 2, intervals: [] });
    expect(await db().select().from(playerWorkspaceEvents)).toHaveLength(2);
  });
  it("enforces the schema and leaves no partial data on invalid commands", async () => {
    await expect(
      playerPracticeCommand(p, slug, await practice(p, { score: -1 })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      playerTimetableCommand(
        p,
        slug,
        timetable({
          intervals: [
            { start: "2090-01-01T12:00:00Z", end: "2090-01-01T11:00:00Z" },
          ],
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(playerWorkspaceEvents)).toEqual([]);
    expect(await db().select().from(playerPracticeRecords)).toEqual([]);
  });
  it("blocks delegated reads and writes before touching the database", async () => {
    await expect(
      withReadChannel(() => playerPracticeWorkspace(p, slug)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      withReadChannel(() => playerTimetableWorkspace(a, slug)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      withReadChannel(() => playerPracticeCommand(p, slug, {})),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      withReadChannel(() => playerTimetableCommand(p, slug, {})),
    ).rejects.toMatchObject({ status: 403 });
    vi.stubEnv("OCLR_DATA_SOURCE", "remote");
    try {
      await expect(playerPracticeWorkspace(p, slug)).rejects.toMatchObject({
        status: 403,
      });
      await expect(playerTimetableCommand(p, slug, {})).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      vi.unstubAllEnvs();
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    }
  });
  it("allows Developer personal practice and availability while keeping locked/completed editions read-only", async () => {
    const cmd = await practice();
    await db().insert(staffRoles).values({
      userId: p.osuId,
      role: "developer",
      editionSlug: null,
      grantedBy: admin.osuId,
    });
    expect((await playerPracticeWorkspace(p, slug)).readOnly).toBe(false);
    expect((await playerTimetableWorkspace(p, slug)).canEdit).toBe(true);
    await playerPracticeCommand(p, slug, cmd);
    await playerTimetableCommand(p, slug, timetable());
    expect((await db().select().from(playerPracticeRecords))[0]).toMatchObject({
      userId: p.osuId,
      score: 900000,
    });
    expect(
      (await db().select().from(playerSeasonAvailability))[0],
    ).toMatchObject({ userId: p.osuId, version: 1 });
    await db()
      .update(editionState)
      .set({ lockedAt: new Date() })
      .where(eq(editionState.slug, slug));
    expect((await playerTimetableWorkspace(p, slug)).canEdit).toBe(false);
    await expect(
      playerTimetableCommand(p, slug, timetable({ expectedVersion: 1 })),
    ).rejects.toMatchObject({ status: 409 });
    await db()
      .update(editionState)
      .set({
        lockedAt: null,
        configuration: { ...edition, status: "completed" },
      })
      .where(eq(editionState.slug, slug));
    expect((await playerPracticeWorkspace(p, slug)).readOnly).toBe(true);
    await expect(
      playerPracticeCommand(p, slug, await practice(p, { expectedVersion: 1 })),
    ).rejects.toMatchObject({ status: 409 });
  });
});
