import { refereeCommand } from "../../src/lib/referee";
import { refereeWorkspace } from "../../src/lib/referee-workspace";
let fixtureEditions: unknown[];
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  mappoolEntries,
  mappools,
  matchGames,
  matchImports,
  matchResults,
  resultAuditEvents,
  resultGameClaims,
  resultRevisions,
  staffRoles,
  users,
  fixtures,
  tournamentStages,
  teams,
} from "../../src/db/schema";
import {
  publicCompetition,
  publicFixture,
} from "../../src/lib/public-competition";
import { approvedRatingGames } from "../../src/lib/approved-rating-games";
import {
  publicMatchRating,
  publicRoundRatings,
  staffRoundRatings,
  ratingIdentities,
} from "../../src/lib/ratings";
import { publicPlayer } from "../../src/lib/players";
import { playerCompetitionRecord } from "../../src/lib/player-competition";
import { playerMapPerformance } from "../../src/lib/player-map-performance";
import { readTournament, tournamentCommand } from "../../src/lib/tournaments";
import { publicBracket } from "../../src/lib/brackets";
import { fixtureCommand } from "../../src/lib/fixtures";
import { fixtureForReview } from "../../src/lib/fixture-reads";
import { mappoolCommand } from "../../src/lib/mappools";
import { resultCommand } from "../../src/lib/results";
import { matchReview, type MatchReview } from "../../src/lib/result-review";
import { importFixtureMatch } from "../../src/lib/result-import";
import { fetchMatchSource } from "../../src/lib/osu-matches";
import { osuApi } from "../../src/lib/osu-api";
import { HttpError } from "../../src/lib/http";
import type { MatchSource } from "../../src/lib/match-model";
import { edition } from "../fixtures/edition";
import { bracketFixture } from "../fixtures/bracket";
import { seedPublicDirectory } from "../fixtures/players";
import {
  syntheticApiGame,
  syntheticEvent,
  syntheticMatchId,
  syntheticPage,
  syntheticScoringRules,
} from "../fixtures/match";
import { POST as importRoute } from "../../src/app/api/admin/tournaments/[edition]/matches/[fixtureId]/imports/route";
import { POST as previewRoute } from "../../src/app/api/admin/tournaments/[edition]/matches/[fixtureId]/imports/preview/route";
import { POST as resultRoute } from "../../src/app/api/admin/tournaments/[edition]/matches/[fixtureId]/results/route";
import { revalidatePath } from "next/cache";
import {
  changeMatchResultWrite,
  importMatchResultWrite,
  previewMatchImportWrite,
} from "../../src/lib/match-result-write-contracts";
import { extendedSchemas } from "../../src/lib/extended-read-resources";
import type { User } from "../../src/lib/auth/sessions";
const origin = "https://oclr.example.test";
let routeActor: User;
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => routeActor,
}));
function post(
  route: (...args: Parameters<typeof previewRoute>) => Promise<Response>,
  path: string,
  fixtureId: string,
  actor: User,
  input: unknown,
) {
  routeActor = actor;
  return route(
    new Request(
      origin +
        path.replace("{edition}", "test-cup").replace("{fixtureId}", fixtureId),
      {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
    { params: Promise.resolve({ edition: "test-cup", fixtureId }) },
  );
}
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
vi.mock("../../src/lib/osu-matches", async (original) => ({
  ...(await original<typeof import("../../src/lib/osu-matches")>()),
  fetchMatchSource: vi.fn(),
}));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 290001, username: "Synthetic Result Admin" };
const referee = { osuId: 290002, username: "Synthetic Result Referee" };
const mapper = { osuId: 290003, username: "Synthetic Result Mappooler" };
const outsider = { osuId: 290004, username: "Synthetic Ordinary Player" };
const confirm = {
  confirmed: true,
};
describe.skipIf(!url)(
  "authoritative MP import, review, approval and publication",
  () => {
    let scratch: string;
    let fixtureId: string;
    let poolId: string;
    let source: MatchSource;
    let fixtureBody: Record<string, unknown>;
    let actualFetch: typeof fetchMatchSource;
    beforeAll(async () => {
      assertTestDatabase(url);
      scratch = mkdtempSync(join(tmpdir(), "oclr-results-"));
      fixtureEditions = [edition];
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("APP_URL", origin);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
      actualFetch = (
        await vi.importActual<typeof import("../../src/lib/osu-matches")>(
          "../../src/lib/osu-matches",
        )
      ).fetchMatchSource;
    });
    async function makeSource(changed = false, gameOffset = 0) {
      const roster = (await fixtureForReview(admin, "test-cup", fixtureId))
        .teams;
      const ids = roster.flatMap((t) => t.members.map((m) => m.osuId));
      const games = [
        syntheticApiGame(1, changed ? 100 : 200, changed ? 200 : 100),
        syntheticApiGame(2, 100, 200),
        syntheticApiGame(3),
      ].map((g) => ({
        ...g,
        id: g.id + gameOffset,
        scores: g.scores.map((s, i) => ({ ...s, user_id: ids[i] })),
      }));
      vi.mocked(osuApi).mockResolvedValue(
        syntheticPage(games.map((g, i) => syntheticEvent(i + 1, g))),
      );
      return actualFetch(syntheticMatchId);
    }
    beforeEach(async () => {
      vi.mocked(fetchMatchSource).mockReset();
      vi.mocked(osuApi).mockReset();
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      await seedEditions(fixtureEditions);
      const home = await seedPublicDirectory(291001);
      const away = await seedPublicDirectory(292001);
      await db().insert(users).values([admin, referee, mapper, outsider]);
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
        name: "Synthetic Result Round",
        position: 1,
      });
      const roundId = maps.rounds[0].id;
      maps = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "pool_create",
        roundId,
        name: "Synthetic Result Pool",
      });
      poolId = maps.pools[0].id;
      await db()
        .insert(mappoolEntries)
        .values(
          [1, 2, 3].map((position) => ({
            poolId,
            category: "NM" as const,
            position,
            beatmapId: 10000 + position,
            metadata: {
              setId: 42,
              artist: "Synthetic Artist",
              title: `Synthetic Map ${position}`,
              difficulty: "Synthetic Difficulty",
              mapper: "Synthetic Mapper",
              stars: 4,
              bpm: 180,
              duration: 90,
            },
          })),
        );
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: 0,
        scoringRules: syntheticScoringRules,
        standingsRules: null,
      });
      fixtureBody = {
        ...confirm,
        action: "create",
        label: "Synthetic Result Fixture",
        roundId,
        homeTeamId: home.teamId,
        awayTeamId: away.teamId,
        position: 1,
        scheduledAt: null,
        timeZone: "Asia/Taipei",
        status: "scheduled",
        mappoolId: poolId,
        homeSourceId: null,
        homeSourceOutcome: null,
        awaySourceId: null,
        awaySourceOutcome: null,
        refereeIds: [referee.osuId],
      };
      fixtureId = (await fixtureCommand(admin, "test-cup", fixtureBody))
        .fixtures[0].id;
      source = await makeSource();
      vi.mocked(fetchMatchSource).mockResolvedValue(source);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
      rmSync(scratch, { recursive: true, force: true });
    });
    function base(view: MatchReview) {
      return {
        ...confirm,
        requestKey: randomUUID(),
        expectedVersion: view.context.result?.version ?? 0,
        expectedFixtureVersion: view.context.fixture.version,
      };
    }
    async function imported(id = fixtureId) {
      const view = await matchReview(referee, "test-cup", id);
      return importFixtureMatch(referee, "test-cup", id, {
        ...base(view),
        match: String(syntheticMatchId),
      });
    }
    function submission(view: MatchReview) {
      return {
        ...base(view),
        action: "submit",
        importId: view.importId!,
        rulesConfirmed: true,
        sourceChangesConfirmed: true,
        publicNote: "Synthetic public result note",
        decisions: view.source!.games.map((g) => ({
          gameId: g.id,
          included: true,
          complianceConfirmed: true,
          reason: "Synthetic explicit game review",
          substitutions: [],
        })),
      };
    }
    async function approved(view: MatchReview) {
      return (
        await resultCommand(admin, "test-cup", fixtureId, {
          ...base(view),
          action: "approve",
          revision: view.context.result!.currentRevision,
        })
      ).review;
    }
    async function published(view: MatchReview) {
      if (!view.context.fixture.publishedAt) {
        await fixtureCommand(admin, "test-cup", {
          ...confirm,
          action: "publish",
          fixtureId,
          expectedVersion: view.context.fixture.version,
          published: true,
        });
        view = await matchReview(admin, "test-cup", fixtureId);
      }
      return (
        await resultCommand(admin, "test-cup", fixtureId, {
          ...base(view),
          action: "publish",
          revision: view.context.result!.currentRevision,
          progressionAcknowledged: true,
        })
      ).review;
    }
    it("includes published maps without a scheduled fixture time using MP play times", async () => {
      source.games[2].startTime = null;
      for (const game of source.games)
        for (const score of game.scores) score.total! *= 10_000;
      let view = await imported();
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      await published(await approved(view));
      const before = (await publicFixture("test-cup", fixtureId))!;
      const uid = source.games[0].scores[0].osuId!;
      const participation = await publicPlayer(uid);
      const unscheduled = await playerMapPerformance(participation);
      expect(unscheduled).toMatchObject({
        mapsPlayed: 3,
        mapsWon: 2,
        mapsLost: 1,
      });
      expect(unscheduled.editions[0].maps.map((row) => row.at).sort()).toEqual(
        source.games.map((game) => game.startTime ?? game.endTime).sort(),
      );
      // Weekly awards still use the scheduled fixture time, independently of play time.
      expect(
        (await approvedRatingGames("test-cup", db())).every(
          (game) => game.at === null,
        ),
      ).toBe(true);
      await db()
        .update(fixtures)
        .set({ scheduledAt: new Date("2026-10-03T12:00:00Z") })
        .where(eq(fixtures.id, fixtureId));
      expect(await playerMapPerformance(participation)).toEqual(unscheduled);
      expect((await publicFixture("test-cup", fixtureId))!.result).toEqual(
        before.result,
      );
    });

    it("keeps each fixture's reviewed slots when two same-round pools share beatmaps", async () => {
      const uid = source.games[0].scores[0].osuId!;
      const firstFixtureId = fixtureId;
      const secondPoolId = randomUUID();
      await db()
        .insert(mappools)
        .values({
          id: secondPoolId,
          editionSlug: "test-cup",
          roundId: fixtureBody.roundId as string,
          name: "Synthetic second pool",
        });
      await db()
        .insert(mappoolEntries)
        .values(
          [1, 2, 3].map((position) => ({
            poolId: secondPoolId,
            category: "HD" as const,
            position: position + 6,
            beatmapId: 10000 + position,
            metadata: {
              setId: 42,
              artist: "Synthetic Artist",
              title: "Synthetic Map",
              difficulty: "Synthetic Difficulty",
              mapper: "Synthetic Mapper",
              stars: 4,
              bpm: 180,
              duration: 90,
            },
          })),
        );
      for (const second of [false, true]) {
        if (second) {
          const board = await fixtureCommand(admin, "test-cup", {
            ...fixtureBody,
            label: "Synthetic second fixture",
            position: 2,
            mappoolId: secondPoolId,
          });
          fixtureId = board.fixtures.find((f) => f.id !== firstFixtureId)!.id;
          source = await makeSource(false, 100);
          // HD is the reviewed slot category; keep the actual MP mods compliant.
          for (const game of source.games) game.mods = ["HD"];
        }
        for (const game of source.games)
          for (const score of game.scores) score.total! *= 10_000;
        vi.mocked(fetchMatchSource).mockResolvedValue(source);
        let view = await imported();
        view = (
          await resultCommand(referee, "test-cup", fixtureId, submission(view))
        ).review;
        await published(await approved(view));
      }
      // Editing current pool rows must not relabel the published revision.
      await db()
        .update(mappoolEntries)
        .set({ category: "HR" })
        .where(eq(mappoolEntries.poolId, secondPoolId));
      const performance = await playerMapPerformance(await publicPlayer(uid));
      expect(performance.mapsPlayed).toBe(6);
      const maps = performance.editions[0].maps;
      expect(
        maps
          .filter((m) => m.fixtureId === firstFixtureId)
          .map((m) => m.slot)
          .sort(),
      ).toEqual(["NM1", "NM2", "NM3"]);
      expect(
        maps
          .filter((m) => m.fixtureId === fixtureId)
          .map((m) => m.slot)
          .sort(),
      ).toEqual(["HD7", "HD8", "HD9"]);
      expect(maps.filter((m) => m.category === "HD")).toHaveLength(3);
    });

    it("uses the edition EZ multiplier for approved statistics while preserving raw and reviewed results", async () => {
      source.games[0].scores[0].mods = ["EZ"];
      let view = await imported();
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      await published(await approved(view));
      const before = (await publicFixture("test-cup", fixtureId))!;
      const saved = (await readTournament("test-cup"))!;
      const e = saved.edition;
      await tournamentCommand(admin, "test-cup", {
        action: "general",
        expectedRevision: saved.revision,
        confirmed: true,
        name: e.name,
        season: e.season,
        summary: e.summary,
        status: e.status,
        timeZone: e.timeZone,
        branding: e.branding,
        ezScoreMultiplier: 1.5,
      });
      const games = await approvedRatingGames("test-cup", db());
      const raw = source.games[0].scores[0];
      const adjusted = games
        .find((g) => g.gameId === source.games[0].id)!
        .scores.find((s) => s.userId === raw.osuId)!;
      expect(adjusted).toMatchObject({
        rawTotal: raw.total,
        total: Math.round(raw.total! * 1.5),
        scoreMultiplier: 1.5,
        mods: ["EZ"],
      });
      const after = (await publicFixture("test-cup", fixtureId))!;
      expect(after.result).toEqual(before.result);
      const detail = after.details!.games[0].scores.find(
        (s) => s.osuId === raw.osuId,
      )!;
      expect(detail.total).toBe(raw.total);
      expect(detail.statisticsTotal).toBe(adjusted.total);
      const playerRating = (fixture: typeof before) =>
        fixture.details!.rating!.players.find((p) => p.userId === raw.osuId)!;
      expect(playerRating(after).mra).toBeGreaterThan(playerRating(before).mra);
      expect(await approvedRatingGames("test-cup", db())).toEqual(games);
    });

    it("publishes exhibition results separately while official ratings, progression and career keep only the formal fixture", async () => {
      let view = await imported();
      const { rulesConfirmed, ...unconfirmed } = submission(view);
      expect(rulesConfirmed).toBe(true);
      await expect(
        resultCommand(referee, "test-cup", fixtureId, unconfirmed),
      ).rejects.toMatchObject({
        status: 400,
        message: "Confirm the approved scoring rules before submitting.",
      });
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      view = await published(await approved(view));
      const officialId = fixtureId;
      const officialRound = view.context.round.id;
      const homeId = view.context.fixture.homeTeamId;
      const playerId = view.context.teams[0].members[0].osuId;
      const before = await playerCompetitionRecord(
        await publicPlayer(playerId),
      );
      expect(before.matches).toBe(1);
      const created = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "round_create",
        stage: "exhibition",
        name: "Grand Finals",
        position: 1,
      });
      const round = created.rounds.find((r) => r.stage === "exhibition")!;
      await expect(
        mappoolCommand(admin, "test-cup", {
          ...confirm,
          action: "round_edit",
          roundId: round.id,
          expectedVersion: round.version,
          stage: "knockout",
          name: "Forged official",
          position: 1,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId: round.id,
        expectedVersion: round.version,
        scoringRules: syntheticScoringRules,
        standingsRules: null,
      });
      const workspace = await fixtureCommand(admin, "test-cup", {
        ...fixtureBody,
        roundId: round.id,
        mappoolId: null,
        label: "Exhibition Final",
      });
      fixtureId = workspace.fixtures.find((f) => f.roundId === round.id)!.id;
      source = await makeSource(false, 10000);
      vi.mocked(fetchMatchSource).mockResolvedValue(source);
      view = await imported();
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      // This fixture's compliant games produce the same scores under the
      // older sum policy. Restore its saved rule snapshot as on a pre-upgrade submission.
      expect(view.current?.proposal?.rulesSnapshot).toBeNull();
      await db()
        .update(resultRevisions)
        .set({
          proposal: {
            ...view.current!.proposal!,
            rulesSnapshot: view.context.round.scoringRules,
          },
        })
        .where(eq(resultRevisions.fixtureId, fixtureId));
      await published(await approved(view));
      const competition = (await publicCompetition("test-cup"))!;
      expect(
        competition.fixtures.map((f) => [f.id, f.stage, Boolean(f.result)]),
      ).toEqual(
        expect.arrayContaining([
          [officialId, "group", true],
          [fixtureId, "exhibition", true],
        ]),
      );
      expect(
        (await publicFixture("test-cup", fixtureId))?.details?.rating,
      ).toBeNull();
      expect(await publicMatchRating("test-cup", fixtureId)).toBeNull();
      const games = await approvedRatingGames("test-cup", db());
      expect(games).toHaveLength(3);
      expect(games.every((game) => game.fixtureId === officialId)).toBe(true);
      expect(
        (await publicRoundRatings("test-cup")).map((r) => r.roundId),
      ).toEqual([officialRound]);
      expect(
        (
          await staffRoundRatings(
            "test-cup",
            db(),
            games,
            await ratingIdentities("test-cup", db()),
          )
        ).map((r) => r.roundId),
      ).toEqual([officialRound]);
      const career = await playerCompetitionRecord(
        await publicPlayer(playerId),
      );
      expect(career.matches).toBe(before.matches);
      expect(career.wins).toBe(before.wins);
      expect(career.championships).toBe(before.championships);
      // A formally named exhibition cannot become a knockout progression source.
      const ko = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "round_create",
        stage: "knockout",
        name: "Formal final",
        position: 1,
      });
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...fixtureBody,
          roundId: ko.rounds.find((r) => r.stage === "knockout")!.id,
          mappoolId: null,
          label: "Bad progression",
          homeTeamId: homeId,
          homeSourceId: fixtureId,
          homeSourceOutcome: "winner",
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("scores saved referee EX declarations and blocks approval after the declaration changes", async () => {
      const ctx = await fixtureForReview(admin, "test-cup", fixtureId);
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId: ctx.round.id,
        expectedVersion: ctx.round.version,
        scoringRules: { ...syntheticScoringRules, exPlayersPerTeam: 1 },
        standingsRules: null,
      });
      let workspace = await refereeWorkspace(referee, "test-cup", fixtureId);
      async function live(action: Record<string, unknown>, actor = admin) {
        const result = await refereeCommand(actor, "test-cup", fixtureId, {
          ...action,
          requestKey: randomUUID(),
          expectedRevision: workspace.session?.revision ?? 0,
          dependencyFingerprint: workspace.dependencyFingerprint,
        });
        workspace = result.workspace;
      }
      await live({
        action: "configure_policy",
        expectedPolicyRevision: 0,
        policy: {
          commands: null,
          steps: Array.from({ length: 3 }, (_, i) => ({
            kind: "pick",
            actor: i % 2 ? "secondPick" : "firstPick",
            categories: [],
            entryIds: [],
            avoidRepeatCategory: false,
            tiedAt: null,
          })),
        },
      });
      await live({
        action: "set_order",
        firstBanTeamId: workspace.teams[0].id,
        firstPickTeamId: workspace.teams[0].id,
      });
      await live({
        action: "record_selection",
        entryId: workspace.maps.find((m) => m.beatmapId === 10001)!.id,
      });
      const pickId = workspace.projection.lastSelectionId!;
      await live({ action: "declare_ex", pickId, enabled: true }, referee);
      source.games[0].scores = source.games[0].scores.filter(
        (_, i) => i === 0 || i === 2,
      );
      source.fingerprint = createHash("sha256")
        .update(JSON.stringify(source))
        .digest("hex");
      vi.mocked(fetchMatchSource).mockResolvedValue(source);
      let view = await imported();
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      expect(view.current?.proposal?.games[0].exMode).toBe(true);
      expect(
        view.current?.proposal?.exDeclarations?.some(
          (p) => p.id === pickId && p.exMode,
        ),
      ).toBe(true);
      await live({ action: "declare_ex", pickId, enabled: false }, referee);
      await expect(approved(view)).rejects.toMatchObject({ status: 400 });
      expect(
        (await matchReview(admin, "test-cup", fixtureId)).current?.approvedAt,
      ).toBeNull();
    });
    it("publishes only reviewed snapshots and derives configured group standings without private data", async () => {
      let view = await imported();
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId,
        expectedVersion: 0,
        published: true,
      });
      view = await matchReview(referee, "test-cup", fixtureId);
      expect((await publicFixture("test-cup", fixtureId))?.result).toBeNull();
      const stage = (await db().select().from(tournamentStages))[0];
      let group = {
        version: "synthetic-groups-v1",
        groups: [
          {
            name: "Synthetic Group A",
            teamIds: view.context.teams.map((t) => t.id),
          },
        ],
      };
      await expect(
        fixtureCommand(referee, "test-cup", {
          ...confirm,
          action: "stage_groups",
          stageId: stage.id,
          expectedVersion: 0,
          configuration: group,
          published: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...confirm,
          action: "stage_groups",
          stageId: stage.id,
          expectedVersion: 0,
          configuration: {
            ...group,
            groups: [
              ...group.groups,
              { ...group.groups[0], key: "synthetic-duplicate-team" },
            ],
          },
          published: true,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "stage_groups",
        stageId: stage.id,
        expectedVersion: 0,
        configuration: group,
        published: false,
      });
      group = (await db().select().from(tournamentStages))[0]
        .groupConfiguration!;
      expect((await publicCompetition("test-cup"))?.groups).toEqual([]);
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "stage_groups",
        stageId: stage.id,
        expectedVersion: 1,
        configuration: group,
        published: true,
      });
      expect(
        (await publicCompetition("test-cup"))?.groups[0].rankingPending,
      ).toBe(true);
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      expect((await publicFixture("test-cup", fixtureId))?.result).toBeNull();
      view = await approved(view);
      expect((await publicFixture("test-cup", fixtureId))?.result).toBeNull();
      view = await published(view);
      let publicData = (await publicCompetition("test-cup"))!;
      expect(publicData.fixtures[0].pool).toBeNull();
      const [pool] = await db()
        .select()
        .from(mappools)
        .where(eq(mappools.id, poolId));
      for (const published of [true, false]) {
        await expect(
          mappoolCommand(mapper, "test-cup", {
            ...confirm,
            action: "pool_publish",
            poolId,
            expectedVersion: pool.version,
            published,
          }),
        ).rejects.toMatchObject({ status: 409 });
      }
      expect((await publicFixture("test-cup", fixtureId))?.pool).toBeNull();
      expect(publicData.fixtures[0].result).toMatchObject({
        homeWins: 2,
        awayWins: 1,
        revision: 1,
        mpId: syntheticMatchId,
      });
      expect(publicData.groups[0].rows.map((r) => r.played)).toEqual([1, 1]);
      expect(
        publicData.groups[0].rows.every(
          (r) => r.points === null && r.rank === null,
        ),
      ).toBe(true);
      const serialized = JSON.stringify(publicData);
      for (const privateField of [
        "SYNTHETIC_PRIVATE_CONTACT",
        "SYNTHETIC_INTERNAL_REASON",
        "rosterSnapshot",
        "sourceFingerprint",
        "decisions",
        "createdBy",
        "approvedBy",
        "Internal",
        "substitutions",
        "attribution",
      ])
        expect(serialized).not.toContain(privateField);
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId: view.context.round.id,
        expectedVersion: view.context.round.version,
        scoringRules: syntheticScoringRules,
        standingsRules: {
          version: "synthetic-points-v1",
          winPoints: 3,
          lossPoints: 0,
          drawPoints: null,
          tiebreakers: ["points", "map_difference"],
        },
      });
      publicData = (await publicCompetition("test-cup"))!;
      expect(publicData.groups[0].rankingPending).toBe(false);
      expect(publicData.groups[0].rows.map((r) => [r.rank, r.points])).toEqual([
        [1, 3],
        [2, 0],
      ]);
      await db()
        .update(teams)
        .set({ rosterPublished: false })
        .where(eq(teams.id, view.context.fixture.homeTeamId));
      expect((await publicCompetition("test-cup"))?.fixtures).toEqual([]);
      group = (await db().select().from(tournamentStages))[0]
        .groupConfiguration!;
      expect((await publicCompetition("test-cup"))?.groups).toEqual([]);
      expect(await publicFixture("private-test-cup", fixtureId)).toBeNull();
    });
    it("holds downstream results after a corrected knockout winner and disables legacy score authority", async () => {
      const maps = await mappoolCommand(admin, "test-cup", {
        ...confirm,
        action: "round_create",
        stage: "knockout",
        name: "Synthetic KO",
        position: 1,
      });
      const roundId = maps.rounds.find((r) => r.stage === "knockout")!.id;
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "round_rules",
        roundId,
        expectedVersion: 0,
        scoringRules: syntheticScoringRules,
        standingsRules: null,
      });
      fixtureBody = { ...fixtureBody, roundId, mappoolId: null };
      await fixtureCommand(admin, "test-cup", {
        ...Object.fromEntries(
          Object.entries(fixtureBody).filter(([key]) => key !== "refereeIds"),
        ),
        action: "edit",
        fixtureId,
        expectedVersion: 0,
      });
      let root = await imported();
      root = (
        await resultCommand(referee, "test-cup", fixtureId, submission(root))
      ).review;
      root = await published(await approved(root));
      const legacyFile = join(scratch, "legacy-brackets.json");
      writeFileSync(
        legacyFile,
        JSON.stringify([
          bracketFixture(
            "test-cup",
            root.context.fixture.homeTeamId,
            root.context.fixture.awayTeamId,
          ),
        ]),
      );
      vi.stubEnv("OCLR_BRACKETS_FILE", legacyFile);
      expect((await publicBracket("test-cup"))?.formatLabel).toBe(
        "Knockout Stage · configured fixture progression",
      );
      const third = await seedPublicDirectory(293001);
      let child = (
        await fixtureCommand(admin, "test-cup", {
          ...fixtureBody,
          label: "Synthetic Future Fixture",
          position: 2,
          awayTeamId: third.teamId,
          homeSourceId: fixtureId,
          homeSourceOutcome: "winner",
        })
      ).fixtures.find((f) => f.position === 2)!;
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId: child.id,
        expectedVersion: child.version,
        published: true,
      });
      const childContext = await fixtureForReview(
        referee,
        "test-cup",
        child.id,
      );
      const oldIds = root.context.teams.flatMap((t) =>
        t.members.map((m) => m.osuId),
      );
      const newIds = childContext.teams.flatMap((t) =>
        t.members.map((m) => m.osuId),
      );
      const childSource = structuredClone(source);
      childSource.games = childSource.games.map((g) => ({
        ...g,
        id: g.id + 100,
        scores: g.scores.map((s) => ({
          ...s,
          osuId: newIds[oldIds.indexOf(s.osuId!)],
        })),
      }));
      childSource.events = childSource.events.map((e) => ({
        ...e,
        gameId: e.gameId! + 100,
      }));
      childSource.fingerprint = createHash("sha256")
        .update(JSON.stringify(childSource.games))
        .digest("hex");
      vi.mocked(fetchMatchSource).mockResolvedValue(childSource);
      let cv = await imported(child.id);
      cv = (await resultCommand(referee, "test-cup", child.id, submission(cv)))
        .review;
      cv = (
        await resultCommand(admin, "test-cup", child.id, {
          ...base(cv),
          action: "approve",
          revision: 1,
        })
      ).review;
      await resultCommand(admin, "test-cup", child.id, {
        ...base(cv),
        action: "publish",
        revision: 1,
        progressionAcknowledged: true,
      });
      expect(
        (await publicFixture("test-cup", child.id))?.result?.homeWins,
      ).toBe(2);
      expect(
        (await publicBracket("test-cup"))?.groups[0].rounds[0].matches,
      ).toHaveLength(2);
      vi.mocked(fetchMatchSource).mockResolvedValue(await makeSource(true));
      root = await imported();
      const correction = submission(root);
      correction.decisions[2] = {
        ...correction.decisions[2],
        included: false,
        reason: "Synthetic game after the corrected series finished",
      };
      root = (await resultCommand(referee, "test-cup", fixtureId, correction))
        .review;
      root = await approved(root);
      expect(
        (await publicFixture("test-cup", child.id))?.result,
      ).not.toBeNull();
      root = await published(root);
      const publicChild = (await publicFixture("test-cup", child.id))!;
      expect(publicChild.confirmed).toBe(false);
      expect(publicChild.home.team?.id).toBe(root.context.fixture.awayTeamId);
      expect(publicChild.result).toBeNull();
      expect(publicChild.scheduledAt).toBeNull();
      // Withdrawal preserves immutable approved history. A structural correction
      // requires a replacement fixture, rather than rewriting that history.
      const savedChild = await matchReview(admin, "test-cup", child.id);
      await resultCommand(admin, "test-cup", child.id, {
        ...base(savedChild),
        action: "void",
        decisionNote: "Synthetic competition adjudication explanation.",
        progressionAcknowledged: true,
      });
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId: child.id,
        expectedVersion: savedChild.context.fixture.version,
        published: false,
      });
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...Object.fromEntries(
            Object.entries(fixtureBody).filter(([key]) => key !== "refereeIds"),
          ),
          action: "edit",
          fixtureId: child.id,
          expectedVersion: savedChild.context.fixture.version + 1,
          label: "Synthetic Future Fixture",
          position: 2,
          homeTeamId: root.context.fixture.awayTeamId,
          awayTeamId: third.teamId,
          homeSourceId: fixtureId,
          homeSourceOutcome: "winner",
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await matchReview(admin, "test-cup", child.id)).revisions[0].proposal
          ?.teamIds[0],
      ).toBe(root.context.fixture.homeTeamId);
      child = (
        await fixtureCommand(admin, "test-cup", {
          ...fixtureBody,
          label: "Synthetic Replacement Fixture",
          position: 3,
          homeTeamId: root.context.fixture.awayTeamId,
          awayTeamId: third.teamId,
          homeSourceId: fixtureId,
          homeSourceOutcome: "winner",
        })
      ).fixtures.find((f) => f.label === "Synthetic Replacement Fixture")!;
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId: child.id,
        expectedVersion: child.version,
        published: true,
      });

      const bracketChild = (await publicBracket(
        "test-cup",
      ))!.groups[0].rounds[0].matches.find((m) => m.id === child.id)!;
      expect(bracketChild.status).toBe("pending");
      expect(bracketChild.scores).toEqual([null, null]);
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId,
        expectedVersion: root.context.fixture.version,
        published: false,
      });
      const hiddenLineage = (await publicFixture("test-cup", child.id))!;
      expect(hiddenLineage.home.team).toBeNull();
      expect(hiddenLineage.home.sourceId).toBeNull();
      expect(hiddenLineage.result).toBeNull();
      expect((await publicCompetition("test-cup"))?.databaseAuthority).toBe(
        true,
      );
      await db()
        .update(fixtures)
        .set({ publishedAt: null })
        .where(eq(fixtures.id, child.id));
      expect(await publicBracket("test-cup")).toBeNull();
    });
    it("approves and publishes a reviewed proposal atomically with explicit dependency review", async () => {
      let view = (
        await resultCommand(
          referee,
          "test-cup",
          fixtureId,
          submission(await imported()),
        )
      ).review;
      const payload = () => ({
        ...base(view),
        action: "approve_publish",
        revision: 1,
        progressionAcknowledged: true,
      });
      const auditCount = (await db().select().from(resultAuditEvents)).length;
      await expect(
        resultCommand(referee, "test-cup", fixtureId, payload()),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        resultCommand(admin, "test-cup", fixtureId, payload()),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await matchReview(admin, "test-cup", fixtureId)).current?.approvedAt,
      ).toBeNull();
      expect((await db().select().from(resultAuditEvents)).length).toBe(
        auditCount,
      );
      await fixtureCommand(admin, "test-cup", {
        ...confirm,
        action: "publish",
        fixtureId,
        expectedVersion: view.context.fixture.version,
        published: true,
      });
      view = await matchReview(admin, "test-cup", fixtureId);
      const poolBefore = await db()
        .select()
        .from(mappools)
        .where(eq(mappools.id, poolId));
      const claimsBefore = await db()
        .select()
        .from(resultGameClaims)
        .where(eq(resultGameClaims.fixtureId, fixtureId));
      await db().execute(sql`
        CREATE FUNCTION test_reject_publication_audit() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'result_approve_publish' THEN
            RAISE EXCEPTION 'Synthetic publication audit failure';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER test_reject_publication_audit
        BEFORE INSERT ON result_audit_events
        FOR EACH ROW EXECUTE FUNCTION test_reject_publication_audit();
      `);
      try {
        await expect(
          resultCommand(admin, "test-cup", fixtureId, payload()),
        ).rejects.toThrow();
        const rolledBack = await matchReview(admin, "test-cup", fixtureId);
        expect(rolledBack.context.result).toEqual(view.context.result);
        expect(rolledBack.current).toEqual(view.current);
        expect(rolledBack.published).toBeNull();
        expect((await publicFixture("test-cup", fixtureId))?.result).toBeNull();
        expect(
          await db().select().from(mappools).where(eq(mappools.id, poolId)),
        ).toEqual(poolBefore);
        expect(
          await db()
            .select()
            .from(resultGameClaims)
            .where(eq(resultGameClaims.fixtureId, fixtureId)),
        ).toEqual(claimsBefore);
      } finally {
        await db().execute(sql`
          DROP TRIGGER test_reject_publication_audit ON result_audit_events;
          DROP FUNCTION test_reject_publication_audit();
        `);
      }
      const commands = [payload(), payload()];
      const invalidate = vi.mocked(revalidatePath);
      invalidate.mockClear();
      invalidate.mockImplementationOnce(() => {
        throw new Error("Synthetic cache failure");
      });
      const diagnostic = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const attempts = await Promise.all(
        commands.map((c) =>
          post(resultRoute, changeMatchResultWrite.path, fixtureId, admin, c),
        ),
      ).finally(() => diagnostic.mockRestore());
      expect(invalidate).toHaveBeenCalledExactlyOnceWith(
        "/tournaments/test-cup",
        "layout",
      );
      expect(attempts.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const winningIndex = attempts.findIndex((response) => response.ok);
      const body = await attempts[winningIndex].json();
      expect(
        extendedSchemas[changeMatchResultWrite.response.readResource].parse(
          body,
        ),
      ).toEqual(body);
      expect(body.context.result.publishedRevision).toBe(1);
      const replay = await post(
        resultRoute,
        changeMatchResultWrite.path,
        fixtureId,
        admin,
        commands[winningIndex],
      );
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(body);
      expect(invalidate).toHaveBeenCalledTimes(2);
      const saved = await matchReview(admin, "test-cup", fixtureId);
      expect(saved.context.result).toMatchObject({
        state: "approved",
        publishedRevision: 1,
      });
      expect(saved.current?.approvedBy).toBe(admin.osuId);
      expect(
        (await publicFixture("test-cup", fixtureId))?.result,
      ).toMatchObject({ homeWins: 2, awayWins: 1 });
      expect(
        (await db().select().from(resultAuditEvents)).filter(
          (e) => e.action === "result_approve_publish",
        ),
      ).toHaveLength(1);
      expect(
        (await db().select().from(mappools).where(eq(mappools.id, poolId)))[0]
          .lockedAt,
      ).not.toBeNull();
    });
    it("persists source evidence, requires referee review/Admin approval, and publishes only an approved revision", async () => {
      let view = await imported();
      expect(view.context.result).toMatchObject({
        state: "draft",
        currentRevision: 0,
        publishedRevision: null,
      });
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      expect(view.context.result).toMatchObject({
        state: "submitted",
        currentRevision: 1,
        publishedRevision: null,
      });
      expect(view.current?.proposal?.games[0]).toMatchObject({
        confidence: "roster",
        attribution: [
          { evidence: "roster" },
          { evidence: "roster" },
          { evidence: "roster" },
          { evidence: "roster" },
        ],
      });
      expect(view.current?.proposal?.series).toMatchObject({
        homeWins: 2,
        awayWins: 1,
        complete: true,
      });
      await expect(
        resultCommand(referee, "test-cup", fixtureId, {
          ...base(view),
          action: "approve",
          revision: 1,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        resultCommand(admin, "test-cup", fixtureId, {
          ...base(view),
          action: "publish",
          revision: 1,
          progressionAcknowledged: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      view = await approved(view);
      expect(view.current?.approvedBy).toBe(admin.osuId);
      expect(view.context.result?.publishedRevision).toBeNull();
      view = await published(view);
      expect(view.context.result?.publishedRevision).toBe(1);
      expect(view.published?.proposal?.series.homeWins).toBe(2);
      expect(
        (await db().select().from(mappools).where(eq(mappools.id, poolId)))[0]
          .lockedAt,
      ).not.toBeNull();
      await expect(
        mappoolCommand(mapper, "test-cup", {
          ...confirm,
          action: "entry_remove",
          poolId,
          expectedVersion: 0,
          entryId: (await db().select().from(mappoolEntries))[0].id,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await db().select().from(resultAuditEvents)).filter(
          (e) => e.action === "result_approve",
        )[0].actorId,
      ).toBe(admin.osuId);
      await closeDb();
      expect(
        (await matchReview(referee, "test-cup", fixtureId)).context.result
          ?.publishedRevision,
      ).toBe(1);
    });
    it("keeps repeated imports and exact command retries idempotent without duplicating games or reports", async () => {
      const initial = await matchReview(referee, "test-cup", fixtureId);
      const payload = { ...base(initial), match: String(syntheticMatchId) };
      const preview = await post(
        previewRoute,
        previewMatchImportWrite.path,
        fixtureId,
        referee,
        {
          match: payload.match,
        },
      );
      expect(preview.status).toBe(200);
      const previewBody = await preview.json();
      expect(previewMatchImportWrite.response.parse(previewBody)).toEqual(
        previewBody,
      );
      expect(previewBody).toMatchObject({
        expectedVersion: 0,
        expectedFixtureVersion: initial.context.fixture.version,
        suggested: {
          homeTeamId: initial.context.fixture.homeTeamId,
          awayTeamId: initial.context.fixture.awayTeamId,
        },
      });
      expect(await db().select().from(matchImports)).toHaveLength(0);
      const save = () =>
        post(
          importRoute,
          importMatchResultWrite.path,
          fixtureId,
          referee,
          payload,
        );
      const first = await save();
      expect(first.status).toBe(200);
      const body = await first.json();
      expect(
        extendedSchemas[importMatchResultWrite.response.readResource].parse(
          body,
        ),
      ).toEqual(body);
      const calls = vi.mocked(fetchMatchSource).mock.calls.length;
      const retry = await save();
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(body);
      expect(vi.mocked(fetchMatchSource).mock.calls).toHaveLength(calls);
      const current = await matchReview(referee, "test-cup", fixtureId);
      const view = await importFixtureMatch(referee, "test-cup", fixtureId, {
        ...base(current),
        match: String(syntheticMatchId),
      });
      expect(await db().select().from(matchImports)).toHaveLength(1);
      expect(await db().select().from(matchGames)).toHaveLength(3);
      expect(view.context.result?.version).toBe(1);
      const submit = submission(view);
      await resultCommand(referee, "test-cup", fixtureId, submit);
      await resultCommand(referee, "test-cup", fixtureId, submit);
      expect(await db().select().from(resultRevisions)).toHaveLength(1);
      expect(
        (await db().select().from(resultAuditEvents)).filter(
          (e) => e.action === "result_submit",
        ),
      ).toHaveLength(1);
      await expect(
        resultCommand(referee, "test-cup", fixtureId, {
          ...submit,
          publicNote: "Different payload",
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("commits one competing referee/Admin submission and returns a conflict to the other", async () => {
      const view = await imported();
      const payload = submission(view);
      const results = await Promise.allSettled([
        resultCommand(referee, "test-cup", fixtureId, payload),
        resultCommand(admin, "test-cup", fixtureId, {
          ...payload,
          requestKey: randomUUID(),
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      expect(await db().select().from(resultRevisions)).toHaveLength(1);
    });
    it("shows upstream differences before the first referee submission", async () => {
      let view = await imported();
      expect(view.current).toBeNull();
      expect(view.diff).toBeNull();
      vi.mocked(fetchMatchSource).mockResolvedValue(await makeSource(true));
      view = await imported();
      expect(view.current).toBeNull();
      expect(view.diff?.changed).toEqual([1]);
      expect(view.context.result?.publishedRevision).toBeNull();
    });
    it("detects changed upstream facts and preserves the published result until a new reviewed correction is approved/published", async () => {
      let view = await imported();
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      view = await published(await approved(view));
      const oldProposal = view.published!.proposal;
      const changed = await makeSource(true);
      vi.mocked(fetchMatchSource).mockResolvedValue(changed);
      view = await importFixtureMatch(referee, "test-cup", fixtureId, {
        ...base(view),
        match: String(syntheticMatchId),
      });
      expect(view.diff?.changed).toEqual([1]);
      expect(view.published?.proposal).toEqual(oldProposal);
      expect(view.context.result?.publishedRevision).toBe(1);
      await expect(
        resultCommand(admin, "test-cup", fixtureId, {
          ...base(view),
          action: "publish",
          revision: 1,
          progressionAcknowledged: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      const payload = submission(view);
      payload.decisions[2] = {
        ...payload.decisions[2],
        included: false,
        reason: "Synthetic extra game after corrected series",
      };
      payload.publicNote = "Synthetic corrected public note";
      view = (await resultCommand(referee, "test-cup", fixtureId, payload))
        .review;
      expect(view.current?.proposal?.series).toMatchObject({
        awayWins: 2,
        homeWins: 0,
      });
      expect(view.context.result?.publishedRevision).toBe(1);
      view = await approved(view);
      expect(await db().select().from(resultGameClaims)).toHaveLength(3);
      expect(view.context.result?.publishedRevision).toBe(1);
      view = await published(view);
      expect(view.context.result?.publishedRevision).toBe(2);
      expect(await db().select().from(resultGameClaims)).toHaveLength(2);
      expect(view.revisions.find((r) => r.revision === 1)?.proposal).toEqual(
        oldProposal,
      );
    });
    it("prevents the same source games from being approved for two distinct fixtures", async () => {
      let one = await imported();
      one = (
        await resultCommand(referee, "test-cup", fixtureId, submission(one))
      ).review;
      await approved(one);
      const second = (
        await fixtureCommand(admin, "test-cup", {
          ...fixtureBody,
          label: "Synthetic Duplicate Source Fixture",
          position: 2,
        })
      ).fixtures.find((f) => f.position === 2)!;
      let two = await imported(second.id);
      two = (
        await resultCommand(referee, "test-cup", second.id, submission(two))
      ).review;
      await expect(
        resultCommand(admin, "test-cup", second.id, {
          ...base(two),
          action: "approve",
          revision: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await matchReview(admin, "test-cup", second.id)).context.result?.state,
      ).toBe("submitted");
      expect(await db().select().from(resultGameClaims)).toHaveLength(3);
    });
    it("denies wrong roles, revoked roles, forged fields and invalid game review without provider side effects", async () => {
      const view = await matchReview(admin, "test-cup", fixtureId);
      for (const actor of [mapper, outsider]) {
        await expect(
          matchReview(actor, "test-cup", fixtureId),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          importFixtureMatch(actor, "test-cup", fixtureId, {
            ...base(view),
            match: String(syntheticMatchId),
          }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          resultCommand(actor, "test-cup", fixtureId, {}),
        ).rejects.toMatchObject({ status: 403 });
      }
      expect(fetchMatchSource).not.toHaveBeenCalled();
      let current = await imported();
      const payload = submission(current);
      await expect(
        resultCommand(referee, "test-cup", fixtureId, {
          ...payload,
          actorId: admin.osuId,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        resultCommand(referee, "test-cup", fixtureId, {
          ...payload,
          decisions: payload.decisions.slice(0, 1),
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        resultCommand(referee, "test-cup", fixtureId, {
          ...payload,
          decisions: payload.decisions.map((d) => ({
            ...d,
            complianceConfirmed: false,
          })),
        }),
      ).rejects.toMatchObject({ status: 400 });
      current = (await resultCommand(referee, "test-cup", fixtureId, payload))
        .review;
      const beforeRejectedNotes = (await db().select().from(resultAuditEvents))
        .length;
      for (const action of [
        { action: "reject", revision: 1 },
        { action: "void", progressionAcknowledged: true },
      ]) {
        for (const note of [{}, { decisionNote: " " }])
          await expect(
            resultCommand(admin, "test-cup", fixtureId, {
              ...base(current),
              ...action,
              ...note,
            }),
          ).rejects.toMatchObject({ status: 400 });
      }
      expect(await db().select().from(resultAuditEvents)).toHaveLength(
        beforeRejectedNotes,
      );
      for (const action of [
        { action: "approve", revision: 1 },
        { action: "publish", revision: 1, progressionAcknowledged: true },
        {
          action: "reject",
          decisionNote: "Synthetic competition adjudication explanation.",
          revision: 1,
        },
        { action: "unpublish" },
        {
          action: "void",
          decisionNote: "Synthetic competition adjudication explanation.",
          progressionAcknowledged: true,
        },
      ])
        await expect(
          resultCommand(referee, "test-cup", fixtureId, {
            ...base(current),
            ...action,
          }),
        ).rejects.toMatchObject({ status: 403 });
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, referee.osuId));
      await expect(
        matchReview(referee, "test-cup", fixtureId),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("does not corrupt saved official results when provider retrieval fails", async () => {
      let view = await imported();
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      view = await published(await approved(view));
      const before = (await db().select().from(matchResults))[0];
      const count = (await db().select().from(resultAuditEvents)).length;
      vi.mocked(fetchMatchSource).mockRejectedValue(
        new HttpError(502, "Synthetic provider outage"),
      );
      await expect(
        importFixtureMatch(referee, "test-cup", fixtureId, {
          ...base(view),
          match: String(syntheticMatchId),
        }),
      ).rejects.toMatchObject({ status: 502 });
      expect((await db().select().from(matchResults))[0]).toEqual(before);
      expect(await db().select().from(matchImports)).toHaveLength(1);
      expect(await db().select().from(resultAuditEvents)).toHaveLength(count);
    });
    it("rejects and withdraws reports through audited Admin commands without inventing a forfeit or deleting history", async () => {
      let view = await imported();
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      view = (
        await resultCommand(admin, "test-cup", fixtureId, {
          ...base(view),
          action: "reject",
          decisionNote: "Synthetic competition adjudication explanation.",
          revision: 1,
        })
      ).review;
      expect(view.context.result?.state).toBe("draft");
      expect(view.current?.approvedAt).toBeNull();
      view = (
        await resultCommand(referee, "test-cup", fixtureId, submission(view))
      ).review;
      view = await published(await approved(view));
      view = (
        await resultCommand(admin, "test-cup", fixtureId, {
          ...base(view),
          action: "unpublish",
        })
      ).review;
      expect(view.context.result?.publishedRevision).toBeNull();
      view = (
        await resultCommand(admin, "test-cup", fixtureId, {
          ...base(view),
          action: "void",
          decisionNote: "Synthetic competition adjudication explanation.",
          progressionAcknowledged: true,
        })
      ).review;
      expect(view.context.result).toMatchObject({
        state: "draft",
        publishedRevision: null,
        currentRevision: 2,
      });
      expect(view.revisions).toHaveLength(2);
      expect(await db().select().from(resultGameClaims)).toHaveLength(0);
    });
  },
);
