let fixtureEditions: unknown[];
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
import { updateTeams } from "../../src/lib/teams";
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
  editionState,
  registrations,
  users,
  editionEvents,
  teams,
  memberships,
} from "../../src/db/schema";
import {
  captainSetup,
  updateCaptains,
  publicCaptains,
  captainAppointment,
} from "../../src/lib/captains";
import { withdrawRegistration } from "../../src/lib/registrations";
import { edition } from "../fixtures/edition";
const url = process.env.TEST_DATABASE_URL;
const staff = { osuId: 80001, username: "Synthetic Staff" };
const a = { osuId: 80002, username: "Synthetic Captain A" };
const b = { osuId: 80003, username: "Synthetic Captain B" };
const player = { osuId: 80004, username: "Synthetic Pool Player" };
describe.skipIf(!url)("captain setup, publication and eligibility", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    fixtureEditions = [edition, { ...edition, slug: "second-test-cup" }];
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(staff.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions(fixtureEditions);
    await db().insert(users).values([staff, a, b, player]);
    await db()
      .insert(editionState)
      .values({ slug: edition.slug })
      .onConflictDoNothing();
    for (const p of [a, b, player])
      await db().insert(registrations).values({
        userId: p.osuId,
        editionSlug: edition.slug,
        status: "accepted",
        rulesVersion: "test-v1",
        answers: {},
      });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  const command = (version: number, value: Record<string, unknown>) => ({
    command: value,
    expectedVersion: version,
    confirmed: true,
  });
  it("separates captain/staff/edition roles and excludes captains from the pool", async () => {
    const setup = await updateCaptains(
      staff,
      edition.slug,
      command(0, { action: "appoint", userId: a.osuId }),
    );
    expect(setup.pool.map((p) => p.userId)).not.toContain(a.osuId);
    expect(await captainAppointment(a.osuId, edition.slug)).not.toBeNull();
    expect(await captainAppointment(a.osuId, "second-test-cup")).toBeNull();
    await expect(
      updateCaptains(
        a,
        edition.slug,
        command(1, { action: "appoint", userId: b.osuId }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const r = (await db().select().from(registrations)).find(
      (r) => r.userId === a.osuId,
    )!;
    await expect(
      withdrawRegistration(a, r.id, { confirmed: true }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("allows one concurrent appointment and guards duplicate/cross-edition players", async () => {
    const results = await Promise.allSettled([
      updateCaptains(
        staff,
        edition.slug,
        command(0, { action: "appoint", userId: a.osuId }),
      ),
      updateCaptains(
        staff,
        edition.slug,
        command(0, { action: "appoint", userId: a.osuId }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      updateCaptains(
        staff,
        edition.slug,
        command(1, { action: "appoint", userId: a.osuId }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateCaptains(
        staff,
        "second-test-cup",
        command(0, { action: "appoint", userId: b.osuId }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("validates complete order and freezes changes before draft", async () => {
    await updateCaptains(
      staff,
      edition.slug,
      command(0, { action: "appoint", userId: a.osuId }),
    );
    await updateCaptains(
      staff,
      edition.slug,
      command(1, { action: "appoint", userId: b.osuId }),
    );
    await expect(
      updateCaptains(
        staff,
        edition.slug,
        command(2, { action: "order", userIds: [a.osuId, a.osuId] }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    const ordered = await updateCaptains(
      staff,
      edition.slug,
      command(2, { action: "order", userIds: [b.osuId, a.osuId] }),
    );
    expect(ordered.captains.map((c) => c.userId)).toEqual([b.osuId, a.osuId]);
    await updateTeams(
      staff,
      edition.slug,
      command(3, {
        action: "configure",
        teams: [
          { captainId: a.osuId, name: "Synthetic A", capacity: null },
          { captainId: b.osuId, name: "Synthetic B", capacity: null },
        ],
      }),
    );
    await updateCaptains(staff, edition.slug, command(4, { action: "lock" }));
    await expect(
      updateCaptains(
        staff,
        edition.slug,
        command(5, { action: "revoke", userId: a.osuId }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("unappoints a captain, archives their empty team and preserves their application and audit history", async () => {
    await updateCaptains(
      staff,
      edition.slug,
      command(0, { action: "appoint", userId: a.osuId }),
    );
    await updateTeams(
      staff,
      edition.slug,
      command(1, {
        action: "configure",
        teams: [{ captainId: a.osuId, name: "Synthetic A", capacity: null }],
      }),
    );
    await updateCaptains(
      staff,
      edition.slug,
      command(2, { action: "appoint", userId: b.osuId }),
    );
    const originalApplications = await db().select().from(registrations);
    const originalMembers = await db().select().from(memberships);
    const result = await updateCaptains(
      staff,
      edition.slug,
      command(3, { action: "revoke", userId: a.osuId }),
    );
    expect(result.version).toBe(4);
    expect(result.captains.map((c) => c.userId)).toEqual([b.osuId]);
    expect(result.pool.map((p) => p.userId)).toContain(a.osuId);
    expect(await captainAppointment(a.osuId, edition.slug)).toBeNull();
    expect(await db().select().from(registrations)).toEqual(
      originalApplications,
    );
    const [archived] = await db()
      .select()
      .from(teams)
      .where(eq(teams.captainId, a.osuId));
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.identityPublished).toBe(false);
    expect(archived.rosterPublished).toBe(false);
    const [member] = await db()
      .select()
      .from(memberships)
      .where(eq(memberships.userId, a.osuId));
    expect(member.id).toBe(
      originalMembers.find((m) => m.userId === a.osuId)!.id,
    );
    expect(member.leftAt).toBeInstanceOf(Date);
    const events = await db().select().from(editionEvents);
    expect(events).toHaveLength(4);
    const removal = events.find((e) => e.kind === "captain_revoke")!;
    expect(removal.actorId).toBe(staff.osuId);
    expect(removal.reason).toBeNull();
    expect(removal.detail).toMatchObject({
      fromVersion: 3,
      toVersion: 4,
      rosterChange: {
        before: { team: { id: archived.id, archivedAt: null } },
        after: { team: { id: archived.id, archivedAt: expect.any(String) } },
      },
    });
    await expect(
      updateCaptains(
        staff,
        edition.slug,
        command(3, { action: "revoke", userId: b.osuId }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateCaptains(
        b,
        edition.slug,
        command(4, { action: "revoke", userId: b.osuId }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db().select().from(editionEvents)).toHaveLength(4);
  });
  it.each(["populated", "finalized"])(
    "rejects unappointment of a %s roster without changing records or auditing success",
    async (state) => {
      await updateCaptains(
        staff,
        edition.slug,
        command(0, { action: "appoint", userId: a.osuId }),
      );
      await updateTeams(
        staff,
        edition.slug,
        command(1, {
          action: "configure",
          teams: [{ captainId: a.osuId, name: "Synthetic A", capacity: null }],
        }),
      );
      const [team] = await db().select().from(teams);
      if (state === "populated")
        await db().insert(memberships).values({
          teamId: team.id,
          editionSlug: edition.slug,
          userId: player.osuId,
          origin: "draft",
        });
      else
        await db()
          .update(teams)
          .set({ finalizedAt: new Date() })
          .where(eq(teams.id, team.id));
      const beforeTeams = await db().select().from(teams);
      const beforeMembers = await db().select().from(memberships);
      await expect(
        updateCaptains(
          staff,
          edition.slug,
          command(2, { action: "revoke", userId: a.osuId }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await db().select().from(teams)).toEqual(beforeTeams);
      expect(await db().select().from(memberships)).toEqual(beforeMembers);
      expect((await captainSetup(staff, edition.slug)).version).toBe(2);
      expect(await captainAppointment(a.osuId, edition.slug)).not.toBeNull();
      expect(await db().select().from(editionEvents)).toHaveLength(2);
    },
  );
  it("requires a real draft-unavailability explanation without demanding reasons for routine appointments", async () => {
    for (const extra of [{}, { unavailableExplanation: " " }])
      await expect(
        updateCaptains(
          staff,
          edition.slug,
          command(0, {
            action: "availability",
            userId: player.osuId,
            available: false,
            ...extra,
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(editionEvents)).toEqual([]);
    await updateCaptains(
      staff,
      edition.slug,
      command(0, {
        action: "availability",
        userId: player.osuId,
        available: false,
        unavailableExplanation: "Organizer verified the player is unavailable.",
      }),
    );
    const excluded = (await db().select().from(registrations)).find(
      (r) => r.userId === player.osuId,
    )!;
    expect(excluded.draftUnavailableReason).toBe(
      "Organizer verified the player is unavailable.",
    );
    await updateCaptains(
      staff,
      edition.slug,
      command(1, {
        action: "availability",
        userId: player.osuId,
        available: true,
      }),
    );
    expect(
      (await captainSetup(staff, edition.slug)).pool.map((p) => p.userId),
    ).toContain(player.osuId);
  });
  it("publishes only deliberately released captain fields and audits replacement/availability", async () => {
    await updateCaptains(
      staff,
      edition.slug,
      command(0, { action: "appoint", userId: a.osuId }),
    );
    expect(await publicCaptains(edition.slug)).toEqual([]);
    await updateCaptains(
      staff,
      edition.slug,
      command(1, {
        action: "replace",
        previousUserId: a.osuId,
        userId: b.osuId,
      }),
    );
    await updateCaptains(
      staff,
      edition.slug,
      command(2, {
        action: "availability",
        unavailableExplanation:
          "Synthetic player unavailable by organizer decision.",
        userId: player.osuId,
        available: false,
      }),
    );
    expect(
      (await captainSetup(staff, edition.slug)).pool.map((p) => p.userId),
    ).toEqual([a.osuId]);
    await updateCaptains(
      staff,
      edition.slug,
      command(3, { action: "publish", published: true, poolPublished: false }),
    );
    expect(await publicCaptains(edition.slug)).toEqual([
      { osuId: b.osuId, username: b.username, position: 0 },
    ]);
    expect(await db().select().from(editionEvents)).toHaveLength(4);
  });
});
