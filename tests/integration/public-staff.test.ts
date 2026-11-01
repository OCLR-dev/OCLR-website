import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { users, staffRoleEvents, userProfileCache } from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { changeStaffRole } from "../../src/lib/staff-roles";
import { publicStaff } from "../../src/lib/public-staff";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 491001, username: "PRIVATE_BOOTSTRAP" };
const scoped = { osuId: 491002, username: "Private Scoped Admin" };
const member = { osuId: 491003, username: "Published Staff" };
const player = { osuId: 491004, username: "Private Player" };
function grant(
  userId: number,
  role: "admin" | "mappooler" | "referee",
  editionSlug: string | null = "test-cup",
) {
  return changeStaffRole(admin, {
    action: "grant",
    userId,
    role,
    editionSlug,
    confirmed: true,
  });
}
function visibility(
  grantId: string,
  published: boolean,
  expectedPublished = !published,
) {
  return {
    action: "visibility",
    grantId,
    published,
    expectedPublished,
    confirmed: true,
  };
}
describe.skipIf(!url)("public Staff visibility", () => {
  beforeEach(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([
      edition,
      {
        ...edition,
        slug: "private-cup",
        name: "PRIVATE_EDITION",
        published: false,
      },
    ]);
    await db().insert(users).values([admin, scoped, member, player]);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("defaults public, deduplicates active grants and withholds hidden or unpublished scopes", async () => {
    const map = await grant(member.osuId, "mappooler");
    const ref = await grant(member.osuId, "referee");
    const hidden = await grant(member.osuId, "admin", "private-cup");
    expect(map.aboutPublished).toBe(true);
    expect(hidden.aboutPublished).toBe(true);
    expect((await publicStaff())[0].roles).toHaveLength(2);
    await changeStaffRole(admin, visibility(ref.id, false));
    expect(await publicStaff()).toEqual([
      {
        ...member,
        countryCode: null,
        roles: [
          {
            role: "mappooler",
            edition: { slug: edition.slug, name: edition.name },
          },
        ],
      },
    ]);
    await changeStaffRole(admin, visibility(ref.id, true));
    expect((await publicStaff())[0].roles).toHaveLength(2);
    const json = JSON.stringify(await publicStaff());
    expect(json).not.toMatch(
      /PRIVATE_|grantedBy|grantedAt|grantId|revokedAt|answers/,
    );
    await changeStaffRole(admin, {
      action: "revoke",
      grantId: ref.id,
      confirmed: true,
    });
    expect((await publicStaff())[0].roles).toHaveLength(1);
    await changeStaffRole(admin, visibility(map.id, false));
    expect(await publicStaff()).toEqual([]);
  });
  it("reads only the cached official country for approved staff, without provider calls", async () => {
    const profile = {
      countryCode: "TW",
      privateContact: "NEVER_PUBLIC",
    } as unknown as import("../../src/lib/osu-profile-model").OsuUserProfile;
    await db().insert(userProfileCache).values({
      osuId: member.osuId,
      mode: "osu",
      profile,
      attemptedAt: new Date(),
      retryAt: new Date(),
    });
    await grant(member.osuId, "mappooler");
    expect((await publicStaff())[0].countryCode).toBe("TW");
    expect(JSON.stringify(await publicStaff())).not.toContain("NEVER_PUBLIC");
    await db().execute(sql`UPDATE user_profile_cache SET error_status=404`);
    expect((await publicStaff())[0].countryCode).toBeNull();
  });
  it("enforces permission scope, conflicts and atomic server-derived audit events", async () => {
    await grant(scoped.osuId, "admin", "private-cup");
    const map = await grant(member.osuId, "mappooler");
    await changeStaffRole(admin, visibility(map.id, false));
    for (const actor of [scoped, member, player])
      await expect(
        changeStaffRole(actor, visibility(map.id, true)),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      changeStaffRole(admin, {
        ...visibility(map.id, true),
        actorId: player.osuId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    const auditBefore = (await db().select().from(staffRoleEvents)).length;
    const changes = await Promise.allSettled([
      changeStaffRole(admin, visibility(map.id, true)),
      changeStaffRole(admin, visibility(map.id, true)),
    ]);
    expect(changes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(changes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const audit = await db().select().from(staffRoleEvents);
    expect(audit).toHaveLength(auditBefore + 1);
    expect(audit.at(-1)).toMatchObject({
      actorId: admin.osuId,
      action: "publish_profile",
      editionSlug: edition.slug,
      before: { aboutPublished: false },
      after: { aboutPublished: true },
    });
    await changeStaffRole(admin, visibility(map.id, true, true));
    expect(await db().select().from(staffRoleEvents)).toEqual(audit);
    await changeStaffRole(admin, {
      action: "revoke",
      grantId: map.id,
      confirmed: true,
    });
    await expect(
      changeStaffRole(admin, visibility(map.id, true, true)),
    ).rejects.toMatchObject({ status: 409 });
    expect(await publicStaff()).toEqual([]);
  });
});
