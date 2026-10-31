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
  users,
  memberships,
  teams,
  teamCoaches,
  staffRoles,
  editionEvents,
} from "../../src/db/schema";
import { captainSetup, updateCaptains } from "../../src/lib/captains";
import {
  staffTeams,
  updateTeams,
  ownTeam,
  publishedTeams,
} from "../../src/lib/teams";
import { edition } from "../fixtures/edition";
import { tournamentCommand, readTournament } from "../../src/lib/tournaments";
import { publicPlayers } from "../../src/lib/players";
import { getOsuUserProfile } from "../../src/lib/osu-profiles";
vi.mock("../../src/lib/osu-profiles", () => ({ getOsuUserProfile: vi.fn() }));
const coach = { osuId: 90101, username: "Synthetic Coach" };
const url = process.env.TEST_DATABASE_URL;
const staff = { osuId: 90001, username: "Synthetic Staff" };
const a = { osuId: 90002, username: "Synthetic Captain A" };
const b = { osuId: 90003, username: "Synthetic Captain B" };
const player = { osuId: 90004, username: "Synthetic Pool Player" };
const command = (expectedVersion: number, value: Record<string, unknown>) => ({
  command: value,
  expectedVersion,

  confirmed: true,
});
describe.skipIf(!url)(
  "team ownership, membership uniqueness and publication",
  () => {
    beforeAll(() => {
      assertTestDatabase(url);
      fixtureEditions = [edition];
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", String(staff.osuId));
    });
    beforeEach(async () => {
      vi.mocked(getOsuUserProfile).mockReset();
      vi.mocked(getOsuUserProfile).mockResolvedValue({
        profile: coach,
        stale: false,
      } as Awaited<ReturnType<typeof getOsuUserProfile>>);
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
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    async function configure() {
      return updateTeams(
        staff,
        edition.slug,
        command(2, {
          action: "configure",
          teams: [
            { captainId: a.osuId, name: "Synthetic Team A", capacity: 2 },
            { captainId: b.osuId, name: "Synthetic Team B", capacity: 2 },
          ],
        }),
      );
    }
    it("creates a private captain team on appointment and applies tournament capacity to every team", async () => {
      const initial = await staffTeams(staff, edition.slug);
      expect(initial.teams).toHaveLength(2);
      for (const team of initial.teams) {
        expect(team.members.map((m) => m.osuId)).toEqual([team.captainId]);
        expect(team.identityPublished).toBe(false);
        expect(team.rosterPublished).toBe(false);
      }
      const saved = (await readTournament(edition.slug))!;
      const e = saved.edition;
      const general = (rosterCapacity: number | null) =>
        tournamentCommand(staff, edition.slug, {
          action: "general",
          expectedRevision: saved.revision,
          confirmed: true,
          name: e.name,
          season: e.season,
          summary: e.summary,
          status: e.status,
          timeZone: e.timeZone,
          branding: e.branding,
          rosterCapacity,
        });
      const initialTeam = initial.teams[0];
      await db()
        .insert(memberships)
        .values({
          editionSlug: edition.slug,
          teamId: initialTeam.id,
          userId: player.osuId,
          origin: "synthetic_test",
        });
      await expect(general(1)).rejects.toMatchObject({ status: 409 });
      expect((await readTournament(edition.slug))!.revision).toBe(
        saved.revision,
      );
      expect((await staffTeams(staff, edition.slug)).version).toBe(
        initial.version,
      );
      await db()
        .delete(memberships)
        .where(eq(memberships.userId, player.osuId));
      await general(2);
      const configured = await staffTeams(staff, edition.slug);
      expect(configured.teams.map((t) => t.capacity)).toEqual([2, 2]);
      await expect(
        updateTeams(
          staff,
          edition.slug,
          command(configured.version, {
            action: "edit",
            teamId: configured.teams[0].id,
            name: "Renamed",
            capacity: 3,
            avatarKey: null,
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      await updateCaptains(
        staff,
        edition.slug,
        command(configured.version, {
          action: "appoint",
          userId: player.osuId,
        }),
      );
      expect(
        (await staffTeams(staff, edition.slug)).teams.map((t) => t.capacity),
      ).toEqual([2, 2, 2]);
    });
    it("creates exactly one team per captain and prevents captain access to staff mutations", async () => {
      const data = await configure();
      expect(data.teams).toHaveLength(2);
      expect(data.teams.every((t) => t.members.length === 1)).toBe(true);
      expect((await ownTeam(a.osuId, edition.slug))?.captainId).toBe(a.osuId);
      expect(await ownTeam(player.osuId, edition.slug)).toBeNull();
      await expect(staffTeams(a, edition.slug)).rejects.toMatchObject({
        status: 403,
      });
      await expect(updateTeams(a, edition.slug, {})).rejects.toMatchObject({
        status: 403,
      });
    });
    it("enforces one active membership per edition at the database level under concurrency", async () => {
      const data = await configure();
      const results = await Promise.allSettled(
        data.teams.map((t) =>
          db().insert(memberships).values({
            editionSlug: edition.slug,
            teamId: t.id,
            userId: player.osuId,
            origin: "synthetic_test",
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await captainSetup(staff, edition.slug)).pool).toHaveLength(0);
      await expect(
        db().insert(memberships).values({
          editionSlug: "wrong-edition",
          teamId: data.teams[0].id,
          userId: player.osuId,
          origin: "synthetic_test",
        }),
      ).rejects.toThrow();
    });
    it("keeps identity/roster private until separately approved and finalized", async () => {
      const data = await configure();
      const team = data.teams[0];
      expect(await publishedTeams(edition.slug)).toEqual([]);
      await expect(
        updateTeams(
          staff,
          edition.slug,
          command(3, {
            action: "publish",
            teamId: team.id,
            identityPublished: true,
            rosterPublished: false,
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      await updateCaptains(
        staff,
        edition.slug,
        command(3, {
          action: "publish",
          published: true,
          poolPublished: false,
        }),
      );
      await updateTeams(
        staff,
        edition.slug,
        command(4, {
          action: "publish",
          teamId: team.id,
          identityPublished: true,
          rosterPublished: false,
        }),
      );
      expect((await publishedTeams(edition.slug))[0].members).toBeNull();
      await expect(
        updateTeams(
          staff,
          edition.slug,
          command(5, {
            action: "publish",
            teamId: team.id,
            identityPublished: true,
            rosterPublished: true,
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      // Synthetic finalization fixture; production finalization is exclusively the draft command.
      await db()
        .update(teams)
        .set({ finalizedAt: new Date() })
        .where(eq(teams.id, team.id));
      await updateTeams(
        staff,
        edition.slug,
        command(5, {
          action: "publish",
          teamId: team.id,
          identityPublished: true,
          rosterPublished: true,
        }),
      );
      expect((await publishedTeams(edition.slug))[0].members).toHaveLength(1);
    });
    it("locks coach writes when disabled and retains assignments for re-enabling", async () => {
      const data = await configure();
      const team = data.teams[0];
      await updateTeams(
        staff,
        edition.slug,
        command(data.version, {
          action: "add_coach",
          teamId: team.id,
          userId: coach.osuId,
        }),
      );
      await db().execute(
        sql`UPDATE edition_state SET configuration = configuration || '{"coachesEnabled":false}'::jsonb WHERE slug = ${edition.slug}`,
      );
      const disabled = await staffTeams(staff, edition.slug);
      expect(disabled.coachesEnabled).toBe(false);
      expect(disabled.teams[0].coaches).toHaveLength(1);
      vi.mocked(getOsuUserProfile).mockClear();
      for (const action of ["add_coach", "remove_coach"]) {
        await expect(
          updateTeams(
            staff,
            edition.slug,
            command(disabled.version, {
              action,
              teamId: team.id,
              userId: coach.osuId,
            }),
          ),
        ).rejects.toMatchObject({ status: 409 });
      }
      expect(getOsuUserProfile).not.toHaveBeenCalled();
      await db().execute(
        sql`UPDATE edition_state SET configuration = configuration || '{"coachesEnabled":true}'::jsonb WHERE slug = ${edition.slug}`,
      );
      expect(
        (await staffTeams(staff, edition.slug)).teams[0].coaches,
      ).toHaveLength(1);
      await updateTeams(
        staff,
        edition.slug,
        command(disabled.version, {
          action: "remove_coach",
          teamId: team.id,
          userId: coach.osuId,
        }),
      );
      expect(
        (await staffTeams(staff, edition.slug)).teams[0].coaches,
      ).toHaveLength(0);
    });
    it("assigns verified coaches without adding players, capacity usage, registration or staff grants", async () => {
      const configured = await configure(),
        team = configured.teams[0];
      const data = await updateTeams(
        staff,
        edition.slug,
        command(3, {
          action: "add_coach",
          teamId: team.id,
          userId: coach.osuId,
        }),
      );
      expect(data.teams[0].coaches).toEqual([expect.objectContaining(coach)]);
      expect(data.teams[0].members).toHaveLength(1);
      expect((await captainSetup(staff, edition.slug)).pool).toHaveLength(1);
      expect(
        await db()
          .select()
          .from(registrations)
          .where(eq(registrations.userId, coach.osuId)),
      ).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(staffRoles)
          .where(eq(staffRoles.userId, coach.osuId)),
      ).toHaveLength(0);
      expect(await ownTeam(coach.osuId, edition.slug)).toBeNull();
      await expect(
        updateTeams(
          coach,
          edition.slug,
          command(4, {
            action: "remove_coach",
            teamId: team.id,
            userId: coach.osuId,
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      // A duplicate cannot create a second assignment; a stale retry conflicts.
      await updateTeams(
        staff,
        edition.slug,
        command(4, {
          action: "add_coach",
          teamId: team.id,
          userId: coach.osuId,
        }),
      );
      expect(await db().select().from(teamCoaches)).toHaveLength(1);
      await expect(
        updateTeams(
          staff,
          edition.slug,
          command(4, {
            action: "remove_coach",
            teamId: team.id,
            userId: coach.osuId,
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const [audit] = await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.kind, "team_add_coach"));
      expect(audit.detail).toMatchObject({
        coachesBefore: [],
        coachesAfter: [expect.objectContaining({ userId: coach.osuId })],
      });
    });
    it("releases coach identities only with finalized public rosters and removes them immediately", async () => {
      const configured = await configure(),
        team = configured.teams[0];
      await updateTeams(
        staff,
        edition.slug,
        command(3, {
          action: "add_coach",
          teamId: team.id,
          userId: coach.osuId,
        }),
      );
      expect(
        (await publicPlayers({ edition: edition.slug }, coach.osuId)).rows,
      ).toEqual([]);
      await updateCaptains(
        staff,
        edition.slug,
        command(4, {
          action: "publish",
          published: true,
          poolPublished: false,
        }),
      );
      await updateTeams(
        staff,
        edition.slug,
        command(5, {
          action: "publish",
          teamId: team.id,
          identityPublished: true,
          rosterPublished: false,
        }),
      );
      expect((await publishedTeams(edition.slug))[0].coaches).toEqual([]);
      await db()
        .update(teams)
        .set({ finalizedAt: new Date() })
        .where(eq(teams.id, team.id));
      await updateTeams(
        staff,
        edition.slug,
        command(6, {
          action: "publish",
          teamId: team.id,
          identityPublished: true,
          rosterPublished: true,
        }),
      );
      expect((await publishedTeams(edition.slug))[0].coaches).toEqual([coach]);
      expect(
        (await publicPlayers({ edition: edition.slug }, coach.osuId)).rows[0],
      ).toMatchObject({
        participation: "coach",
        coachedTeams: [{ id: team.id, name: team.name }],
      });
      await updateTeams(
        staff,
        edition.slug,
        command(7, {
          action: "remove_coach",
          teamId: team.id,
          userId: coach.osuId,
        }),
      );
      expect((await publishedTeams(edition.slug))[0].members).toHaveLength(1);
      expect(
        (await publicPlayers({ edition: edition.slug }, coach.osuId)).rows,
      ).toEqual([]);
    });
    it("rejects invalid, unknown, archived and cross-edition teams without leaking writes", async () => {
      const configured = await configure(),
        team = configured.teams[0];
      await expect(
        updateTeams(
          staff,
          edition.slug,
          command(3, { action: "add_coach", teamId: team.id, userId: 0 }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      await db()
        .update(teams)
        .set({ archivedAt: new Date() })
        .where(eq(teams.id, team.id));
      await expect(
        updateTeams(
          staff,
          edition.slug,
          command(3, {
            action: "add_coach",
            teamId: team.id,
            userId: coach.osuId,
          }),
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(getOsuUserProfile).not.toHaveBeenCalled();
      await db().insert(users).values(coach);
      await expect(
        db().insert(teamCoaches).values({
          teamId: configured.teams[1].id,
          editionSlug: "wrong-edition",
          userId: coach.osuId,
        }),
      ).rejects.toThrow();
      expect(await db().select().from(teamCoaches)).toHaveLength(0);
    });
    it("serializes competing coach updates and rejects unavailable identity data", async () => {
      const configured = await configure(),
        team = configured.teams[0];
      vi.mocked(getOsuUserProfile).mockResolvedValueOnce({
        profile: coach,
        stale: true,
      } as Awaited<ReturnType<typeof getOsuUserProfile>>);
      await expect(
        updateTeams(
          staff,
          edition.slug,
          command(3, {
            action: "add_coach",
            teamId: team.id,
            userId: coach.osuId,
          }),
        ),
      ).rejects.toMatchObject({ status: 503 });
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          updateTeams(
            staff,
            edition.slug,
            command(3, {
              action: "add_coach",
              teamId: team.id,
              userId: coach.osuId,
            }),
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db().select().from(teamCoaches)).toHaveLength(1);
    });
    it("archives a revoked captain team and preserves historical membership", async () => {
      await configure();
      await updateCaptains(
        staff,
        edition.slug,
        command(3, { action: "revoke", userId: a.osuId }),
      );
      expect(await ownTeam(a.osuId, edition.slug)).toBeNull();
      const historical = await db()
        .select()
        .from(memberships)
        .where(eq(memberships.userId, a.osuId));
      expect(historical[0].leftAt).not.toBeNull();
    });
  },
);
