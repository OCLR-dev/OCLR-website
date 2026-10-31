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
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  captains,
  memberships,
  teams,
  editionState,
  fixtureReferees,
  fixtureStreams,
  refereeRoundPolicies,
  fixtures,
  mappools,
  matchResults,
  refereeEvents,
  tournamentRounds,
  refereeSessions,
  resultAuditEvents,
  staffRoles,
  users,
} from "../../src/db/schema";
import {
  refereeCommand,
  refereeWorkspace,
  type RefereeWorkspace,
} from "../../src/lib/referee";
import {
  fixtureForReview,
  assignFixtureReferees,
} from "../../src/lib/fixtures";
import {
  refereeCommands,
  emptyRefereeSettings,
} from "../../src/lib/referee-commands";
import {
  seedRefereeFixture,
  refereeTestAdmin as admin,
  refereeTestUser as referee,
} from "../fixtures/referee";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL;
const outsider = { osuId: 891003, username: "Synthetic outsider" };
const developer = { osuId: 891004, username: "Synthetic read-only Developer" };
const streamer = { osuId: 891005, username: "Synthetic Streamer" };

describe.skipIf(!url)("private persistent referee workspace", () => {
  let fixtureId: string;
  let w: RefereeWorkspace;
  beforeAll(() => {
    assertTestDatabase(url);
    if (new URL(url!).pathname === "/oclr_frontend_test")
      throw new Error("Never run against the preview database.");
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const setup = await seedRefereeFixture(false);
    fixtureId = setup.fixtureId;
    w = setup.workspace;
    await db().insert(users).values([outsider, developer, streamer]);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: developer.osuId,
          role: "developer",
          editionSlug: null,
          grantedBy: admin.osuId,
        },
        {
          userId: streamer.osuId,
          role: "streamer",
          editionSlug: "test-cup",
          grantedBy: admin.osuId,
        },
      ]);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  const input = (action: Record<string, unknown>, state = w) => ({
    ...action,
    requestKey: randomUUID(),
    expectedRevision: state.session?.revision ?? 0,
    dependencyFingerprint: state.dependencyFingerprint,
  });
  async function command(action: Record<string, unknown>, actor = referee) {
    const result = await refereeCommand(
      actor,
      "test-cup",
      fixtureId,
      input(action),
    );
    w = result.workspace;
    return result;
  }
  async function configure() {
    const { syntheticRefereePolicy } = await import("../fixtures/referee");
    await command(
      {
        action: "configure_policy",
        policy: syntheticRefereePolicy,
        expectedPolicyRevision: 0,
      },
      admin,
    );
    await command({
      action: "set_order",
      firstBanTeamId: w.teams[0].id,
      firstPickTeamId: w.teams[1].id,
    });
  }
  it("persists authorized EX declarations for result scoring, rejects late edits and removes withdrawn picks", async () => {
    await db()
      .update(tournamentRounds)
      .set({ scoringRules: { ...w.rules!, exPlayersPerTeam: 1 } })
      .where(eq(tournamentRounds.id, w.fixture.roundId));
    w = await refereeWorkspace(referee, "test-cup", fixtureId);
    await configure();
    const maps = w.maps.filter((m) => m.category === "NM");
    await command({ action: "record_selection", entryId: maps[0].id });
    await command({ action: "record_selection", entryId: maps[1].id });
    const pickId = w.projection.lastSelectionId!;
    await expect(
      command({ action: "declare_ex", pickId, enabled: true }, outsider),
    ).rejects.toMatchObject({ status: 403 });
    const change = input({ action: "declare_ex", pickId, enabled: true });
    const first = await refereeCommand(referee, "test-cup", fixtureId, change);
    w = first.workspace;
    await refereeCommand(referee, "test-cup", fixtureId, change);
    expect(
      (await fixtureForReview(referee, "test-cup", fixtureId)).exDeclarations,
    ).toContainEqual({
      id: pickId,
      beatmapId: maps[1].beatmapId,
      exMode: true,
    });
    expect(
      (await db().select().from(refereeEvents)).filter(
        (e) => e.payload.type === "ex_declared",
      ),
    ).toHaveLength(1);
    await command({ action: "start_attempt", pickId });
    await expect(
      command({ action: "declare_ex", pickId, enabled: false }),
    ).rejects.toMatchObject({ status: 409 });
    await command({ action: "void_last" });
    expect(
      (
        await fixtureForReview(referee, "test-cup", fixtureId)
      ).exDeclarations.some((p) => p.exMode),
    ).toBe(false);
  });
  it("persists a two-replay cap and rejects an extra replay without writes", async () => {
    await configure();
    await command(
      {
        action: "configure_policy",
        policy: { ...w.policy!, maxReplaysPerMap: 2 },
        expectedPolicyRevision: w.policyRevision,
      },
      admin,
    );
    const maps = w.maps.filter((m) => m.category === "NM");
    await command({ action: "record_selection", entryId: maps[0].id });
    await command({ action: "record_selection", entryId: maps[1].id });
    const pickId = w.projection.lastSelectionId!;
    for (let n = 0; n < 2; n++) {
      await command({
        action: "resolve_attempt",
        pickId,
        status: "aborted",
        winnerTeamId: null,
      });
      await command({ action: "replay_attempt", pickId });
    }
    await command({
      action: "resolve_attempt",
      pickId,
      status: "aborted",
      winnerTeamId: null,
    });
    const revision = w.session!.revision;
    const eventCount = w.events.length;
    await expect(command({ action: "replay_attempt", pickId })).rejects.toThrow(
      "The replay limit for this map has been reached.",
    );
    const saved = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(saved.session!.revision).toBe(revision);
    expect(saved.events).toHaveLength(eventCount);
    expect(saved.projection.activeSelections.at(-1)!.attempts).toHaveLength(3);
  });
  it("reads do not create sessions, and private DTOs omit answers and provider data", async () => {
    expect(w.session).toBeNull();
    expect(await db().select().from(refereeSessions)).toHaveLength(0);
    expect(await db().select().from(refereeEvents)).toHaveLength(0);
    const read = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(read.canRecord).toBe(true);
    expect(read.canConfigure).toBe(false);
    expect(read.teams.every((t) => t.members.length === 2)).toBe(true);
    expect(Object.keys(read.teams[0].members[0]).sort()).toEqual([
      "osuId",
      "username",
    ]);
    expect(JSON.stringify(read)).not.toContain("SYNTHETIC_PRIVATE_CONTACT");
    expect(JSON.stringify(read)).not.toContain("SYNTHETIC_INTERNAL_REASON");
    expect(read.readiness).toContain(
      "The round referee policy has not been configured.",
    );
  });
  it("allows private unfinalized teams to record BP and invite saved members without publishing them", async () => {
    await db()
      .update(teams)
      .set({
        identityPublished: false,
        rosterPublished: false,
        finalizedAt: null,
      })
      .where(eq(teams.editionSlug, "test-cup"));
    await db()
      .update(captains)
      .set({ published: false })
      .where(eq(captains.editionSlug, "test-cup"));
    w = await refereeWorkspace(referee, "test-cup", fixtureId);
    const protectedMessage =
      "Both teams must have finalized published identities and rosters before reporting.";
    expect(w.readiness).not.toContain(protectedMessage);
    expect(w.teams.every((t) => t.members.length === 2)).toBe(true);
    await configure();
    expect(w.readiness).toEqual([]);
    await command({
      action: "record_selection",
      entryId: w.maps.find((m) => m.category !== "TB")!.id,
    });
    expect(w.projection.activeSelections).toHaveLength(1);
    const invites = refereeCommands({
      settings: w.defaultSettings,
      policy: w.policy!.commands,
      rules: w.rules,
      teams: w.teams,
      selectedMap: null,
    }).filter((c) => c.kind === "invite");
    expect(invites.map((c) => c.playerName).sort()).toEqual(
      w.teams.flatMap((t) => t.members.map((m) => m.username)).sort(),
    );
    expect(invites).toHaveLength(4);
    expect(
      (await db().select().from(teams)).every(
        (t) =>
          !t.identityPublished && !t.rosterPublished && t.finalizedAt === null,
      ),
    ).toBe(true);
    expect(
      (await db().select().from(captains)).every((c) => !c.published),
    ).toBe(true);
    await expect(
      fixtureForReview(referee, "test-cup", fixtureId),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("excludes former members, tracks saved roster edits, and does not expose archived or unresolved teams", async () => {
    await configure();
    const old = w;
    const member = w.teams[0].members[0];
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(memberships.teamId, w.teams[0].id),
          eq(memberships.userId, member.osuId),
        ),
      );
    w = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(w.teams[0].members.some((m) => m.osuId === member.osuId)).toBe(
      false,
    );
    expect(w.dependencyFingerprint).not.toBe(old.dependencyFingerprint);
    await expect(
      command({ action: "record_selection", entryId: w.maps[0].id }),
    ).rejects.toMatchObject({ status: 409 });
    await db()
      .update(teams)
      .set({ archivedAt: new Date() })
      .where(eq(teams.id, w.teams[0].id));
    w = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(w.readiness).toContain("Both fixture teams must be resolved.");
    expect(w.teams).toHaveLength(1);
    await expect(
      refereeWorkspace(outsider, "test-cup", fixtureId),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("initializes the first session with the newly configured command defaults", async () => {
    await configure();
    expect(w.session?.settings).toMatchObject({
      timerSeconds: 90,
      startSeconds: 5,
      roomSize: 8,
    });
    expect(w.session?.settings.roomName).toBe(w.defaultSettings.roomName);
  });
  it("ignores historical session overrides without mutating their storage or events on read", async () => {
    await configure();
    const legacy = {
      ...emptyRefereeSettings,
      roomName: "Legacy",
      streamerUsername: "Wrong",
      roomSize: 4,
      timerSeconds: 30,
      startSeconds: 3,
    };
    await db()
      .update(refereeSessions)
      .set({ settings: legacy })
      .where(eq(refereeSessions.fixtureId, fixtureId));
    const events = await db().select().from(refereeEvents);
    const loaded = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(loaded.session!.settings).toEqual(loaded.defaultSettings);
    expect(loaded.defaultSettings).toMatchObject({
      roomSize: 8,
      timerSeconds: 90,
      startSeconds: 5,
      streamerUsername: "",
    });
    expect((await db().select().from(refereeSessions))[0].settings).toEqual(
      legacy,
    );
    expect(await db().select().from(refereeEvents)).toEqual(events);
    await expect(
      command({ action: "save_settings", settings: legacy }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db().select().from(refereeEvents)).toEqual(events);
  });
  it("inherits newly saved round settings for an existing session and leaves the BP dependency protection intact", async () => {
    await configure();
    const [saved] = await db().select().from(refereeRoundPolicies);
    await db()
      .update(refereeRoundPolicies)
      .set({
        revision: saved.revision + 1,
        policy: {
          ...saved.policy,
          commands: {
            ...saved.policy.commands!,
            roomSize: 16,
            prepareSeconds: 150,
            startSeconds: null,
          },
        },
      })
      .where(eq(refereeRoundPolicies.roundId, w.round.id));
    const loaded = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(loaded.defaultSettings).toMatchObject({
      roomSize: 16,
      timerSeconds: 150,
      startSeconds: null,
    });
    expect(loaded.session!.settings).toEqual(loaded.defaultSettings);
    expect(loaded.session!.dependencyFingerprint).not.toBe(
      loaded.dependencyFingerprint,
    );
  });
  it("uses only this fixture's current eligible streamer, follows reassignment and revocation without changing BP", async () => {
    await configure();
    const initialFingerprint = w.dependencyFingerprint;
    const insert = {
      fixtureId,
      userId: streamer.osuId,
      assignedBy: admin.osuId,
      source: "staff" as const,
      confirmedTimeZone: "UTC",
    };
    await db().insert(fixtureStreams).values(insert);
    const read = () => refereeWorkspace(referee, "test-cup", fixtureId);
    let loaded = await read();
    expect(loaded.defaultSettings.streamerUsername).toBe(streamer.username);
    const addref = () =>
      refereeCommands({
        settings: loaded.defaultSettings,
        rules: loaded.rules,
        policy: loaded.policy!.commands!,
        teams: loaded.teams,
        selectedMap: null,
      }).find((c) => c.kind === "addref")!.text;
    expect(addref()).toBe("!mp addref Synthetic_Streamer");
    expect(loaded.session!.settings).toEqual(loaded.defaultSettings);
    expect(loaded.dependencyFingerprint).toBe(initialFingerprint);
    await db()
      .update(users)
      .set({ username: "Renamed Streamer" })
      .where(eq(users.osuId, streamer.osuId));
    loaded = await read();
    expect(addref()).toBe("!mp addref Renamed_Streamer");
    await db()
      .update(fixtureStreams)
      .set({ userId: outsider.osuId })
      .where(eq(fixtureStreams.fixtureId, fixtureId));
    loaded = await read();
    expect(addref()).toBeNull();
    // A role in another edition is not sufficient.
    await db().insert(editionState).values({ slug: "other-cup" });
    await db().insert(staffRoles).values({
      userId: outsider.osuId,
      role: "streamer",
      editionSlug: "other-cup",
      grantedBy: admin.osuId,
    });
    loaded = await read();
    expect(addref()).toBeNull();
    await db()
      .update(staffRoles)
      .set({ editionSlug: null })
      .where(
        and(
          eq(staffRoles.userId, outsider.osuId),
          eq(staffRoles.role, "streamer"),
        ),
      );
    loaded = await read();
    expect(addref()).toBe("!mp addref Synthetic_outsider");
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(staffRoles.userId, outsider.osuId),
          eq(staffRoles.role, "streamer"),
        ),
      );
    loaded = await read();
    expect(addref()).toBeNull();
    await db()
      .delete(fixtureStreams)
      .where(eq(fixtureStreams.fixtureId, fixtureId));
    loaded = await read();
    expect(loaded.defaultSettings.streamerUsername).toBe("");
    expect(loaded.projection).toEqual(w.projection);
    expect(loaded.dependencyFingerprint).toBe(initialFingerprint);
  });
  it("requires edition roles and current assignment, while Developer reads never grant writes", async () => {
    await expect(
      refereeWorkspace(outsider, "test-cup", fixtureId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      refereeWorkspace(streamer, "test-cup", fixtureId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      refereeWorkspace(referee, "private-test-cup", fixtureId),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await refereeWorkspace(developer, "test-cup", fixtureId)).canRecord,
    ).toBe(false);
    await expect(
      command(
        { action: "save_settings", settings: emptyRefereeSettings },
        developer,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await db()
      .delete(fixtureReferees)
      .where(eq(fixtureReferees.userId, referee.osuId));
    await expect(
      refereeWorkspace(referee, "test-cup", fixtureId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      command({ action: "save_settings", settings: emptyRefereeSettings }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("persists settings across connection restart and hands off using existing assignment rules", async () => {
    await command({
      action: "save_settings",
      settings: w.defaultSettings,
    });
    await closeDb();
    const reloaded = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(reloaded.session?.settings).toEqual(w.defaultSettings);
    await db().insert(staffRoles).values({
      userId: outsider.osuId,
      role: "referee",
      editionSlug: "test-cup",
      grantedBy: admin.osuId,
    });
    const [fixture] = await db()
      .select()
      .from(fixtures)
      .where(eq(fixtures.id, fixtureId));
    await assignFixtureReferees(admin, "test-cup", fixtureId, {
      expectedAssignmentRevision: fixture.assignmentRevision,
      refereeIds: [outsider.osuId],
    });
    expect(
      (await refereeWorkspace(outsider, "test-cup", fixtureId)).session,
    ).toEqual(reloaded.session);
    await expect(
      refereeWorkspace(referee, "test-cup", fixtureId),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("serializes competing revisions and replays the original receipt without duplicate events", async () => {
    const a = input({
      action: "save_settings",
      settings: w.defaultSettings,
    });
    const b = input({
      action: "save_settings",
      settings: w.defaultSettings,
    });
    const results = await Promise.allSettled([
      refereeCommand(referee, "test-cup", fixtureId, a),
      refereeCommand(referee, "test-cup", fixtureId, b),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const index = results.findIndex((r) => r.status === "fulfilled");
    const won = results[index] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof refereeCommand>>
    >;
    const replay = await refereeCommand(
      referee,
      "test-cup",
      fixtureId,
      index === 0 ? a : b,
    );
    expect(replay.receipt).toEqual(won.value.receipt);
    expect(await db().select().from(refereeEvents)).toHaveLength(1);
    await expect(
      refereeCommand(referee, "test-cup", fixtureId, {
        ...(index === 0 ? a : b),
        settings: { ...emptyRefereeSettings, roomName: "Changed payload" },
      }),
    ).rejects.toMatchObject({ status: 409 });
    const audits = await db()
      .select()
      .from(resultAuditEvents)
      .where(eq(resultAuditEvents.action, "referee_save_settings"));
    expect(audits).toHaveLength(1);
  });
  it("blocks stale dependencies, preserves the old projection, and requires explicit recheck", async () => {
    await configure();
    await command({ action: "record_selection", entryId: w.maps[0].id });
    const original = w.projection;
    const [fixture] = await db()
      .select()
      .from(fixtures)
      .where(eq(fixtures.id, fixtureId));
    await db()
      .update(mappools)
      .set({ version: 3 })
      .where(eq(mappools.id, fixture.mappoolId!));
    await expect(
      command({ action: "save_settings", settings: emptyRefereeSettings }),
    ).rejects.toMatchObject({ status: 409 });
    w = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(w.projection).toEqual(original);
    await expect(
      command({ action: "reconfirm_dependencies" }),
    ).rejects.toMatchObject({ status: 409 });
    await command({ action: "void_last" });
    await command({ action: "reconfirm_dependencies" });
    expect(w.session?.dependencyFingerprint).toBe(w.dependencyFingerprint);
    expect(w.projection.activeSelections).toHaveLength(0);
    expect(w.projection.selections).toHaveLength(1);
  });
  it("records multiphase selection, opposite-side wins, ties, replay, corrections and reverse undo without official writes", async () => {
    const before = await db()
      .select()
      .from(matchResults)
      .where(eq(matchResults.fixtureId, fixtureId));
    await configure();
    const home = w.teams[0].id,
      away = w.teams[1].id;
    await command({ action: "record_selection", entryId: w.maps[0].id });
    await expect(
      command({ action: "record_selection", entryId: w.maps[0].id }),
    ).rejects.toMatchObject({ status: 409 });
    await command({ action: "record_selection", entryId: w.maps[1].id });
    const first = w.projection.lastSelectionId!;
    expect(w.projection.activeSelections[1].teamId).toBe(away);
    await command({ action: "start_attempt", pickId: first });
    await command({
      action: "resolve_attempt",
      pickId: first,
      status: "aborted",
      winnerTeamId: null,
    });
    expect(w.projection.score).toEqual({ [home]: 0, [away]: 0 });
    await command({ action: "replay_attempt", pickId: first });
    await command({
      action: "resolve_attempt",
      pickId: first,
      status: "tied",
      winnerTeamId: null,
    });
    await command({ action: "replay_attempt", pickId: first });
    await command({
      action: "resolve_attempt",
      pickId: first,
      status: "completed",
      winnerTeamId: home,
    });
    expect(w.projection.activeSelections[1].attempts).toHaveLength(3);
    expect(w.projection.score[home]).toBe(1);
    await command({ action: "record_selection", entryId: w.maps[2].id });
    await command({ action: "record_selection", entryId: w.maps[3].id });
    const second = w.projection.lastSelectionId!;
    await command({
      action: "resolve_attempt",
      pickId: second,
      status: "completed",
      winnerTeamId: away,
    });
    await command({
      action: "record_selection",
      entryId: w.maps.find((m) => m.category === "TB")!.id,
    });
    const tb = w.projection.lastSelectionId!;
    expect(w.projection.activeSelections.at(-1)?.teamId).toBeNull();
    await command({
      action: "resolve_attempt",
      pickId: tb,
      status: "completed",
      winnerTeamId: home,
    });
    expect(w.projection.complete).toBe(true);
    await command({
      action: "resolve_attempt",
      pickId: tb,
      status: "completed",
      winnerTeamId: away,
    });
    expect(w.projection.score).toEqual({ [home]: 1, [away]: 2 });
    await command({ action: "void_last" });
    expect(w.projection.score).toEqual({ [home]: 1, [away]: 1 });
    expect(w.projection.selections.at(-1)?.voided).toBe(true);
    expect(
      await db()
        .select()
        .from(matchResults)
        .where(eq(matchResults.fixtureId, fixtureId)),
    ).toEqual(before);
  });
  it("rejects injected actor/score fields and stale revoked-role retries", async () => {
    await expect(
      refereeCommand(referee, "test-cup", fixtureId, {
        ...input({ action: "save_settings", settings: emptyRefereeSettings }),
        actorId: admin.osuId,
        score: 100,
      }),
    ).rejects.toMatchObject({ status: 400 });
    const c = input({
      action: "save_settings",
      settings: w.defaultSettings,
    });
    await refereeCommand(referee, "test-cup", fixtureId, c);
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(staffRoles.userId, referee.osuId),
          eq(staffRoles.role, "referee"),
        ),
      );
    await expect(
      refereeCommand(referee, "test-cup", fixtureId, c),
    ).rejects.toMatchObject({ status: 403 });
  });
});
