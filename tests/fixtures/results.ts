import { assertTestDatabase } from "../database";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  matchGames,
  mappoolEntries,
  matchImports,
  matchResults,
  staffRoles,
} from "../../src/db/schema";
import { fixtureCommand } from "../../src/lib/fixtures";
import { fixtureForReview } from "../../src/lib/fixture-reads";
import { mappoolCommand } from "../../src/lib/mappools";
import { matchSourceSchema } from "../../src/lib/match-model";
import { seedPublicDirectory } from "./players";
import {
  syntheticApiGame,
  syntheticScoringRules,
  syntheticMatchId,
} from "./match";
// Browser fixture only: transport-independent stored provider snapshots. Never used by application routes.
export async function seedResultReview(
  adminId: number,
  refereeId: number,
  base: number,
  stage: "group" | "knockout" | "exhibition" = "group",
  withPool = false,
  openExhibition = false,
) {
  const url = process.env.TEST_DATABASE_URL;
  assertTestDatabase(url);
  process.env.DATABASE_URL = url;
  process.env.ADMIN_OSU_IDS = String(adminId);
  await db().execute(sql`TRUNCATE tournament_stages CASCADE`);
  const home = await seedPublicDirectory(base);
  const away = await seedPublicDirectory(base + 10);
  await db()
    .insert(staffRoles)
    .values({
      userId: refereeId,
      role: "referee",
      editionSlug: "test-cup",
      grantedBy: adminId,
    })
    .onConflictDoNothing();
  const actor = { osuId: adminId, username: "Synthetic Admin" };
  const confirm = {
    confirmed: true,
  };
  const maps = await mappoolCommand(actor, "test-cup", {
    ...confirm,
    action: "round_create",
    stage,
    name: "Synthetic Review Round",
    position: 1,
  });
  const roundId = maps.rounds[0].id;
  await fixtureCommand(actor, "test-cup", {
    ...confirm,
    action: "round_rules",
    roundId,
    expectedVersion: 0,
    scoringRules: syntheticScoringRules,
    standingsRules: null,
  });
  let poolId: string | null = null;
  if (withPool) {
    const maps = await mappoolCommand(actor, "test-cup", {
      ...confirm,
      action: "pool_create",
      roundId,
      name: "Synthetic Released Fixture Pool",
    });
    const pool = maps.pools.find((p) => p.roundId === roundId)!;
    poolId = pool.id;
    await db()
      .insert(mappoolEntries)
      .values(
        [1, 2, 3].map((position) => ({
          poolId: pool.id,
          category: "NM" as const,
          position,
          beatmapId: 10000 + position,
          metadata: {
            setId: 42,
            title: `Synthetic Map ${position}`,
            artist: "Synthetic Artist",
            difficulty: "Synthetic Difficulty",
            mapper: "Synthetic Mapper",
            stars: 4,
            bpm: 180,
            duration: 90,
          },
        })),
      );
    await mappoolCommand(actor, "test-cup", {
      ...confirm,
      action: "pool_publish",
      poolId,
      expectedVersion: 0,
      published: true,
    });
  }
  const workspace = await fixtureCommand(actor, "test-cup", {
    ...confirm,
    action: "create",
    label: "Synthetic Reviewed Fixture",
    roundId,
    homeTeamId: openExhibition ? null : home.teamId,
    awayTeamId: openExhibition ? null : away.teamId,
    position: 1,
    scheduledAt: null,
    timeZone: "Asia/Taipei",
    status: "scheduled",
    mappoolId: poolId,
    homeSourceId: null,
    homeSourceOutcome: null,
    awaySourceId: null,
    awaySourceOutcome: null,
    refereeIds: [refereeId],
  });
  const fixtureId = workspace.fixtures[0].id;
  await fixtureCommand(actor, "test-cup", {
    ...confirm,
    action: "publish",
    fixtureId,
    expectedVersion: 0,
    published: true,
  });
  const context = await fixtureForReview(actor, "test-cup", fixtureId);
  const ids = openExhibition
    ? [9901001, 9901002, 9901003, 9901004]
    : context.teams.flatMap((t) => t.members.map((m) => m.osuId));
  const games = [
    syntheticApiGame(1),
    syntheticApiGame(2, 100, 200),
    syntheticApiGame(3),
  ].map((g) => ({
    id: g.id,
    beatmapId: g.beatmap_id,
    startTime: g.start_time,
    endTime: g.end_time,
    mode: g.mode,
    teamType: g.team_type,
    scoringType: g.scoring_type,
    mods: g.mods,
    problems: [],
    beatmap: {
      setId: 42,
      title: g.beatmap.beatmapset.title,
      artist: "Synthetic Artist",
      difficulty: "Synthetic Difficulty",
    },
    scores: g.scores.map((s, i) => ({
      osuId:
        openExhibition && g.id === 2
          ? ids[(i + 2) % 4]
          : openExhibition && g.id === 3 && i === 0
            ? 9901005
            : ids[i],
      total: s.total_score,
      team: s.match.team,
      slot: s.match.slot,
      passed: true,
      mods: [],
      accuracy: 0.98,
      combo: 100,
      providerFields: {},
      problems: [],
    })),
  }));
  const source = matchSourceSchema.parse({
    schemaVersion: 1,
    ...(openExhibition
      ? {
          players: [...ids, 9901005].map((osuId) => ({
            osuId,
            username: `Synthetic Open Player ${osuId}`,
          })),
        }
      : {}),
    apiVersion: "20220705",
    fetchedAt: new Date().toISOString(),
    fingerprint: createHash("sha256")
      .update(JSON.stringify(games))
      .digest("hex"),
    match: {
      id: syntheticMatchId,
      title: "Synthetic browser rehearsal lobby",
      startTime: games[0].startTime,
      endTime: games[2].endTime,
    },
    firstEventId: 1,
    latestEventId: 3,
    currentGameId: null,
    pages: 1,
    complete: true,
    warnings: [],
    events: games.map((g) => ({
      id: g.id,
      at: g.endTime,
      type: "other",
      actorOsuId: null,
      gameId: g.id,
    })),
    games,
  });
  const [record] = await db()
    .insert(matchImports)
    .values({
      fixtureId,
      externalMatchId: syntheticMatchId,
      fingerprint: source.fingerprint,
      source,
      createdBy: refereeId,
    })
    .returning();
  await db()
    .insert(matchGames)
    .values(
      source.games.map((g) => ({
        importId: record.id,
        externalGameId: g.id,
        beatmapId: g.beatmapId,
        data: g,
      })),
    );
  await db()
    .insert(matchResults)
    .values({ fixtureId, latestImportId: record.id, version: 1 });
  return {
    poolId,
    fixtureId,
    home,
    away,
    source,
    importId: record.id,
    context,
  };
}
