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
  users,
  staffRoles,
  siteSettings,
  siteSettingEvents,
} from "../../src/db/schema";
import {
  siteSettingsForAdmin,
  updateSiteSettings,
  defaultSiteAppearance,
} from "../../src/lib/site-settings";
import { auditLog } from "../../src/lib/audit";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";

const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 1320001, username: "Synthetic Site Admin" };
const operator = { osuId: 1320002, username: "Synthetic Operator" };
const save = (defaultAppearance = "cute-pastel", expectedRevision = 0) => ({
  defaultAppearance,
  expectedRevision,
});
describe.skipIf(!url)("global site appearance settings", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(
      sql`TRUNCATE site_settings, site_setting_events, edition_state, users CASCADE`,
    );
    await seedEditions([edition]);
    await db().insert(users).values([admin, operator]);
  });
  afterAll(async () => {
    await db().execute(sql`TRUNCATE site_settings, site_setting_events`);
    await closeDb();
    vi.unstubAllEnvs();
  });
  it.each(["cute-pastel", "swiss-minimal", "claymorphism"])(
    "saves %s with an authoritative audit event",
    async (appearance) => {
      expect(await siteSettingsForAdmin(admin)).toMatchObject({
        defaultAppearance: "default",
        revision: 0,
      });
      const saved = await updateSiteSettings(admin, save(appearance));
      expect(saved).toMatchObject({
        id: 1,
        defaultAppearance: appearance,
        revision: 1,
      });
      expect(await defaultSiteAppearance()).toBe(appearance);
      const logs = await auditLog(admin, { module: "site" });
      expect(logs.total).toBe(1);
      expect(logs.rows[0]).toMatchObject({
        actorId: admin.osuId,
        username: admin.username,
        edition: null,
        entityType: "site settings",
        entityId: "1",
        action: "site_appearance_changed",
        before: { defaultAppearance: "default", revision: 0 },
        after: { defaultAppearance: appearance, revision: 1 },
      });
      expect(new Date(logs.rows[0].timestamp).getTime()).toBeGreaterThan(
        Date.now() - 30000,
      );
      expect(await updateSiteSettings(admin, save(appearance, 1))).toEqual(
        saved,
      );
      expect(await db().select().from(siteSettingEvents)).toHaveLength(1);
    },
  );
  it.each([
    ["admin", edition.slug],
    ["mappooler", null],
    ["referee", null],
  ] as const)(
    "rejects %s with scope %s on both reads and writes",
    async (role, editionSlug) => {
      await db().insert(staffRoles).values({
        userId: operator.osuId,
        role,
        editionSlug,
        grantedBy: admin.osuId,
      });
      await expect(siteSettingsForAdmin(operator)).rejects.toMatchObject({
        status: 403,
      });
      await expect(updateSiteSettings(operator, save())).rejects.toMatchObject({
        status: 403,
      });
      if (role === "admin")
        expect((await auditLog(operator, { module: "site" })).total).toBe(0);
      expect(await db().select().from(siteSettingEvents)).toHaveLength(0);
    },
  );
  it("allows persistent global Admins, denies ordinary players and applies revocations immediately", async () => {
    await expect(updateSiteSettings(operator, save())).rejects.toMatchObject({
      status: 403,
    });
    const [grant] = await db()
      .insert(staffRoles)
      .values({
        userId: operator.osuId,
        role: "admin",
        editionSlug: null,
        grantedBy: admin.osuId,
      })
      .returning();
    await updateSiteSettings(operator, save());
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.id, grant.id));
    await expect(siteSettingsForAdmin(operator)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      updateSiteSettings(operator, save("default", 1)),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await db().select().from(siteSettingEvents)).map(
        (event) => event.actorId,
      ),
    ).toEqual([operator.osuId]);
  });
  it("rejects forged actor fields and invalid appearance/revision without success events", async () => {
    for (const data of [
      save("dark"),
      save("<script>"),
      save("default", -1),
      { ...save(), actorId: operator.osuId },
      { ...save(), reason: "Fake" },
    ])
      await expect(updateSiteSettings(admin, data)).rejects.toMatchObject({
        status: 400,
      });
    expect(await db().select().from(siteSettingEvents)).toHaveLength(0);
  });
  it("serializes simultaneous first saves and refuses stale editors without overwriting", async () => {
    const results = await Promise.allSettled([
      updateSiteSettings(admin, save()),
      updateSiteSettings(admin, save()),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { status: 409 } });
    await expect(
      updateSiteSettings(admin, save("default")),
    ).rejects.toMatchObject({ status: 409 });
    expect((await siteSettingsForAdmin(admin)).defaultAppearance).toBe(
      "cute-pastel",
    );
    expect(await db().select().from(siteSettingEvents)).toHaveLength(1);
  });
  it("rolls back the settings update when the audit insert fails", async () => {
    await db().insert(siteSettings).values({ id: 1 });
    await db().execute(
      sql`CREATE FUNCTION reject_site_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$`,
    );
    try {
      await db().execute(
        sql`CREATE TRIGGER reject_site_audit_test BEFORE INSERT ON site_setting_events FOR EACH ROW EXECUTE FUNCTION reject_site_audit_test()`,
      );
      await expect(updateSiteSettings(admin, save())).rejects.toThrow();
      expect(await siteSettingsForAdmin(admin)).toMatchObject({
        defaultAppearance: "default",
        revision: 0,
      });
      expect(await db().select().from(siteSettingEvents)).toHaveLength(0);
    } finally {
      await db().execute(
        sql`DROP TRIGGER IF EXISTS reject_site_audit_test ON site_setting_events`,
      );
      await db().execute(sql`DROP FUNCTION reject_site_audit_test()`);
    }
  });
});
