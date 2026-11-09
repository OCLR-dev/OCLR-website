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
  memberships,
  fixtures,
  teams,
  users,
  matchResults,
  refereeSessions,
  refereeMpBindings,
  refereeMpScores,
  resultRevisions,
} from "../../src/db/schema";
import {
  fixtureCommand,
  fixtureForReview,
  staffFixtures,
} from "../../src/lib/fixtures";
import { mappoolCommand } from "../../src/lib/mappools";
import {
  matchReview,
  resultCommand,
  type MatchReview,
} from "../../src/lib/results";
import {
  publicFixture,
  publicCompetition,
} from "../../src/lib/public-competition";
import { approvedRatingGames } from "../../src/lib/approved-rating-games";
import { refereeCommand, refereeWorkspace } from "../../src/lib/referee";
import { refereeMpCommand } from "../../src/lib/referee-mp";
import { fetchMatchSource } from "../../src/lib/osu-matches";
import {
  seedRefereeFixture,
  refereeTestAdmin as admin,
  refereeTestUser as referee,
} from "../fixtures/referee";
import { fingerprint, mpSource } from "../fixtures/referee-mp";
import { assertTestDatabase } from "../database";
import { PATCH as refereeRoute } from "../../src/app/api/admin/tournaments/[edition]/matches/[fixtureId]/referee/route";
import { extendedSchemas } from "../../src/lib/extended-read-resources";
import { changeRefereeWorkspaceWrite } from "../../src/lib/referee-write-contracts";
const origin = "https://oclr.example.test";
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => referee,
}));
vi.mock("../../src/lib/osu-matches", async (original) => ({
  ...(await original<typeof import("../../src/lib/osu-matches")>()),
  fetchMatchSource: vi.fn(),
}));
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("fixture-local open exhibition sides", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.mocked(fetchMatchSource).mockReset();
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  function command(view: MatchReview) {
    return {
      requestKey: randomUUID(),
      confirmed: true,
      expectedVersion: view.context.result?.version ?? 0,
      expectedFixtureVersion: view.context.fixture.version,
    };
  }
  async function edit(id: string, extra: Record<string, unknown>) {
    const f = (await staffFixtures(admin, "test-cup")).fixtures.find(
      (f) => f.id === id,
    )!;
    return fixtureCommand(admin, "test-cup", {
      action: "edit",
      confirmed: true,
      fixtureId: id,
      expectedVersion: f.version,
      label: f.label,
      roundId: f.roundId,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      position: f.position,
      scheduledAt: f.scheduledAt?.toISOString() ?? null,
      timeZone: f.timeZone,
      status: f.status,
      mappoolId: f.mappoolId,
      homeSourceId: f.homeSourceId,
      homeSourceOutcome: f.homeSourceOutcome,
      awaySourceId: f.awaySourceId,
      awaySourceOutcome: f.awaySourceOutcome,
      ...extra,
    });
  }
  it("publishes local sides without official teams, keeps identity on rename and reviews freely changing MP lineups without career results", async () => {
    const seeded = await seedRefereeFixture(true, true);
    const id = seeded.fixtureId;
    await db().delete(memberships);
    await db().delete(teams);
    const stored = (
      await db().select().from(fixtures).where(eq(fixtures.id, id))
    )[0];
    const sides = stored.exhibitionSides!;
    expect(stored).toMatchObject({
      homeTeamId: null,
      awayTeamId: null,
      exhibitionSides: { redName: "紅隊", blueName: "藍隊" },
    });
    expect(sides.redId).not.toBe(sides.blueId);
    expect(
      (await fixtureForReview(referee, "test-cup", id)).fixture,
    ).toMatchObject({
      homeTeamId: sides.redId,
      awayTeamId: sides.blueId,
      openExhibition: true,
    });
    const w = await refereeWorkspace(referee, "test-cup", id);
    expect(w.readiness).toEqual([]);
    expect(w.teams.map((t) => [t.id, t.captainId, t.members])).toEqual([
      [sides.redId, null, []],
      [sides.blueId, null, []],
    ]);
    await edit(id, { exhibitionNames: { red: "紅色新星", blue: "藍色流星" } });
    expect((await db().select().from(fixtures))[0].exhibitionSides).toEqual({
      ...sides,
      redName: "紅色新星",
      blueName: "藍色流星",
    });
    expect((await publicFixture("test-cup", id))?.home.team).toMatchObject({
      id: sides.redId,
      name: "紅色新星",
      exhibition: true,
    });
    let view = await matchReview(referee, "test-cup", id);
    await fixtureCommand(admin, "test-cup", {
      confirmed: true,
      action: "round_rules",
      roundId: view.context.round.id,
      expectedVersion: view.context.round.version,
      scoringRules: null,
      standingsRules: null,
    });
    view = await matchReview(referee, "test-cup", id);
    view = (
      await resultCommand(referee, "test-cup", id, {
        ...command(view),
        action: "submit",
        importId: seeded.importId,
        sourceChangesConfirmed: true,
        publicNote: "Synthetic exhibition",
        decisions: seeded.source.games.map((g) => ({
          gameId: g.id,
          included: true,
          reason: "",
          complianceConfirmed: false,
          substitutions: [],
        })),
      })
    ).review;
    expect(view.current?.proposal?.rulesSnapshot).toBeNull();
    expect((await publicFixture("test-cup", id))?.result).toBeNull();
    const approval = {
      ...command(view),
      action: "approve_publish",
      revision: 1,
      progressionAcknowledged: true,
    };
    await expect(
      resultCommand(referee, "test-cup", id, approval),
    ).rejects.toMatchObject({ status: 403 });
    await resultCommand(admin, "test-cup", id, approval);
    const published = await publicFixture("test-cup", id);
    expect(published?.result).toMatchObject({
      homeWins: 1,
      awayWins: 2,
      winnerTeamId: sides.blueId,
    });
    expect(published?.details?.rating).toBeNull();
    const games = published!.details!.games;
    expect(games[0].scores.find((s) => s.osuId === 9901001)).toMatchObject({
      teamId: sides.blueId,
      mapping: "provider",
      username: "Synthetic Open Player 9901001",
    });
    expect(games[1].scores.find((s) => s.osuId === 9901001)).toMatchObject({
      teamId: sides.redId,
      mapping: "provider",
    });
    expect(games[2].scores.find((s) => s.osuId === 9901005)).toMatchObject({
      teamId: sides.blueId,
      mapping: "provider",
    });
    expect(await approvedRatingGames("test-cup", db())).toEqual([]);
    expect((await publicCompetition("test-cup"))?.fixtures[0].stage).toBe(
      "exhibition",
    );
    const revisions = await db().select().from(resultRevisions);
    await edit(id, { exhibitionNames: { red: "紅隊改名", blue: "藍隊改名" } });
    expect((await publicFixture("test-cup", id))?.result).toEqual(
      published?.result,
    );
    expect((await publicFixture("test-cup", id))?.away.team?.name).toBe(
      "藍隊改名",
    );
    expect(await db().select().from(resultRevisions)).toEqual(revisions);
    expect(await db().select().from(teams)).toHaveLength(0);
    expect(
      (await db().select().from(users)).some((u) => u.osuId === 9901001),
    ).toBe(false);
    await expect(
      edit(id, { exhibitionNames: { red: " ", blue: "ok" } }),
    ).rejects.toMatchObject({ status: 400 });
    const formal = await mappoolCommand(admin, "test-cup", {
      action: "round_create",
      confirmed: true,
      stage: "knockout",
      name: "Official",
      position: 1,
    });
    const formalRound = formal.rounds.find((r) => r.stage === "knockout")!.id;
    await expect(
      edit(id, {
        roundId: formalRound,
        mappoolId: null,
        exhibitionNames: { red: "R", blue: "B" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      edit(id, { roundId: formalRound, mappoolId: null }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      edit(id, { exhibitionSides: { ...sides, redId: randomUUID() } }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("saves a pick-only exhibition order and scores the first pick from MP colors", async () => {
    const seeded = await seedRefereeFixture(true, true);
    let w = seeded.workspace;
    const action = async (c: Record<string, unknown>) => {
      w = (
        await refereeCommand(referee, "test-cup", w.fixture.id, {
          ...c,
          requestKey: randomUUID(),
          expectedRevision: w.session?.revision ?? 0,
          dependencyFingerprint: w.dependencyFingerprint,
        })
      ).workspace;
    };
    await action({
      action: "set_order",
      firstBanTeamId: w.teams[0].id,
      firstPickTeamId: w.teams[1].id,
    });
    expect(w.projection.nextStep?.kind).toBe("ban");
    const input = {
      action: "set_order",
      skipBans: true,
      firstBanTeamId: null,
      firstPickTeamId: w.teams[1].id,
      requestKey: randomUUID(),
      expectedRevision: w.session?.revision ?? 0,
      dependencyFingerprint: w.dependencyFingerprint,
    };
    const response = await refereeRoute(
      new Request(
        origin +
          changeRefereeWorkspaceWrite.path
            .replace("{edition}", "test-cup")
            .replace("{fixtureId}", w.fixture.id),
        {
          method: "PATCH",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
      {
        params: Promise.resolve({
          edition: "test-cup",
          fixtureId: w.fixture.id,
        }),
      },
    );
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(extendedSchemas.refereeWorkspace.parse(saved.workspace)).toEqual(
      saved.workspace,
    );
    expect(saved.workspace.session.basis.skipBans).toBe(true);
    expect(saved.workspace.projection.nextStep.kind).toBe("pick");
    w = await refereeWorkspace(referee, "test-cup", w.fixture.id);
    expect(w.projection.nextStep).toMatchObject({
      kind: "pick",
      index: 1,
      teamId: w.teams[1].id,
    });
    await action({
      action: "record_selection",
      entryId: w.maps.find((m) => m.beatmapId === 10001)!.id,
    });
    await expect(
      action({
        action: "set_order",
        skipBans: false,
        firstBanTeamId: w.teams[0].id,
        firstPickTeamId: w.teams[1].id,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const session = (await db().select().from(refereeSessions))[0];
    expect(session).toMatchObject({
      firstBanTeamId: null,
      firstPickTeamId: null,
      basis: { skipBans: true },
      exhibitionOrder: {
        firstBanTeamId: null,
        firstPickTeamId: w.teams[1].id,
      },
    });
    const source = mpSource(w);
    source.games[0].scores = seeded.source.games[0].scores;
    vi.mocked(fetchMatchSource).mockResolvedValue(fingerprint(source));
    const before = await db().select().from(matchResults);
    await refereeMpCommand(referee, "test-cup", w.fixture.id, {
      action: "bind",
      match: "880001",
      expectedRevision: 0,
      expectedSessionRevision: w.session!.revision,
      dependencyFingerprint: w.dependencyFingerprint,
    });
    await db()
      .update(refereeMpBindings)
      .set({ nextPollAt: new Date(0) });
    const status = await refereeMpCommand(referee, "test-cup", w.fixture.id, {
      action: "status",
    });
    const synced = await refereeMpCommand(referee, "test-cup", w.fixture.id, {
      action: "sync",
      expectedRevision: status.binding!.revision,
    });
    expect(synced.workspace.projection.score[w.teams[1].id]).toBe(1);
    expect(synced.workspace.projection.nextStep).toMatchObject({
      kind: "pick",
      index: 3,
      teamId: w.teams[0].id,
    });
    expect(await db().select().from(refereeMpScores)).toHaveLength(1);
    expect(await db().select().from(matchResults)).toEqual(before);
  });
});
