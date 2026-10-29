import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { users, staffRoles, staffRoleEvents } from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { changeStaffRole, changeStaffRoleSet } from "../../src/lib/staff-roles";
import {
  capabilities,
  canRead,
  staffAccess,
  permits,
} from "../../src/lib/auth/staff";
import { publicStaff } from "../../src/lib/public-staff";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 496001, username: "Synthetic Admin" };
const scoped = { osuId: 496002, username: "Synthetic Scoped Admin" };
const member = { osuId: 496003, username: "Synthetic Staff" };
function command(
  roles: string[],
  ids: string[] = [],
  scope: string | null = "test-cup",
) {
  return {
    action: "set_roles",
    confirmed: true,
    userId: member.osuId,
    editionSlug: scope,
    roles,
    expectedGrantIds: ids,
  };
}
describe.skipIf(!url)("atomic staff role sets", () => {
  beforeEach(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([edition, { ...edition, slug: "other-test" }]);
    await db().insert(users).values([admin, scoped, member]);
    await changeStaffRole(admin, {
      action: "grant",
      confirmed: true,
      userId: scoped.osuId,
      role: "admin",
      editionSlug: "test-cup",
    });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it.each([null, "test-cup"])(
    "manages Designer in scope %s without granting capabilities",
    async (scope) => {
      const actor = scope ? scoped : admin;
      const { grants } = await changeStaffRoleSet(
        actor,
        command(["designer"], [], scope),
      );
      const designer = grants[0];
      expect(designer).toMatchObject({
        role: "designer",
        editionSlug: scope,
        aboutPublished: false,
      });
      expect(await publicStaff()).toEqual([]);
      const access = await staffAccess(member);
      for (const capability of capabilities) {
        expect(permits(access, capability, "test-cup")).toBe(false);
        expect(canRead(access, capability, "test-cup")).toBe(false);
      }
      await expect(
        changeStaffRoleSet(member, command(["admin"], [designer.id], scope)),
      ).rejects.toMatchObject({ status: 403 });
      await changeStaffRole(actor, {
        action: "visibility",
        confirmed: true,
        grantId: designer.id,
        expectedPublished: false,
        published: true,
      });
      expect((await publicStaff())[0].roles[0]).toMatchObject({
        role: "designer",
        edition: scope ? { slug: scope } : null,
      });
      const updated = await changeStaffRoleSet(
        actor,
        command(["designer", "referee"], [designer.id], scope),
      );
      expect(updated.grants.find((g) => g.role === "designer")).toMatchObject({
        id: designer.id,
        aboutPublished: true,
      });
      await expect(
        changeStaffRoleSet(actor, command([], [designer.id], scope)),
      ).rejects.toMatchObject({ status: 409 });
      await changeStaffRoleSet(
        actor,
        command(
          ["referee"],
          updated.grants.map((g) => g.id),
          scope,
        ),
      );
      expect((await staffAccess(member)).map((g) => g.role)).toEqual([
        "referee",
      ]);
      expect(await publicStaff()).toEqual([]);
      const events = await db()
        .select()
        .from(staffRoleEvents)
        .where(eq(staffRoleEvents.targetId, member.osuId));
      expect(
        events.filter((e) => e.role === "designer").map((e) => e.action),
      ).toEqual(["grant", "publish_profile", "revoke"]);
      expect(events.every((e) => e.actorId === actor.osuId)).toBe(true);
    },
  );
  it("denies cross-edition and global Designer assignments by scoped Admins", async () => {
    for (const scope of [null, "other-test"])
      await expect(
        changeStaffRoleSet(scoped, command(["designer"], [], scope)),
      ).rejects.toMatchObject({ status: 403 });
    const grant = await changeStaffRole(admin, {
      action: "grant",
      confirmed: true,
      userId: member.osuId,
      role: "designer",
      editionSlug: "other-test",
    });
    await expect(
      changeStaffRole(scoped, {
        action: "revoke",
        confirmed: true,
        grantId: grant.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await staffAccess(member))[0]).toMatchObject({
      role: "designer",
      editionSlug: "other-test",
    });
  });
  it("adds multiple roles, edits one scope, preserves retained visibility and revokes live access", async () => {
    const initial = await changeStaffRoleSet(
      scoped,
      command(["mappooler", "referee"]),
    );
    expect(initial.grants).toHaveLength(2);
    expect(initial.grants.every((g) => !g.aboutPublished)).toBe(true);
    const map = initial.grants.find((g) => g.role === "mappooler")!;
    await changeStaffRole(admin, {
      action: "visibility",
      confirmed: true,
      grantId: map.id,
      expectedPublished: false,
      published: true,
    });
    await changeStaffRoleSet(admin, command(["streamer"], [], "other-test"));
    const updated = await changeStaffRoleSet(
      scoped,
      command(
        ["mappooler", "tester"],
        initial.grants.map((g) => g.id),
      ),
    );
    expect(updated.grants.find((g) => g.role === "mappooler")).toMatchObject({
      id: map.id,
      aboutPublished: true,
    });
    expect(
      updated.grants.find((g) => g.role === "tester")?.aboutPublished,
    ).toBe(false);
    const access = await staffAccess(member);
    expect(permits(access, "manage_mappools", "test-cup")).toBe(true);
    expect(permits(access, "manage_replays", "test-cup")).toBe(true);
    expect(permits(access, "record_results", "test-cup")).toBe(false);
    expect(permits(access, "select_streaming", "other-test")).toBe(true);
    const events = await db()
      .select()
      .from(staffRoleEvents)
      .where(eq(staffRoleEvents.targetId, member.osuId));
    expect(events.filter((e) => e.action === "grant")).toHaveLength(4);
    expect(events.filter((e) => e.action === "revoke")).toHaveLength(1);
    expect(events.find((e) => e.action === "revoke")?.before).toBeTruthy();
    await changeStaffRoleSet(
      scoped,
      command(
        [],
        updated.grants.map((g) => g.id),
      ),
    );
    expect((await staffAccess(member)).map((g) => g.editionSlug)).toEqual([
      "other-test",
    ]);
  });
  it("rejects invalid or unauthorized sets without partial grants", async () => {
    for (const input of [
      command(["referee", "invalid"]),
      command(["referee", "referee"]),
      command(["referee", "developer"]),
    ]) {
      await expect(changeStaffRoleSet(scoped, input)).rejects.toMatchObject({
        status: 400,
      });
    }
    for (const scope of [null, "other-test"]) {
      await expect(
        changeStaffRoleSet(scoped, command(["admin", "referee"], [], scope)),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      changeStaffRoleSet(member, command(["admin"])),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await db()
        .select()
        .from(staffRoles)
        .where(eq(staffRoles.userId, member.osuId)),
    ).toEqual([]);
    expect(
      await db()
        .select()
        .from(staffRoleEvents)
        .where(eq(staffRoleEvents.targetId, member.osuId)),
    ).toEqual([]);
  });
  it("serializes competing edits and rejects stale/replayed commands", async () => {
    const { grants } = await changeStaffRoleSet(admin, command(["referee"]));
    const ids = grants.map((g) => g.id);
    const results = await Promise.allSettled([
      changeStaffRoleSet(admin, command(["referee", "mappooler"], ids)),
      changeStaffRoleSet(admin, command(["referee", "tester"], ids)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    await expect(
      changeStaffRoleSet(admin, command(["referee", "streamer"], ids)),
    ).rejects.toMatchObject({ status: 409 });
    expect(await staffAccess(member)).toHaveLength(2);
  });
  it("is compatible with single-role grants and detects a legacy revocation", async () => {
    const grant = await changeStaffRole(admin, {
      action: "grant",
      confirmed: true,
      userId: member.osuId,
      role: "referee",
      editionSlug: "test-cup",
    });
    await changeStaffRole(admin, {
      action: "revoke",
      confirmed: true,
      grantId: grant.id,
    });
    await expect(
      changeStaffRoleSet(admin, command(["referee", "tester"], [grant.id])),
    ).rejects.toMatchObject({ status: 409 });
    expect(await staffAccess(member)).toEqual([]);
  });
});
