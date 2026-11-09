let fixtureEditions: unknown[];
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
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
  staffRoles,
  staffRoleEvents,
  users,
} from "../../src/db/schema";
import { capabilities, hasCapability, isStaff } from "../../src/lib/auth/staff";
import { changeStaffRole, listStaffRoles } from "../../src/lib/staff-roles";
import {
  listApplications,
  applicationDetails,
} from "../../src/lib/staff-registration-reads";
import { reviewApplication } from "../../src/lib/staff";
import { captainSetup } from "../../src/lib/captain-reads";
import { updateCaptains } from "../../src/lib/captains";
import { staffTeams } from "../../src/lib/team-reads";
import { updateTeams } from "../../src/lib/teams";
import { staffDraft } from "../../src/lib/draft-reads";
import { draftCommand } from "../../src/lib/draft";
import { edition } from "../fixtures/edition";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 170001, username: "Synthetic Bootstrap" };
const operator = { osuId: 170002, username: "Synthetic Operator" };
const player = { osuId: 170003, username: "Synthetic Player" };
const grant = (
  role: "admin" | "mappooler" | "referee",
  editionSlug: string | null = edition.slug,
) => ({
  action: "grant",
  userId: operator.osuId,
  role,
  editionSlug,

  confirmed: true,
});
describe.skipIf(!url)("persistent role authorization", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    fixtureEditions = [edition, { ...edition, slug: "other-test-cup" }];
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    vi.stubEnv("STAFF_OSU_IDS", String(operator.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions(fixtureEditions);
    await db().insert(users).values([admin, operator, player]);
    await db()
      .insert(editionState)
      .values([{ slug: edition.slug }, { slug: "other-test-cup" }])
      .onConflictDoNothing();
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("does not promote legacy staff and grants Admin the full capability set", async () => {
    expect(await isStaff(operator)).toBe(false);
    for (const c of capabilities) {
      expect(await hasCapability(admin, c)).toBe(true);
      expect(await hasCapability(operator, c, edition.slug)).toBe(false);
    }
  });
  it("combines only granted capabilities within their assigned editions", async () => {
    await changeStaffRole(admin, grant("mappooler"));
    await changeStaffRole(admin, grant("referee", "other-test-cup"));
    expect(await hasCapability(operator, "manage_mappools", edition.slug)).toBe(
      true,
    );
    expect(await hasCapability(operator, "record_results", edition.slug)).toBe(
      false,
    );
    expect(
      await hasCapability(operator, "manage_mappools", "other-test-cup"),
    ).toBe(false);
    expect(
      await hasCapability(operator, "record_results", "other-test-cup"),
    ).toBe(true);
    await changeStaffRole(admin, grant("referee"));
    for (const c of capabilities)
      expect(await hasCapability(operator, c, edition.slug)).toBe(
        [
          "manage_mappools",
          "select_mappools",
          "view_replays",
          "record_results",
        ].includes(c),
      );
    expect(await hasCapability(operator, "record_results")).toBe(false);
  });
  it("denies limited roles private registrations, captain/team/draft operations and staff management", async () => {
    await changeStaffRole(admin, grant("mappooler"));
    await changeStaffRole(admin, grant("referee"));
    const [r] = await db()
      .insert(registrations)
      .values({
        userId: player.osuId,
        editionSlug: edition.slug,
        answers: { secret: "Private" },
        rulesVersion: "test",
      })
      .returning();
    for (const call of [
      () => listApplications(operator, {}),
      () => listApplications(operator, {}, true),
      () => applicationDetails(operator, r.id),
      () => reviewApplication(operator, r.id, {}),
      () => captainSetup(operator, edition.slug),
      () => updateCaptains(operator, edition.slug, {}),
      () => staffTeams(operator, edition.slug),
      () => updateTeams(operator, edition.slug, {}),
      () => staffDraft(operator, edition.slug),
      () => draftCommand(operator, edition.slug, {}),
      () => listStaffRoles(operator),
      () => changeStaffRole(operator, grant("admin")),
    ])
      await expect(call()).rejects.toMatchObject({ status: 403 });
  });
  it("enforces scoped admin boundaries on reads, grants and revocations", async () => {
    await changeStaffRole(admin, grant("admin"));
    const global = await changeStaffRole(admin, grant("referee", null));
    const [r] = await db()
      .insert(registrations)
      .values({
        userId: player.osuId,
        editionSlug: "other-test-cup",
        answers: { secret: "Private" },
        rulesVersion: "test",
      })
      .returning();
    expect((await listApplications(operator, {})).total).toBe(0);
    await expect(applicationDetails(operator, r.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      changeStaffRole(operator, grant("admin", null)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      changeStaffRole(operator, grant("referee", "other-test-cup")),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      changeStaffRole(operator, {
        action: "revoke",
        grantId: global.id,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await listStaffRoles(operator)).grants.every(
        (g) => g.grant.editionSlug === edition.slug,
      ),
    ).toBe(true);
  });
  it("revokes immediately for the same user object and records actual actors", async () => {
    const role = await changeStaffRole(admin, grant("mappooler"));
    expect(await hasCapability(operator, "manage_mappools", edition.slug)).toBe(
      true,
    );
    await changeStaffRole(admin, {
      action: "revoke",
      grantId: role.id,

      confirmed: true,
    });
    expect(await hasCapability(operator, "manage_mappools", edition.slug)).toBe(
      false,
    );
    const events = await db()
      .select()
      .from(staffRoleEvents)
      .where(eq(staffRoleEvents.grantId, role.id));
    expect(events.map((e) => e.action).sort()).toEqual(["grant", "revoke"]);
    const granted = events.find((e) => e.action === "grant")!;
    const revoked = events.find((e) => e.action === "revoke")!;
    expect(granted.reason).toBeNull();
    expect(granted.before).toBeNull();
    expect(granted.after).toMatchObject({
      id: role.id,
      userId: operator.osuId,
      role: "mappooler",
      revokedAt: null,
    });
    expect(revoked.before).toMatchObject({ id: role.id, revokedAt: null });
    expect(revoked.after?.revokedAt).toBeTruthy();
    expect(
      events.every(
        (e) =>
          e.actorId === admin.osuId &&
          e.targetId === operator.osuId &&
          e.editionSlug === edition.slug,
      ),
    ).toBe(true);
    expect((await db().select().from(staffRoles))[0].revokedAt).not.toBeNull();
  });
  it("serializes duplicate grants and rejects forged actor fields and unconfirmed changes", async () => {
    const results = await Promise.allSettled([
      changeStaffRole(admin, grant("mappooler")),
      changeStaffRole(admin, grant("mappooler")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect(await db().select().from(staffRoleEvents)).toHaveLength(1);
    await expect(
      changeStaffRole(admin, { ...grant("referee"), actorId: player.osuId }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      changeStaffRole(admin, { ...grant("referee"), confirmed: false }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
