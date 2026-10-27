import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  registrations,
  fixtures,
  staffRoles,
  staffRoleEvents,
  users,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedResultReview } from "../fixtures/results";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { statisticsArchive } from "../fixtures/archive-statistics";
import {
  capabilities,
  canRead,
  hasCapability,
  permits,
  staffAccess,
  type StaffGrant,
} from "../../src/lib/auth/staff";
import { changeStaffRole, listStaffRoles } from "../../src/lib/staff-roles";
import {
  applicationDetails,
  listApplications,
  exportApplications,
} from "../../src/lib/staff";
import { tournamentForAdmin, tournamentList } from "../../src/lib/tournaments";
import { siteSettingsForAdmin } from "../../src/lib/site-settings";
import { auditLog } from "../../src/lib/audit";
import { staffTeams } from "../../src/lib/teams";
import { captainSetup } from "../../src/lib/captains";
import { staffDraft } from "../../src/lib/draft";
import { mappoolWorkspace, mappoolCommand } from "../../src/lib/mappools";
import { staffFixtures } from "../../src/lib/fixtures";
import { matchReview, previewFixtureMatch } from "../../src/lib/results";
import { statisticsWorkspace } from "../../src/lib/archive-statistics";
import { awardWorkspace } from "../../src/lib/awards";
import { HttpError } from "../../src/lib/http";

const session = vi.hoisted(() => ({
  user: null as { osuId: number; username: string } | null,
}));
vi.mock("@/lib/auth/user", () => ({
  currentUser: async () => session.user,
  requireUser: async () => {
    if (!session.user)
      throw new HttpError(401, "Sign in with osu! to continue.");
    return session.user;
  },
}));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 1860001, username: "Synthetic Admin" };
const developer = { osuId: 1860002, username: "Synthetic Developer" };
const referee = { osuId: 1860003, username: "Synthetic Referee" };
const other = { osuId: 1860004, username: "Synthetic Scoped Admin" };
const grant = (
  userId = developer.osuId,
  role = "developer",
  editionSlug: string | null = null,
) => ({ action: "grant", userId, role, editionSlug, confirmed: true });
async function snapshot() {
  const tables = await db().execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const state: Record<string, unknown> = {};
  for (const { tablename } of tables.rows) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error("Unexpected test table");
    const rows = await db().execute(
      sql.raw(
        `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') AS rows FROM "${tablename}" t`,
      ),
    );
    state[tablename] = rows.rows[0].rows;
  }
  return state;
}
let fixtureId: string, registrationId: string, teamId: string;
describe.skipIf(!url)(
  "global Developer read access and complete mutation inventory",
  () => {
    beforeAll(() => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
      vi.stubEnv("APP_URL", "http://localhost:3000");
    });
    beforeEach(async () => {
      await db().execute(
        sql`TRUNCATE edition_state, users, site_settings, site_setting_events CASCADE`,
      );
      await db().insert(users).values([admin, developer, referee, other]);
      const result = await seedResultReview(
        admin.osuId,
        referee.osuId,
        1860100,
        "group",
        true,
      );
      fixtureId = result.fixtureId;
      await db().insert(fixtures).values({
        editionSlug: "test-cup",
        roundId: result.context.round.id,
        label: "Private dependent fixture",
        position: 2,
        homeSourceId: fixtureId,
        homeSourceOutcome: "winner",
        timeZone: "UTC",
      });
      teamId = result.home.teamId;
      const [registration] = await db()
        .select()
        .from(registrations)
        .where(eq(registrations.userId, 1860102));
      registrationId = registration.id;
      await seedEditions(
        [
          {
            ...edition,
            slug: "s7",
            published: false,
            status: "completed",
            registration: null,
            archive: statisticsArchive,
          },
        ],
        false,
      );
      await changeStaffRole(admin, grant());
      session.user = developer;
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it("reads global and unpublished edition workspaces, details and history without creating any data or contacting providers", async () => {
      const before = await snapshot();
      const network = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Developer must not fetch provider data"));
      try {
        const grants = await staffAccess(developer);
        for (const capability of capabilities) {
          expect(canRead(grants, capability, "private-test-cup")).toBe(true);
          expect(await hasCapability(developer, capability, "test-cup")).toBe(
            false,
          );
        }
        expect((await listStaffRoles(developer)).scopes).toBeNull();
        expect(
          (await tournamentList(developer)).rows.some(
            (r) => r.slug === "private-test-cup",
          ),
        ).toBe(true);
        expect((await tournamentList(developer)).canCreate).toBe(false);
        expect(
          (await tournamentForAdmin(developer, "private-test-cup")).edition
            .published,
        ).toBe(false);
        expect(
          (await tournamentForAdmin(developer, "test-cup")).links,
        ).toHaveLength(12);
        expect((await listApplications(developer, {})).total).toBeGreaterThan(
          0,
        );
        expect(
          (await applicationDetails(developer, registrationId)).registration
            .answers,
        ).toMatchObject({ private: "SYNTHETIC_PRIVATE_CONTACT" });
        await siteSettingsForAdmin(developer);
        await auditLog(developer, {});
        await captainSetup(developer, "test-cup");
        await staffTeams(developer, "test-cup");
        await staffDraft(developer, "private-test-cup");
        await mappoolWorkspace(developer, "test-cup");
        const fixtures = await staffFixtures(developer, "test-cup");
        expect(fixtures.fixtures.some((f) => f.id === fixtureId)).toBe(true);
        expect(fixtures.canManage).toBe(false);
        const review = await matchReview(developer, "test-cup", fixtureId);
        expect(review.source).toBeTruthy();
        expect(review.context.canApprove).toBe(false);
        expect(review.context.canRecord).toBe(false);
        expect(
          review.dependents.some(
            (f) => f.label === "Private dependent fixture",
          ),
        ).toBe(true);
        await statisticsWorkspace(developer, "s7");
        await awardWorkspace(developer, "test-cup");
        expect(network).not.toHaveBeenCalled();
        expect(await snapshot()).toEqual(before);
      } finally {
        network.mockRestore();
      }
    });

    it("rejects every actual admin mutation route, including uploads and import previews, without writes, audit events or provider I/O", async () => {
      const before = await snapshot();
      const network = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("No provider I/O"));
      const files = (
        readdirSync("src/app/api/admin", { recursive: true }) as string[]
      )
        .filter((f) => f.endsWith("route.ts"))
        .sort();
      let checked = 0;
      try {
        for (const file of files) {
          const normalizedFile = file.replaceAll("\\", "/");
          const route = await import(
            /* @vite-ignore */ `../../src/app/api/admin/${file}`
          );
          for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            if (!route[method]) continue;
            let body: unknown = { confirmed: true };
            if (normalizedFile.endsWith("awards/route.ts"))
              body = {
                action: "configure",
                expectedVersion: 0,
                confirmed: true,
                weeks: [],
              };
            if (normalizedFile.endsWith("statistics/route.ts"))
              body = { action: "import", mpId: 999177, expectedVersion: 0 };
            if (normalizedFile.endsWith("imports/route.ts"))
              body = {
                match: "999001",
                expectedVersion: 1,
                expectedFixtureVersion: 1,
                requestKey: randomUUID(),
                confirmed: true,
              };
            if (normalizedFile === "profiles/route.ts")
              body = { input: "1860100", mode: "osu", refresh: true };
            const routePath = normalizedFile.replace(/\/route.ts$/, "");
            const request = new Request(
              `http://localhost:3000/api/admin/${routePath}`,
              {
                method,
                headers: {
                  origin: "http://localhost:3000",
                  "content-type": "application/json",
                },
                body: JSON.stringify(body),
              },
            );
            const response = await route[method](request, {
              params: Promise.resolve({
                edition: "test-cup",
                fixtureId,
                teamId,
                id: registrationId,
              }),
            });
            expect(
              response.status,
              `${method} ${file}: ${await response.text()}`,
            ).toBe(403);
            checked++;
          }
        }
        expect(checked).toBeGreaterThanOrEqual(24);
        await expect(exportApplications(developer, {})).rejects.toMatchObject({
          status: 403,
        });
        expect(network).not.toHaveBeenCalled();
        expect(await snapshot()).toEqual(before);
      } finally {
        network.mockRestore();
      }
    });

    it("adds reads without widening another role's write scope, exports or referee assignment", async () => {
      await changeStaffRole(
        admin,
        grant(developer.osuId, "mappooler", "test-cup"),
      );
      expect(
        await hasCapability(developer, "manage_mappools", "test-cup"),
      ).toBe(true);
      expect(
        await hasCapability(developer, "manage_mappools", "private-test-cup"),
      ).toBe(false);
      expect(
        await hasCapability(developer, "manage_registrations", "test-cup"),
      ).toBe(false);
      await mappoolCommand(developer, "test-cup", {
        action: "round_create",
        stage: "group",
        name: "Independent mappooler permission",
        position: 2,
        confirmed: true,
      });
      await expect(exportApplications(developer, {})).rejects.toMatchObject({
        status: 403,
      });
      await changeStaffRole(
        admin,
        grant(developer.osuId, "admin", "private-test-cup"),
      );
      expect(
        await hasCapability(
          developer,
          "configure_tournament",
          "private-test-cup",
        ),
      ).toBe(true);
      expect(
        await hasCapability(developer, "configure_tournament", "test-cup"),
      ).toBe(false);
      expect(await exportApplications(developer, {})).toEqual([]);
      await changeStaffRole(
        admin,
        grant(developer.osuId, "referee", "test-cup"),
      );
      await expect(
        previewFixtureMatch(developer, "test-cup", fixtureId, {
          match: "999001",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await changeStaffRole(admin, grant(developer.osuId, "admin", null));
      expect((await exportApplications(developer, {})).length).toBeGreaterThan(
        0,
      );
      const all: StaffGrant[] = [
        { role: "developer", editionSlug: null },
        { role: "admin", editionSlug: null },
      ];
      for (const capability of capabilities)
        expect(permits(all, capability, "anything")).toBe(true);
    });

    it("requires a global Admin grant, rejects scoped Developer grants, and revokes on the next request using the same session", async () => {
      await changeStaffRole(admin, grant(other.osuId, "admin", "test-cup"));
      await expect(
        changeStaffRole(other, grant(1860100)),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        changeStaffRole(admin, grant(1860100, "developer", "test-cup")),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        changeStaffRole(developer, grant(1860100, "admin")),
      ).rejects.toMatchObject({ status: 403 });
      const [g] = await db()
        .select()
        .from(staffRoles)
        .where(eq(staffRoles.userId, developer.osuId));
      await changeStaffRole(admin, {
        action: "revoke",
        grantId: g.id,
        confirmed: true,
      });
      await expect(listApplications(developer, {})).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        tournamentForAdmin(developer, "private-test-cup"),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        matchReview(developer, "test-cup", fixtureId),
      ).rejects.toMatchObject({ status: 403 });
      const events = await db()
        .select()
        .from(staffRoleEvents)
        .where(eq(staffRoleEvents.grantId, g.id));
      expect(events.map((e) => e.action).sort()).toEqual(["grant", "revoke"]);
      expect(
        events.every(
          (e) => e.actorId === admin.osuId && e.targetId === developer.osuId,
        ),
      ).toBe(true);
    });
  },
);
