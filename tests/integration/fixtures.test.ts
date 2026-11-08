import { randomUUID } from "node:crypto";
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
  fixtureReferees,
  fixtures,
  matchGames,
  matchImports,
  matchResults,
  resultAuditEvents,
  resultRevisions,
  staffRoles,
  teams,
  tournamentRounds,
  users,
} from "../../src/db/schema";
import {
  assignFixtureReferees,
  fixtureCommand,
  fixtureForReview,
  staffFixtures,
} from "../../src/lib/fixtures";
import {
  chronologicalFixtures,
  groupedFixtures,
  fixtureBracket,
} from "../../src/lib/fixture-views";
import { publicFixture } from "../../src/lib/public-competition";
import { importFixtureMatch, resultCommand } from "../../src/lib/results";
import { mappoolCommand } from "../../src/lib/mappools";
import { seedPublicDirectory } from "../fixtures/players";
import { edition } from "../fixtures/edition";
import { PATCH as assignmentRoute } from "../../src/app/api/admin/tournaments/[edition]/matches/[fixtureId]/referees/route";
import { assignFixtureRefereesWrite } from "../../src/lib/fixture-write-contracts";
import { extendedSchemas } from "../../src/lib/extended-read-resources";
const origin = "https://oclr.example.test";
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => admin,
}));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 250001, username: "Synthetic Fixture Admin" };
const referee = { osuId: 250002, username: "Synthetic Assigned Referee" };
const otherRef = { osuId: 250003, username: "Synthetic Unassigned Referee" };
const mapper = { osuId: 250004, username: "Synthetic Mappooler" };
const player = { osuId: 250005, username: "Synthetic Player" };
const confirm = { confirmed: true };
const rules = {
  version: "synthetic-v1",
  mode: "osu",
  teamType: "team-vs",
  scoringType: "score",
  aggregation: "sum",
  playersPerTeam: 2,
  series: { type: "first_to", wins: 2 },
  allowSubstitutions: false,
  allowShortHanded: false,
  failedScorePolicy: "include",
  tiedMapPolicy: "require_replay",
};
describe.skipIf(!url)(
  "competition fixture integrity and assigned-referee boundaries",
  () => {
    let homeId: string;
    let awayId: string;
    let roundId: string;
    let poolId: string;
    beforeAll(() => {
      assertTestDatabase(url);
      fixtureEditions = [edition, { ...edition, slug: "other-test-cup" }];
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("APP_URL", origin);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      await seedEditions(fixtureEditions);
      homeId = (await seedPublicDirectory(260001)).teamId;
      awayId = (await seedPublicDirectory(260101)).teamId;
      await db()
        .insert(users)
        .values([admin, referee, otherRef, mapper, player]);
      await db()
        .insert(staffRoles)
        .values([
          {
            userId: referee.osuId,
            role: "referee",
            editionSlug: "test-cup",
            grantedBy: admin.osuId,
          },
          {
            userId: otherRef.osuId,
            role: "referee",
            editionSlug: "test-cup",
            grantedBy: admin.osuId,
          },
          {
            userId: mapper.osuId,
            role: "mappooler",
            editionSlug: "test-cup",
            grantedBy: admin.osuId,
          },
        ]);
      let maps = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "round_create",
        stage: "group",
        name: "Synthetic Group Round",
        position: 1,
      });
      roundId = maps.rounds[0].id;
      maps = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "pool_create",
        roundId,
        name: "Synthetic Match Pool",
      });
      poolId = maps.pools[0].id;
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    function body(edit = false) {
      return {
        ...confirm,
        action: "create",
        label: "Synthetic Fixture",
        roundId,
        homeTeamId: homeId,
        awayTeamId: awayId,
        position: 1,
        scheduledAt: null,
        timeZone: "Asia/Taipei",
        status: "scheduled",
        mappoolId: poolId,
        homeSourceId: null,
        homeSourceOutcome: null,
        awaySourceId: null,
        awaySourceOutcome: null,
        ...(edit ? {} : { refereeIds: [referee.osuId] }),
      };
    }
    it("saves unpublished team choices privately and retains publication and result gates", async () => {
      await db()
        .update(teams)
        .set({
          identityPublished: false,
          rosterPublished: false,
          finalizedAt: null,
        })
        .where(eq(teams.id, homeId));
      const data = await fixtureCommand(admin, "test-cup", body());
      const fixture = data.fixtures[0];
      expect(data.teams.find((t) => t.id === homeId)?.unpublished).toBe(true);
      expect(
        (await staffFixtures(admin, "test-cup")).fixtures[0].homeTeamId,
      ).toBe(homeId);
      expect(
        (await staffFixtures(referee, "test-cup")).teams.some(
          (t) => t.id === homeId,
        ),
      ).toBe(false);
      expect(await publicFixture("test-cup", fixture.id)).toBeNull();
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...confirm,
          action: "publish",
          fixtureId: fixture.id,
          expectedVersion: fixture.version,
          published: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        fixtureForReview(referee, "test-cup", fixture.id),
      ).rejects.toMatchObject({ status: 409 });
      const edited = await fixtureCommand(admin, "test-cup", {
        ...body(true),
        action: "edit",
        fixtureId: fixture.id,
        expectedVersion: fixture.version,
        label: "Private test edited",
      });
      expect(edited.fixtures[0]).toMatchObject({
        homeTeamId: homeId,
        publishedAt: null,
      });
      await expect(
        fixtureCommand(admin, "test-cup", { ...body(), awayTeamId: homeId }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...body(),
          awayTeamId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      const stage = data.stages.find((s) => s.kind === "group")!;
      const groupCommand = {
        ...confirm,
        action: "stage_groups",
        stageId: stage.id,
        expectedVersion: stage.version,
        configuration: {
          groups: [{ name: "Private group", teamIds: [homeId, awayId] }],
        },
        published: false,
      };
      const grouped = await fixtureCommand(admin, "test-cup", groupCommand);
      const saved = grouped.stages.find((s) => s.id === stage.id)!;
      expect(saved.groupsPublishedAt).toBeNull();
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...groupCommand,
          configuration: saved.groupConfiguration,
          expectedVersion: saved.version,
          published: true,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("creates persistent fixtures separately from results and limits referee reads to assigned fixtures", async () => {
      const data = await fixtureCommand(admin, "test-cup", body());
      const fixture = data.fixtures[0];
      expect(fixture).toMatchObject({
        scheduledAt: null,
        result: null,
        publishedAt: null,
        version: 0,
        refereeIds: [referee.osuId],
      });
      expect((await staffFixtures(referee, "test-cup")).fixtures).toHaveLength(
        1,
      );
      expect((await staffFixtures(otherRef, "test-cup")).fixtures).toEqual([]);
      expect(
        (await fixtureForReview(referee, "test-cup", fixture.id)).teams.map(
          (t) => t.id,
        ),
      ).toEqual([homeId, awayId]);
      await expect(
        fixtureForReview(otherRef, "test-cup", fixture.id),
      ).rejects.toMatchObject({ status: 403 });
      for (const actor of [mapper, player]) {
        await expect(staffFixtures(actor, "test-cup")).rejects.toMatchObject({
          status: 403,
        });
        await expect(
          fixtureForReview(actor, "test-cup", fixture.id),
        ).rejects.toMatchObject({ status: 403 });
      }
      for (const actor of [referee, mapper, player])
        await expect(
          fixtureCommand(actor, "test-cup", body()),
        ).rejects.toMatchObject({ status: 403 });
      expect(
        (await fixtureForReview(referee, "test-cup", fixture.id)).fixture,
      ).not.toHaveProperty("exhibitionSides");
      await closeDb();
      expect(
        (await fixtureForReview(referee, "test-cup", fixture.id)).fixture.id,
      ).toBe(fixture.id);
    });
    it("rejects invalid/unconfirmed fields and cross-round/edition identities", async () => {
      for (const change of [
        { homeTeamId: awayId },
        { timeZone: "Invalid/Zone" },
        { scheduledAt: "2030-01-01T10:00:00" },
        { confirmed: false },
        { refereeIds: [player.osuId] },
        { refereeIds: [referee.osuId, referee.osuId] },
        { actorId: player.osuId },
      ])
        await expect(
          fixtureCommand(admin, "test-cup", { ...body(), ...change }),
        ).rejects.toMatchObject({ status: 400 });
      await db()
        .update(teams)
        .set({ rosterPublished: false })
        .where(eq(teams.id, homeId));
      expect(
        (await fixtureCommand(admin, "test-cup", body())).fixtures[0]
          .publishedAt,
      ).toBeNull();
      await db()
        .update(teams)
        .set({ rosterPublished: true })
        .where(eq(teams.id, homeId));
      const maps = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "round_create",
        stage: "knockout",
        name: "Synthetic Knockout Round",
        position: 1,
      });
      const ko = maps.rounds.find((r) => r.stage === "knockout")!;
      await expect(
        fixtureCommand(admin, "test-cup", { ...body(), roundId: ko.id }),
      ).rejects.toMatchObject({ status: 400 });
      await db()
        .insert(editionState)
        .values({ slug: "other-test-cup" })
        .onConflictDoNothing();
      await expect(
        fixtureCommand(admin, "other-test-cup", body()),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        db().insert(fixtures).values({
          editionSlug: "test-cup",
          roundId: ko.id,
          homeTeamId: homeId,
          awayTeamId: awayId,
          label: "Synthetic invalid cross-round",
          position: 1,
          timeZone: "UTC",
          mappoolId: poolId,
        }),
      ).rejects.toThrow();
      await expect(
        db().insert(fixtures).values({
          editionSlug: "test-cup",
          roundId,
          homeTeamId: homeId,
          awayTeamId: homeId,
          label: "Synthetic invalid self-match",
          position: 1,
          timeZone: "UTC",
        }),
      ).rejects.toThrow();
    });
    it("serializes stale amendments, audits actual operators and applies assignment/role revocation immediately", async () => {
      const data = await fixtureCommand(admin, "test-cup", body());
      const f = data.fixtures[0];
      const { action: _action, ...fields } = body(true);
      void _action;
      const amendment = {
        ...fields,
        action: "edit",
        fixtureId: f.id,
        expectedVersion: 0,
      };
      const results = await Promise.allSettled([
        fixtureCommand(admin, "test-cup", amendment),
        fixtureCommand(admin, "test-cup", amendment),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      await assignFixtureReferees(admin, "test-cup", f.id, {
        expectedAssignmentRevision: 0,
        refereeIds: [],
      });
      await expect(
        fixtureForReview(referee, "test-cup", f.id),
      ).rejects.toMatchObject({ status: 403 });
      await assignFixtureReferees(admin, "test-cup", f.id, {
        expectedAssignmentRevision: 1,
        refereeIds: [referee.osuId],
      });
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, referee.osuId));
      await expect(
        fixtureForReview(referee, "test-cup", f.id),
      ).rejects.toMatchObject({ status: 403 });
      const events = await db().select().from(resultAuditEvents);
      expect(events).toHaveLength(4);
      expect(
        events.every((e) => e.actorId === admin.osuId && e.reason === null),
      ).toBe(true);
    });
    it("assigns multiple active referees independently of fixture/result versions with atomic conflicts and no false audits", async () => {
      const f = (await fixtureCommand(admin, "test-cup", body())).fixtures[0];
      await db()
        .insert(matchResults)
        .values({ fixtureId: f.id, state: "submitted", version: 7 });
      const resultBefore = await db().select().from(matchResults);
      const post = (refereeIds: number[]) =>
        assignmentRoute(
          new Request(
            origin +
              assignFixtureRefereesWrite.path
                .replace("{edition}", "test-cup")
                .replace("{fixtureId}", f.id),
            {
              method: "PATCH",
              headers: { origin, "content-type": "application/json" },
              body: JSON.stringify({
                expectedAssignmentRevision: 0,
                refereeIds,
              }),
            },
          ),
          { params: Promise.resolve({ edition: "test-cup", fixtureId: f.id }) },
        );
      const responses = await Promise.all([
        post([referee.osuId, otherRef.osuId]),
        post([otherRef.osuId]),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const receipt = await responses.find((response) => response.ok)!.json();
      expect(
        extendedSchemas[assignFixtureRefereesWrite.response.readResource].parse(
          receipt,
        ),
      ).toEqual(receipt);
      expect(receipt.fixtures[0].assignmentRevision).toBe(1);
      const updated = (await staffFixtures(admin, "test-cup")).fixtures[0];
      const {
        refereeIds: _ids,
        referees: _names,
        result: _result,
        ...unchanged
      } = f;
      void _ids;
      void _names;
      void _result;
      const stored = (await db().select().from(fixtures))[0];
      expect(stored).toEqual({
        ...unchanged,
        exhibitionSides: unchanged.exhibitionSides ?? null,
        assignmentRevision: 1,
      });
      expect(await db().select().from(matchResults)).toEqual(resultBefore);
      const auditCount = (await db().select().from(resultAuditEvents)).length;
      const assignmentsBeforeRetry = await db().select().from(fixtureReferees);
      await assignFixtureReferees(admin, "test-cup", f.id, {
        expectedAssignmentRevision: 1,
        refereeIds: updated.refereeIds,
      });
      expect(await db().select().from(fixtureReferees)).toEqual(
        assignmentsBeforeRetry,
      );
      expect((await db().select().from(resultAuditEvents)).length).toBe(
        auditCount,
      );
      await expect(
        assignFixtureReferees(admin, "test-cup", f.id, {
          expectedAssignmentRevision: 1,
          refereeIds: [],
          homeTeamId: awayId,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await db().insert(staffRoles).values({
        userId: player.osuId,
        role: "referee",
        editionSlug: "other-test-cup",
        grantedBy: admin.osuId,
      });
      expect(
        (await staffFixtures(admin, "test-cup")).eligibleReferees.some(
          (u) => u.osuId === player.osuId,
        ),
      ).toBe(false);
      await expect(
        assignFixtureReferees(referee, "test-cup", f.id, {
          expectedAssignmentRevision: 1,
          refereeIds: [],
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        assignFixtureReferees(admin, "other-test-cup", f.id, {
          expectedAssignmentRevision: 1,
          refereeIds: [],
        }),
      ).rejects.toMatchObject({ status: 404 });
      for (const refereeIds of [
        [player.osuId],
        [mapper.osuId],
        [referee.osuId, referee.osuId],
      ])
        await expect(
          assignFixtureReferees(admin, "test-cup", f.id, {
            expectedAssignmentRevision: 1,
            refereeIds,
          }),
        ).rejects.toMatchObject({ status: 400 });
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, otherRef.osuId));
      await expect(
        assignFixtureReferees(admin, "test-cup", f.id, {
          expectedAssignmentRevision: 1,
          refereeIds: [otherRef.osuId],
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect((await db().select().from(resultAuditEvents)).length).toBe(
        auditCount,
      );
      expect(
        (await staffFixtures(referee, "test-cup")).eligibleReferees,
      ).toEqual([]);
      expect(updated.assignmentRevision).toBe(1);
    });
    it("keeps safe edits public and preserves UTC instants and timezone labels", async () => {
      const [f] = (
        await fixtureCommand(admin, "test-cup", {
          ...body(),
          scheduledAt: "2030-01-01T20:00:00+08:00",
        })
      ).fixtures;
      expect(f.scheduledAt?.toISOString()).toBe("2030-01-01T12:00:00.000Z");
      const published = await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId: f.id,
        expectedVersion: 0,
        published: true,
      });
      expect(published.fixtures[0].publishedAt).not.toBeNull();
      const edited = await fixtureCommand(admin, "test-cup", {
        ...body(true),
        action: "edit",
        fixtureId: f.id,
        expectedVersion: 1,
        label: "Updated public fixture",
      });
      expect(edited.fixtures[0].publishedAt).toEqual(
        published.fixtures[0].publishedAt,
      );
      expect(edited.fixtures[0].label).toBe("Updated public fixture");
      expect(await db().select().from(matchResults)).toEqual([]);
    });
    it("rejects counted ties in first-to rounds before changing saved rules", async () => {
      const [before] = await db()
        .select()
        .from(tournamentRounds)
        .where(eq(tournamentRounds.id, roundId));
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...confirm,
          action: "round_rules",
          roundId,
          expectedVersion: before.version,
          scoringRules: { ...rules, tiedMapPolicy: "count_as_draw" },
          standingsRules: null,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: "First-to series require tied maps to be replayed.",
      });
      const [after] = await db()
        .select()
        .from(tournamentRounds)
        .where(eq(tournamentRounds.id, roundId));
      expect(after).toEqual(before);
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: before.version,
        scoringRules: {
          ...rules,
          tiedMapPolicy: "count_as_draw",
          series: { type: "fixed_maps", count: 2, allowDraw: true },
        },
        standingsRules: null,
      });
    });
    it("saves EX lineup size and rejects counts above the normal lineup without updating rules", async () => {
      const [f] = (await fixtureCommand(admin, "test-cup", body())).fixtures;
      const change = {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: 0,
        scoringRules: { ...rules, exPlayersPerTeam: rules.playersPerTeam + 1 },
        standingsRules: null,
      };
      await expect(
        fixtureCommand(admin, "test-cup", change),
      ).rejects.toMatchObject({ status: 400 });
      const saved = await fixtureCommand(admin, "test-cup", {
        ...change,
        scoringRules: { ...rules, exPlayersPerTeam: 1 },
      });
      expect(
        saved.rounds.find((r) => r.round.id === roundId)?.round.scoringRules
          ?.exPlayersPerTeam,
      ).toBe(1);
      expect(
        (await fixtureForReview(admin, "test-cup", f.id)).round.scoringRules
          ?.exPlayersPerTeam,
      ).toBe(1);
    });
    it("stores approved rule configuration without inventing defaults and rejects source cycles", async () => {
      const [f] = (await fixtureCommand(admin, "test-cup", body())).fixtures;
      expect(
        (await fixtureForReview(admin, "test-cup", f.id)).round.scoringRules,
      ).toBeNull();
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: 0,
        scoringRules: rules,
        standingsRules: {
          version: "synthetic-points",
          winPoints: 2,
          lossPoints: 0,
          drawPoints: null,
          tiebreakers: ["points", "map_difference"],
        },
      });
      expect(
        (await fixtureForReview(admin, "test-cup", f.id)).round.scoringRules,
      ).toEqual(rules);
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...confirm,
          action: "round_rules",
          roundId,
          expectedVersion: 1,
          scoringRules: { ...rules, series: null },
          standingsRules: null,
        }),
      ).rejects.toMatchObject({ status: 400 });
      const maps = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "round_create",
        stage: "knockout",
        name: "Synthetic Knockout Round",
        position: 1,
      });
      const ko = maps.rounds.find((r) => r.stage === "knockout")!;
      const koBody = { ...body(), roundId: ko.id, mappoolId: null };
      const data = await fixtureCommand(admin, "test-cup", koBody);
      const a = data.fixtures.find((r) => r.roundId === ko.id)!;
      const second = await fixtureCommand(admin, "test-cup", {
        ...koBody,
        position: 2,
        homeSourceId: a.id,
        homeSourceOutcome: "winner",
      });
      const b = second.fixtures.find(
        (r) => r.roundId === ko.id && r.position === 2,
      )!;
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...body(true),
          roundId: ko.id,
          mappoolId: null,
          action: "edit",
          fixtureId: a.id,
          expectedVersion: 0,
          homeSourceId: b.id,
          homeSourceOutcome: "winner",
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...koBody,
          position: 3,
          homeSourceId: a.id,
          homeSourceOutcome: null,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("rejects direct requests for more than four groups without changing the stage", async () => {
      const initial = await fixtureCommand(admin, "test-cup", body());
      const stage = initial.stages.find((s) => s.kind === "group")!;
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...confirm,
          action: "stage_groups",
          stageId: stage.id,
          expectedVersion: stage.version,
          configuration: {
            groups: Array.from({ length: 5 }, (_, index) => ({
              name: `Group ${index}`,
              teamIds: [randomUUID(), randomUUID()],
            })),
          },
          published: false,
        }),
      ).rejects.toMatchObject({ status: 400 });
      const after = (await staffFixtures(admin, "test-cup")).stages.find(
        (s) => s.id === stage.id,
      )!;
      expect(after.version).toBe(stage.version);
      expect(after.groupConfiguration).toEqual(stage.groupConfiguration);
    });
    it("generates stable unique group identifiers and rejects stale concurrent additions", async () => {
      const initial = await fixtureCommand(admin, "test-cup", body());
      const stage = initial.stages.find((s) => s.kind === "group")!;
      const command = {
        ...confirm,
        action: "stage_groups",
        stageId: stage.id,
        expectedVersion: stage.version,
        configuration: {
          groups: [{ name: "中文分組", teamIds: [homeId, awayId] }],
        },
        published: false,
      };
      const attempts = await Promise.allSettled([
        fixtureCommand(admin, "test-cup", command),
        fixtureCommand(admin, "test-cup", command),
      ]);
      expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const current = await staffFixtures(admin, "test-cup");
      const saved = current.stages.find((s) => s.id === stage.id)!;
      const group = saved.groupConfiguration!.groups[0];
      expect(group.key).toMatch(/^g-[a-f0-9-]+$/);
      const renamed = await fixtureCommand(admin, "test-cup", {
        ...command,
        expectedVersion: saved.version,
        configuration: { groups: [{ ...group, name: "重新命名" }] },
      });
      expect(
        renamed.stages.find((s) => s.id === stage.id)!.groupConfiguration!
          .groups[0],
      ).toEqual({ ...group, name: "重新命名" });
      expect(renamed.fixtures[0].id).toBe(initial.fixtures[0].id);
    });
    it("projects the same scoped fixtures into chronological, configured group and linked knockout views", async () => {
      let data = await fixtureCommand(admin, "test-cup", {
        ...body(),
        scheduledAt: "2026-11-01T12:00:00Z",
      });
      const groupFixture = data.fixtures[0];
      const stage = data.stages.find((s) => s.kind === "group")!;
      data = await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "stage_groups",
        stageId: stage.id,
        expectedVersion: stage.version,
        configuration: {
          groups: [{ name: "Group A", teamIds: [homeId, awayId] }],
        },
        published: false,
      });
      expect(
        data.stages.find((s) => s.id === stage.id)?.groupConfiguration?.version,
      ).toMatch(/^release-/);
      const maps = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "round_create",
        stage: "knockout",
        name: "Knockout Round",
        position: 1,
      });
      const ko = maps.rounds.find((r) => r.stage === "knockout")!;
      data = await fixtureCommand(admin, "test-cup", {
        ...body(),
        roundId: ko.id,
        mappoolId: null,
        scheduledAt: "2026-10-31T10:00:00Z",
        label: "QF1",
      });
      const first = data.fixtures.find((f) => f.roundId === ko.id)!;
      data = await fixtureCommand(admin, "test-cup", {
        ...body(),
        roundId: ko.id,
        mappoolId: null,
        position: 2,
        label: "SF1",
        homeSourceId: first.id,
        homeSourceOutcome: "winner",
      });
      expect(chronologicalFixtures(data.fixtures).map((f) => f.label)).toEqual([
        "QF1",
        groupFixture.label,
        "SF1",
      ]);
      expect(groupedFixtures(data, "")).toMatchObject([
        { name: "Group A", fixtures: [{ id: groupFixture.id }] },
      ]);
      expect(groupedFixtures(data, ko.id)).toEqual([]);
      const bracket = fixtureBracket("test-cup", data)!;
      const matches = bracket.groups.flatMap((g) =>
        g.rounds.flatMap((r) => r.matches),
      );
      expect(matches.map((m) => m.label)).toEqual(["QF1", "SF1"]);
      expect(matches[1].slots[0].sourceMatchId).toBe(first.id);
      expect(new Set([groupFixture.id, ...matches.map((m) => m.id)])).toEqual(
        new Set(data.fixtures.map((f) => f.id)),
      );
      const assigned = await staffFixtures(referee, "test-cup");
      expect(groupedFixtures(assigned, "")[0].name).toBe("Group A");
      expect(
        assigned.stages.flatMap(
          (s) => s.groupConfiguration?.groups.flatMap((g) => g.teamIds) ?? [],
        ),
      ).toEqual([homeId, awayId]);
    });
    it("persists planned participants and assignments without fake teams, gates reporting and safely publishes TBD schedules", async () => {
      const plannedBody = {
        ...body(),
        homeTeamId: null,
        awayTeamId: null,
        scheduledAt: "2026-11-02T12:00:00Z",
      };
      let data = await fixtureCommand(admin, "test-cup", plannedBody);
      const fixture = data.fixtures[0];
      expect(fixture).toMatchObject({ homeTeamId: null, awayTeamId: null });
      expect(await publicFixture("test-cup", fixture.id)).toBeNull();
      data = await assignFixtureReferees(admin, "test-cup", fixture.id, {
        expectedAssignmentRevision: 0,
        refereeIds: [referee.osuId, otherRef.osuId],
      });
      expect(data.fixtures[0].refereeIds).toHaveLength(2);
      expect((await staffFixtures(referee, "test-cup")).fixtures[0].id).toBe(
        fixture.id,
      );
      await expect(
        fixtureForReview(referee, "test-cup", fixture.id),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        fixtureForReview(player, "test-cup", fixture.id),
      ).rejects.toMatchObject({ status: 403 });
      const request = {
        expectedFixtureVersion: 0,
        expectedVersion: 0,
        requestKey: randomUUID(),
        confirmed: true,
      };
      await expect(
        importFixtureMatch(referee, "test-cup", fixture.id, {
          ...request,
          match: "999001",
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        resultCommand(admin, "test-cup", fixture.id, {
          ...request,
          action: "approve",
          revision: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await db().select().from(matchImports)).toEqual([]);
      expect(await db().select().from(matchResults)).toEqual([]);
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId: fixture.id,
        expectedVersion: 0,
        published: true,
      });
      expect(await publicFixture("test-cup", fixture.id)).toMatchObject({
        home: { team: null },
        away: { team: null },
        confirmed: false,
        result: null,
        scheduledAt: "2026-11-02T12:00:00.000Z",
      });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId: fixture.id,
        expectedVersion: 1,
        published: false,
      });
      data = await fixtureCommand(admin, "test-cup", {
        ...Object.fromEntries(
          Object.entries(plannedBody).filter(([key]) => key !== "refereeIds"),
        ),
        action: "edit",
        fixtureId: fixture.id,
        expectedVersion: 2,
        homeTeamId: homeId,
      });
      await expect(
        fixtureForReview(referee, "test-cup", fixture.id),
      ).rejects.toMatchObject({ status: 409 });
      data = await fixtureCommand(admin, "test-cup", {
        ...body(true),
        action: "edit",
        fixtureId: fixture.id,
        expectedVersion: 3,
      });
      expect(
        (await fixtureForReview(referee, "test-cup", fixture.id)).fixture,
      ).toMatchObject({
        homeTeamId: homeId,
        awayTeamId: awayId,
        version: 4,
        assignmentRevision: 1,
      });
      expect(data.fixtures[0].refereeIds).toHaveLength(2);
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...plannedBody,
          position: 2,
          homeTeamId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("retains winner/loser source links on planned knockout fixtures without disclosing unpublished sources", async () => {
      const maps = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "round_create",
        stage: "knockout",
        name: "Planned knockout",
        position: 1,
      });
      const ko = maps.rounds.find((r) => r.stage === "knockout")!;
      const payload = {
        ...body(),
        roundId: ko.id,
        mappoolId: null,
        homeTeamId: null,
        awayTeamId: null,
      };
      let data = await fixtureCommand(admin, "test-cup", {
        ...payload,
        label: "QF1",
      });
      const qf = data.fixtures[0];
      data = await fixtureCommand(admin, "test-cup", {
        ...payload,
        label: "SF1",
        position: 2,
        homeSourceId: qf.id,
        homeSourceOutcome: "winner",
      });
      const sf = data.fixtures.find((f) => f.label === "SF1")!;
      const bracket = fixtureBracket("test-cup", data)!;
      expect(bracket.groups[0].rounds[0].matches[1].slots[0]).toMatchObject({
        label: "Winner of QF1",
        teamId: null,
        sourceMatchId: qf.id,
      });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId: sf.id,
        expectedVersion: 0,
        published: true,
      });
      expect((await publicFixture("test-cup", sf.id))?.home).toMatchObject({
        team: null,
        sourceId: null,
      });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId: qf.id,
        expectedVersion: 0,
        published: true,
      });
      expect((await publicFixture("test-cup", sf.id))?.home).toMatchObject({
        team: null,
        label: "Winner of QF1",
        sourceId: qf.id,
      });
      await expect(
        fixtureForReview(admin, "test-cup", sf.id),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("database uniqueness keeps imports/games/revisions distinct and no source record creates an official result", async () => {
      const [fixture] = (await fixtureCommand(admin, "test-cup", body()))
        .fixtures;
      const [source] = await db()
        .insert(matchImports)
        .values({
          fixtureId: fixture.id,
          externalMatchId: 1,
          fingerprint: "synthetic-source",
          source: { synthetic: true },
          createdBy: referee.osuId,
        })
        .returning();
      await expect(
        db().insert(matchImports).values({
          fixtureId: fixture.id,
          externalMatchId: 1,
          fingerprint: "synthetic-source",
          source: {},
          createdBy: referee.osuId,
        }),
      ).rejects.toThrow();
      await db()
        .insert(matchGames)
        .values({
          importId: source.id,
          externalGameId: 1,
          data: { synthetic: true },
        });
      await expect(
        db()
          .insert(matchGames)
          .values({ importId: source.id, externalGameId: 1, data: {} }),
      ).rejects.toThrow();
      expect(await db().select().from(matchResults)).toEqual([]);
      await db().insert(matchResults).values({ fixtureId: fixture.id });
      await db()
        .insert(resultRevisions)
        .values({
          fixtureId: fixture.id,
          revision: 1,
          importId: source.id,
          proposal: { synthetic: true },
          createdBy: referee.osuId,
          reason: "Synthetic review only",
        });
      expect((await db().select().from(matchResults))[0]).toMatchObject({
        state: "draft",
        publishedRevision: null,
      });
      expect(
        (await db().select().from(resultRevisions))[0].approvedAt,
      ).toBeNull();
      expect(await db().select().from(fixtureReferees)).toHaveLength(1);
    });
    it("generates policy releases on changed saves, keeps unchanged identities and rejects stale writes", async () => {
      const command = {
        ...confirm,
        action: "round_rules",
        roundId,
        scoringRules: { ...rules, version: undefined },
        standingsRules: {
          winPoints: 2,
          lossPoints: 0,
          drawPoints: null,
          tiebreakers: ["points"],
        },
      };
      const first = await fixtureCommand(admin, "test-cup", {
        ...command,
        expectedVersion: 0,
      });
      const original = first.rounds.find((r) => r.round.id === roundId)!.round;
      expect(original.scoringRules?.version).toMatch(/^release-/);
      expect(original.standingsRules?.version).toMatch(/^release-/);
      const unchanged = await fixtureCommand(admin, "test-cup", {
        ...command,
        expectedVersion: 1,
      });
      expect(
        unchanged.rounds.find((r) => r.round.id === roundId)!.round
          .scoringRules,
      ).toEqual(original.scoringRules);
      const changed = await fixtureCommand(admin, "test-cup", {
        ...command,
        expectedVersion: 2,
        scoringRules: { ...command.scoringRules, playersPerTeam: 3 },
      });
      const updated = changed.rounds.find((r) => r.round.id === roundId)!.round;
      expect(updated.scoringRules?.version).not.toBe(
        original.scoringRules?.version,
      );
      expect(updated.standingsRules?.version).toBe(
        original.standingsRules?.version,
      );
      await expect(
        fixtureCommand(admin, "test-cup", { ...command, expectedVersion: 2 }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("requires a new scoring-rule version for corrections and preserves approved history", async () => {
      const [fixture] = (await fixtureCommand(admin, "test-cup", body()))
        .fixtures;
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: 0,
        scoringRules: rules,
        standingsRules: null,
      });
      const [source] = await db()
        .insert(matchImports)
        .values({
          fixtureId: fixture.id,
          externalMatchId: 1,
          fingerprint: "synthetic-approved-source",
          source: {},
          createdBy: referee.osuId,
        })
        .returning();
      await db().insert(matchResults).values({
        fixtureId: fixture.id,
        state: "approved",
        currentRevision: 1,
      });
      await db()
        .insert(resultRevisions)
        .values({
          fixtureId: fixture.id,
          revision: 1,
          importId: source.id,
          proposal: { synthetic: true },
          reason: "Synthetic approved revision",
          createdBy: referee.osuId,
          approvedBy: admin.osuId,
          approvedAt: new Date(),
        });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: 1,
        scoringRules: rules,
        standingsRules: {
          version: "synthetic-points",
          winPoints: 2,
          lossPoints: 0,
          drawPoints: null,
          tiebreakers: ["points"],
        },
      });
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...confirm,
          action: "round_rules",
          roundId,
          expectedVersion: 2,
          scoringRules: { ...rules, playersPerTeam: 3 },
          standingsRules: null,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        mappoolCommand(mapper, "test-cup", {
          ...confirm,
          action: "round_edit",
          roundId,
          expectedVersion: 2,
          name: "Changed completed round",
          position: 2,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: 2,
        scoringRules: {
          ...rules,
          version: "synthetic-corrected-v2",
          playersPerTeam: 3,
        },
        standingsRules: null,
      });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: 3,
        scoringRules: { ...rules, version: undefined, playersPerTeam: 4 },
        standingsRules: null,
      });
      expect((await db().select().from(resultRevisions))[0].proposal).toEqual({
        synthetic: true,
      });
      const second = (
        await fixtureCommand(admin, "test-cup", { ...body(), position: 2 })
      ).fixtures.find((f) => f.position === 2)!;
      await db().insert(matchResults).values({ fixtureId: second.id });
      await expect(
        db().insert(resultRevisions).values({
          fixtureId: second.id,
          revision: 1,
          importId: source.id,
          proposal: {},
          reason: "Cross-fixture source forbidden",
          createdBy: referee.osuId,
        }),
      ).rejects.toThrow();
    });
  },
);
