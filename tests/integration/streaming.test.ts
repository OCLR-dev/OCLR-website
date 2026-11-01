import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  editionEvents,
  fixtureReferees,
  fixtureStreams,
  fixtureCommentators,
  fixtures,
  mappools,
  matchImports,
  matchResults,
  resultRevisions,
  staffRoles,
  tournamentRounds,
  tournamentStages,
  users,
} from "../../src/db/schema";
import { streamingCommand, streamingWorkspace } from "../../src/lib/streaming";
import { fixtureCommand, staffFixtures } from "../../src/lib/fixtures";
import { importFixtureMatch } from "../../src/lib/results";
import { mappoolCommand } from "../../src/lib/mappools";
import { changeStaffRole } from "../../src/lib/staff-roles";
import { hasStreamingAccess } from "../../src/lib/streaming-api";
import { extendedSchemas } from "../../src/lib/extended-read-resources";
import { publicFixture } from "../../src/lib/public-competition";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 187001, username: "Streaming Admin" };
const streamer = { osuId: 187002, username: "Streaming Operator" };
const other = { osuId: 187003, username: "Second Streamer" };
const outsider = { osuId: 187004, username: "Outsider" };
const referee = { osuId: 187005, username: "Referee" };
const developer = { osuId: 187006, username: "Read-only Developer" };
const commentator = { osuId: 187007, username: "First Commentator" };
const secondCommentator = { osuId: 187008, username: "Second Commentator" };
const slug = "test-cup";
describe.skipIf(!url)("authoritative edition streaming tasks", () => {
  let id: string, secondId: string, roundId: string;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([edition, { ...edition, slug: "other-test-cup" }]);
    await db()
      .insert(users)
      .values([
        admin,
        streamer,
        other,
        outsider,
        referee,
        developer,
        commentator,
        secondCommentator,
      ]);
    await db()
      .insert(staffRoles)
      .values(
        [streamer, other].map((u) => ({
          userId: u.osuId,
          role: "streamer" as const,
          editionSlug: slug,
          grantedBy: admin.osuId,
        })),
      );
    await db()
      .insert(staffRoles)
      .values(
        [commentator, secondCommentator].map((user) => ({
          userId: user.osuId,
          role: "commentator" as const,
          editionSlug: slug,
          grantedBy: admin.osuId,
        })),
      );
    await db().insert(staffRoles).values({
      userId: referee.osuId,
      role: "referee",
      editionSlug: slug,
      grantedBy: admin.osuId,
    });
    await db().insert(staffRoles).values({
      userId: developer.osuId,
      role: "developer",
      editionSlug: null,
      grantedBy: admin.osuId,
    });
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: slug, kind: "knockout" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: slug,
        stageId: stage.id,
        name: "Unpublished Round",
        position: 1,
      })
      .returning();
    roundId = round.id;
    const rows = await db()
      .insert(fixtures)
      .values(
        [1, 2].map((position) => ({
          editionSlug: slug,
          roundId,
          label: `Streaming match ${position}`,
          timeZone: "Asia/Taipei",
          position,
          scheduledAt: new Date("2030-02-01T12:00:00Z"),
        })),
      )
      .returning();
    [id, secondId] = rows.map((f) => f.id);
    await db().insert(fixtureReferees).values({
      fixtureId: id,
      userId: referee.osuId,
      assignedBy: admin.osuId,
    });
    await db()
      .insert(mappools)
      .values({ editionSlug: slug, roundId, name: "PRIVATE UNRELEASED POOL" });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  const command = (action = "select", expectedRevision = 0, extra = {}) => ({
    action,
    expectedRevision,
    expectedFixtureVersion: 0,
    confirmed: true,
    requestKey: randomUUID(),
    ...extra,
  });
  it("reads internal fixtures with safe fields and denies unrelated operations", async () => {
    const data = await streamingWorkspace(streamer, slug);
    expect(data.fixtures).toHaveLength(2);
    expect(data.fixtures[0].roundName).toBe("Unpublished Round");
    expect(JSON.stringify(data)).not.toContain("PRIVATE UNRELEASED POOL");
    expect(data.fixtures[0]).not.toHaveProperty("mappoolId");
    expect(data.fixtures[0]).not.toHaveProperty("result");
    expect(data.candidates).toEqual([]);
    for (const actor of [outsider, referee])
      await expect(streamingWorkspace(actor, slug)).rejects.toMatchObject({
        status: 403,
      });
    await expect(
      streamingWorkspace(streamer, "other-test-cup"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(staffFixtures(streamer, slug)).rejects.toMatchObject({
      status: 403,
    });
    await expect(fixtureCommand(streamer, slug, {})).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      importFixtureMatch(streamer, slug, id, {
        match: "187001",
        requestKey: randomUUID(),
        expectedVersion: 0,
        expectedFixtureVersion: 0,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(mappoolCommand(streamer, slug, {})).rejects.toMatchObject({
      status: 403,
    });
    await expect(changeStaffRole(streamer, {})).rejects.toMatchObject({
      status: 403,
    });
    expect(
      (await staffFixtures(referee, slug)).fixtures.map((f) => f.id),
    ).toEqual([id]);
  });
  it("lets the merged global Developer read tasks while rejecting every streaming mutation", async () => {
    await streamingCommand(streamer, slug, id, command());
    const data = await streamingWorkspace(developer, slug, {}, id);
    expect(data.canManage).toBe(false);
    expect(data.canSelect).toBe(false);
    expect(data.candidates).toEqual([]);
    expect(data.history).toHaveLength(1);
    for (const action of ["select", "cancel", "reconfirm", "assign"]) {
      await expect(
        streamingCommand(
          developer,
          slug,
          id,
          command(
            action,
            1,
            action === "assign" ? { userId: other.osuId } : {},
          ),
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect((await staffFixtures(developer, slug)).fixtures).toHaveLength(2);
  });
  it("confirms self-selection, replays retries once, and never overwrites another booking", async () => {
    const c = command();
    expect(await streamingCommand(streamer, slug, id, c)).toMatchObject({
      replayed: false,
    });
    expect(await streamingCommand(streamer, slug, id, c)).toMatchObject({
      replayed: true,
    });
    expect(await db().select().from(fixtureStreams)).toHaveLength(1);
    expect(await db().select().from(editionEvents)).toHaveLength(1);
    await expect(
      streamingCommand(other, slug, id, command("select", 1)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      streamingCommand(streamer, slug, secondId, { ...c }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await streamingWorkspace(streamer, slug, { view: "mine" })).fixtures[0]
        .assignment,
    ).toMatchObject({
      userId: streamer.osuId,
      source: "self",
      assignedBy: streamer.osuId,
    });
    expect(
      (
        await streamingWorkspace(streamer, slug, { view: "unassigned" })
      ).fixtures.map((f) => f.id),
    ).toEqual([secondId]);
    await expect(
      streamingCommand(
        streamer,
        slug,
        secondId,
        command("select", 0, { userId: other.osuId }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("serializes racing selection, staff assignment and duplicate requests", async () => {
    const results = await Promise.allSettled([
      streamingCommand(streamer, slug, id, command()),
      streamingCommand(other, slug, id, command()),
      streamingCommand(
        admin,
        slug,
        id,
        command("assign", 0, { userId: other.osuId }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(fixtureStreams)).toHaveLength(1);
    expect(await db().select().from(editionEvents)).toHaveLength(1);
    const c = command();
    const repeated = await Promise.all([
      streamingCommand(streamer, slug, secondId, c),
      streamingCommand(streamer, slug, secondId, c),
    ]);
    expect(repeated.map((r) => r.replayed).sort()).toEqual([false, true]);
  });
  it("assigns, reassigns and cancels either kind of own task with traceable history", async () => {
    await streamingCommand(
      admin,
      slug,
      id,
      command("assign", 0, { userId: streamer.osuId }),
    );
    await expect(
      streamingCommand(other, slug, id, command("cancel", 1)),
    ).rejects.toMatchObject({ status: 403 });
    await streamingCommand(
      admin,
      slug,
      id,
      command("assign", 1, { userId: other.osuId }),
    );
    await streamingCommand(other, slug, id, command("cancel", 2));
    await streamingCommand(streamer, slug, id, command("select", 3));
    await streamingCommand(streamer, slug, id, command("cancel", 4));
    const data = await streamingWorkspace(admin, slug, {}, id);
    expect(data.fixtures[0].assignment).toBeNull();
    expect(data.history).toHaveLength(5);
    expect(data.history.map((h) => h.actorId)).toEqual([
      streamer.osuId,
      streamer.osuId,
      other.osuId,
      admin.osuId,
      admin.osuId,
    ]);
    await expect(
      streamingCommand(
        admin,
        slug,
        id,
        command("assign", 5, { userId: outsider.osuId }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("applies revocation and edition checks on every request while retaining historical identity", async () => {
    await streamingCommand(
      admin,
      slug,
      id,
      command("assign", 0, { userId: streamer.osuId }),
    );
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, streamer.osuId));
    await expect(streamingWorkspace(streamer, slug)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      streamingCommand(streamer, slug, id, command("cancel", 1)),
    ).rejects.toMatchObject({ status: 403 });
    const task = (await streamingWorkspace(admin, slug)).fixtures.find(
      (f) => f.id === id,
    )!.assignment;
    expect(task).toMatchObject({
      username: streamer.username,
      eligible: false,
    });
    await expect(
      streamingCommand(
        admin,
        "other-test-cup",
        id,
        command("assign", 1, { userId: other.osuId }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      streamingCommand(
        admin,
        slug,
        randomUUID(),
        command("assign", 0, { userId: other.osuId }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      streamingCommand(
        admin,
        slug,
        id,
        command("assign", 1, { userId: streamer.osuId }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("warns about matching starts without blocking and filters dates in match time zones", async () => {
    await streamingCommand(streamer, slug, id, command());
    await streamingCommand(streamer, slug, secondId, command());
    const data = await streamingWorkspace(streamer, slug, {
      date: "2030-02-01",
      round: roundId,
      view: "mine",
    });
    expect(data.fixtures).toHaveLength(2);
    expect(data.fixtures[0].conflicts).toHaveLength(1);
    expect(
      (await streamingWorkspace(streamer, slug, { date: "2030-02-02" }))
        .fixtures,
    ).toHaveLength(0);
    await db()
      .update(fixtures)
      .set({ scheduledAt: null })
      .where(eq(fixtures.id, secondId));
    expect(
      (await streamingWorkspace(streamer, slug)).fixtures.every(
        (f) => f.conflicts.length === 0,
      ),
    ).toBe(true);
  });
  it("retains rescheduled/cancelled/completed tasks and requires explicit schedule reconfirmation", async () => {
    await streamingCommand(streamer, slug, id, command());
    await fixtureCommand(admin, slug, {
      action: "edit",
      fixtureId: id,
      expectedVersion: 0,
      confirmed: true,
      label: "Streaming match 1",
      roundId,
      homeTeamId: null,
      awayTeamId: null,
      scheduledAt: "2030-02-02T01:00:00Z",
      timeZone: "Asia/Taipei",
      status: "scheduled",
      mappoolId: null,
      position: 1,
      homeSourceId: null,
      homeSourceOutcome: null,
      awaySourceId: null,
      awaySourceOutcome: null,
    });
    let f = (await streamingWorkspace(streamer, slug, {}, id)).fixtures[0];
    expect(f.assignment?.needsConfirmation).toBe(true);
    await expect(
      streamingCommand(streamer, slug, id, command("reconfirm", 1)),
    ).rejects.toMatchObject({ status: 409 });
    await streamingCommand(
      streamer,
      slug,
      id,
      command("reconfirm", 1, { expectedFixtureVersion: 1 }),
    );
    f = (await streamingWorkspace(streamer, slug, {}, id)).fixtures[0];
    expect(f.assignment?.needsConfirmation).toBe(false);
    expect(f.assignment?.source).toBe("self");
    await db()
      .update(fixtures)
      .set({ status: "cancelled", version: 2 })
      .where(eq(fixtures.id, id));
    expect(
      (await streamingWorkspace(streamer, slug, {}, id)).fixtures[0].assignment,
    ).not.toBeNull();
    await expect(
      streamingCommand(
        admin,
        slug,
        id,
        command("assign", 2, {
          userId: other.osuId,
          expectedFixtureVersion: 2,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await streamingCommand(
      streamer,
      slug,
      id,
      command("cancel", 2, { expectedFixtureVersion: 2 }),
    );
    await db()
      .insert(matchResults)
      .values({ fixtureId: secondId, state: "approved" });
    const [imported] = await db()
      .insert(matchImports)
      .values({
        fixtureId: secondId,
        externalMatchId: 18701,
        fingerprint: "synthetic",
        source: {},
        createdBy: admin.osuId,
      })
      .returning();
    await db()
      .insert(resultRevisions)
      .values({
        fixtureId: secondId,
        importId: imported.id,
        revision: 1,
        proposal: {} as never,
        createdBy: admin.osuId,
        approvedAt: new Date(),
        approvedBy: admin.osuId,
      });
    expect(
      (await streamingWorkspace(admin, slug, {}, secondId)).fixtures[0]
        .completed,
    ).toBe(true);
    await expect(
      streamingCommand(streamer, slug, secondId, command()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("protects booked deletion, preserves task audit after deletion and keeps public schedules unchanged", async () => {
    await db()
      .update(fixtures)
      .set({ publishedAt: new Date() })
      .where(eq(fixtures.id, id));
    const before = await publicFixture(slug, id);
    await streamingCommand(streamer, slug, id, command());
    expect(await publicFixture(slug, id)).toEqual(before);
    await db()
      .update(fixtures)
      .set({ publishedAt: null })
      .where(eq(fixtures.id, id));
    await expect(
      fixtureCommand(admin, slug, {
        action: "delete",
        fixtureId: id,
        expectedVersion: 0,
        expectedAssignmentRevision: 0,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await streamingCommand(streamer, slug, id, command("cancel", 1));
    await db()
      .update(fixtures)
      .set({ publishedAt: null })
      .where(eq(fixtures.id, id));
    await fixtureCommand(admin, slug, {
      action: "delete",
      fixtureId: id,
      expectedVersion: 0,
      expectedAssignmentRevision: 0,
      confirmed: true,
    });
    expect(await db().select().from(fixtureStreams)).toEqual([]);
    expect(
      (await db().select().from(editionEvents)).filter(
        (e) => e.kind === "streaming_task",
      ),
    ).toHaveLength(2);
    await expect(
      streamingWorkspace(streamer, slug, {}, id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("keeps one Streamer and multiple Commentators, with role-specific eligibility and saved reads", async () => {
    await streamingCommand(streamer, slug, id, command());
    const claim = command("select", 1, { task: "commentary" });
    await streamingCommand(commentator, slug, id, claim);
    await streamingCommand(
      secondCommentator,
      slug,
      id,
      command("select", 2, { task: "commentary" }),
    );
    expect(await streamingCommand(commentator, slug, id, claim)).toMatchObject({
      replayed: true,
    });
    const data = await streamingWorkspace(commentator, slug, { view: "mine" });
    expect(data.fixtures).toHaveLength(1);
    expect(data.fixtures[0].assignment?.userId).toBe(streamer.osuId);
    expect(
      data.fixtures[0].commentators.map((task) => task.userId).sort(),
    ).toEqual([commentator.osuId, secondCommentator.osuId]);
    expect(data.canSelect).toBe(false);
    expect(data.canSelectCommentary).toBe(true);
    expect(data.commentaryCandidates).toEqual([]);
    expect(extendedSchemas.streamingWorkspace.safeParse(data).success).toBe(
      true,
    );
    expect(await hasStreamingAccess(commentator.osuId, slug)).toBe(false);
    const manager = await streamingWorkspace(admin, slug);
    expect(manager.candidates.map((u) => u.osuId)).not.toContain(
      commentator.osuId,
    );
    expect(manager.commentaryCandidates.map((u) => u.osuId)).toContain(
      commentator.osuId,
    );
    expect(manager.commentaryCandidates.map((u) => u.osuId)).not.toContain(
      streamer.osuId,
    );
    for (const [actor, task] of [
      [commentator, undefined],
      [streamer, "commentary"],
    ] as const)
      await expect(
        streamingCommand(
          actor,
          slug,
          secondId,
          command("select", 0, task ? { task } : {}),
        ),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      streamingWorkspace(commentator, "other-test-cup"),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db().select().from(fixtureStreams)).toHaveLength(1);
    expect(await db().select().from(fixtureCommentators)).toHaveLength(2);
  });
  it("assigns individual commentators and permits only owners or managers to cancel them", async () => {
    await streamingCommand(
      admin,
      slug,
      id,
      command("assign", 0, { task: "commentary", userId: commentator.osuId }),
    );
    await streamingCommand(
      admin,
      slug,
      id,
      command("assign", 1, {
        task: "commentary",
        userId: secondCommentator.osuId,
      }),
    );
    for (const action of ["cancel", "reconfirm", "assign"]) {
      await expect(
        streamingCommand(
          commentator,
          slug,
          id,
          command(action, 2, {
            task: "commentary",
            userId: secondCommentator.osuId,
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      streamingCommand(
        commentator,
        slug,
        id,
        command("select", 2, { task: "commentary" }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await streamingCommand(
      commentator,
      slug,
      id,
      command("cancel", 2, { task: "commentary" }),
    );
    expect(
      (
        await streamingWorkspace(admin, slug, {}, id)
      ).fixtures[0].commentators.map((task) => task.userId),
    ).toEqual([secondCommentator.osuId]);
    await streamingCommand(
      admin,
      slug,
      id,
      command("cancel", 3, {
        task: "commentary",
        userId: secondCommentator.osuId,
      }),
    );
    expect(await db().select().from(fixtureCommentators)).toEqual([]);
    expect(
      (await streamingWorkspace(admin, slug, {}, id)).history,
    ).toHaveLength(4);
  });
  it("serializes commentary retries and accepts a second commentator after refreshing the shared revision", async () => {
    const claim = command("select", 0, { task: "commentary" });
    const duplicate = await Promise.all([
      streamingCommand(commentator, slug, id, claim),
      streamingCommand(commentator, slug, id, claim),
    ]);
    expect(duplicate.filter((result) => result.replayed)).toHaveLength(1);
    await expect(
      streamingCommand(
        secondCommentator,
        slug,
        id,
        command("select", 0, { task: "commentary" }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await streamingCommand(
      secondCommentator,
      slug,
      id,
      command("select", 1, { task: "commentary" }),
    );
    expect(await db().select().from(fixtureCommentators)).toHaveLength(2);
    expect(await db().select().from(editionEvents)).toHaveLength(2);
  });
  it("requires each commentator to reconfirm a changed schedule and keeps cancellation available", async () => {
    await streamingCommand(
      commentator,
      slug,
      id,
      command("select", 0, { task: "commentary" }),
    );
    await streamingCommand(
      secondCommentator,
      slug,
      id,
      command("select", 1, { task: "commentary" }),
    );
    await db()
      .update(fixtures)
      .set({ scheduledAt: new Date("2030-02-03T12:00:00Z"), version: 1 })
      .where(eq(fixtures.id, id));
    let tasks = (await streamingWorkspace(commentator, slug, {}, id))
      .fixtures[0].commentators;
    expect(tasks.every((task) => task.needsConfirmation)).toBe(true);
    await streamingCommand(
      commentator,
      slug,
      id,
      command("reconfirm", 2, {
        task: "commentary",
        expectedFixtureVersion: 1,
      }),
    );
    tasks = (await streamingWorkspace(commentator, slug, {}, id)).fixtures[0]
      .commentators;
    expect(
      tasks.find((task) => task.userId === commentator.osuId)
        ?.needsConfirmation,
    ).toBe(false);
    expect(
      tasks.find((task) => task.userId === secondCommentator.osuId)
        ?.needsConfirmation,
    ).toBe(true);
    await db()
      .update(fixtures)
      .set({ status: "cancelled", version: 2 })
      .where(eq(fixtures.id, id));
    await expect(
      streamingCommand(
        secondCommentator,
        slug,
        id,
        command("reconfirm", 3, {
          task: "commentary",
          expectedFixtureVersion: 2,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await streamingCommand(
      secondCommentator,
      slug,
      id,
      command("cancel", 3, { task: "commentary", expectedFixtureVersion: 2 }),
    );
    expect(await db().select().from(fixtureCommentators)).toHaveLength(1);
  });
  it("checks commentary revocation even with another live role, preserving attribution for managers", async () => {
    await streamingCommand(
      commentator,
      slug,
      id,
      command("select", 0, { task: "commentary" }),
    );
    await changeStaffRole(admin, {
      action: "grant",
      confirmed: true,
      userId: commentator.osuId,
      role: "streamer",
      editionSlug: slug,
    });
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.role, "commentator"));
    expect(
      (await streamingWorkspace(admin, slug, {}, id)).fixtures[0]
        .commentators[0].eligible,
    ).toBe(false);
    for (const action of ["cancel", "reconfirm"])
      await expect(
        streamingCommand(
          commentator,
          slug,
          id,
          command(action, 1, { task: "commentary" }),
        ),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      streamingCommand(
        admin,
        slug,
        secondId,
        command("assign", 0, { task: "commentary", userId: commentator.osuId }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await streamingCommand(
      admin,
      slug,
      id,
      command("cancel", 1, { task: "commentary", userId: commentator.osuId }),
    );
    expect(await db().select().from(fixtureCommentators)).toEqual([]);
  });
  it("includes cross-role same-start warnings and protects booked deletion without publishing identities", async () => {
    await changeStaffRole(admin, {
      action: "grant",
      confirmed: true,
      userId: streamer.osuId,
      role: "commentator",
      editionSlug: slug,
    });
    await streamingCommand(streamer, slug, id, command());
    await streamingCommand(
      streamer,
      slug,
      secondId,
      command("select", 0, { task: "commentary" }),
    );
    const data = await streamingWorkspace(streamer, slug);
    expect(
      data.fixtures.find((f) => f.id === id)?.conflicts.map((f) => f.id),
    ).toEqual([secondId]);
    expect(
      data.fixtures
        .find((f) => f.id === secondId)
        ?.commentators[0].conflicts.map((f) => f.id),
    ).toEqual([id]);
    await expect(
      fixtureCommand(admin, slug, {
        action: "delete",
        fixtureId: secondId,
        expectedVersion: 0,
        expectedAssignmentRevision: 0,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await db()
      .update(fixtures)
      .set({ publishedAt: new Date() })
      .where(eq(fixtures.id, secondId));
    const publicData = await publicFixture(slug, secondId);
    expect(JSON.stringify(publicData)).not.toContain("commentator");
    expect(publicData).not.toHaveProperty("commentators");
  });
});
