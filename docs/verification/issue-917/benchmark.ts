// Explicit synthetic benchmark only. Never load a local/production environment file.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { closeDb, db, readOnlyData } from "../../../src/db/index";
import {
  historicalStatistics,
  playerLeaderboardVersions,
  userProfileCache,
} from "../../../src/db/schema";
import {
  publicArchiveStatistics,
} from "../../../src/lib/archive-statistics-reads";
import { backfillArchiveRelations } from "../../../src/lib/archive-relations";
import { statisticsArchiveKey } from "../../../src/lib/archive-statistics-key";
import { databasePlayerLeaderboard } from "../../../src/lib/player-leaderboard";
import { projectPlayerLeaderboard } from "../../../src/lib/player-leaderboard-projector";
import { refreshPlayerLeaderboard } from "../../../src/lib/player-leaderboard-worker";
import { normalizeOsuProfile } from "../../../src/lib/osu-profile-model";
import { cachedDirectoryStatistics } from "../../../src/lib/osu-profiles";
import { readTournaments } from "../../../src/lib/tournament-reads";
import { assertTestDatabase } from "../../../tests/database";
import { archiveQueryFixture } from "../../../tests/fixtures/archive-query";
import { edition } from "../../../tests/fixtures/edition";
import { seedEditions } from "../../../tests/fixtures/editions";
import { profileResponse } from "../../../tests/fixtures/osu-profile";

assertTestDatabase(process.env.TEST_DATABASE_URL);
assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
assert.equal(
  process.argv[2],
  "--seed-synthetic",
  "Explicit fixture reset required",
);

type Sample<T> = { value: T; ms: number };
async function timed<T>(run: () => Promise<T>): Promise<Sample<T>> {
  const start = performance.now();
  const value = await run();
  return { value, ms: Number((performance.now() - start).toFixed(2)) };
}

try {
  await db().execute(
    sql`TRUNCATE edition_state,users,user_profile_cache,player_leaderboard_versions CASCADE`,
  );
  const profileIds = new Set<number>();
  for (let season = 1; season <= 10; season++) {
    const slug = `s${season}`;
    const { archive, rows } = archiveQueryFixture(500);
    const uid = (id: number) => id + season * 100000;
    archive.editionSlug = slug;
    for (const player of archive.players) {
      if (player.osuId) {
        player.osuId = uid(player.osuId);
        profileIds.add(player.osuId);
      }
    }
    for (const pick of archive.picks) pick.osuId = uid(pick.osuId);
    for (const staff of archive.staff)
      if (staff.osuId) staff.osuId = uid(staff.osuId);
    for (const pool of archive.pools)
      for (const map of pool.maps)
        map.beatmapId = map.beatmapId === 10001 ? 67895 : 136033;
    for (const match of archive.matches)
      match.mpUrls = match.mpUrls.map((url) =>
        url.replace(/\d+$/, (id) => String(Number(id) + season * 10)),
      );
    const archiveKey = statisticsArchiveKey(archive);
    for (const row of rows) {
      row.editionSlug = slug;
      row.mpId += season * 10;
      // Draft/published may share a fixture object; transform it only once.
      for (const snapshot of new Set([row.draft, row.published])) {
        snapshot.archiveKey = archiveKey;
        snapshot.source.match.id = row.mpId;
        snapshot.included = snapshot.included.map((id) => id + season * 100000);
        for (const game of snapshot.source.games) {
          game.id += season * 100000;
          game.beatmapId = game.beatmapId === 10001 ? 67895 : 136033;
          for (const score of game.scores)
            if (score.osuId) score.osuId = uid(score.osuId);
        }
      }
    }
    await seedEditions([
      { ...edition, slug, status: "completed", registration: null, archive },
    ]);
    await db().insert(historicalStatistics).values(rows);
    await backfillArchiveRelations(slug, true);
  }
  const now = new Date();
  await db()
    .insert(userProfileCache)
    .values(
      [...profileIds].map((osuId) => ({
        osuId,
        mode: "osu" as const,
        profile: normalizeOsuProfile(
          { ...profileResponse, id: osuId },
          osuId,
          "osu",
        ),
        attemptedAt: now,
        retryAt: now,
      })),
    );

  const cold = await timed(databasePlayerLeaderboard);
  assert.equal(cold.value.state, "pending");
  assert.deepEqual(await db().select().from(playerLeaderboardVersions), []);
  const worker = await timed(() => refreshPlayerLeaderboard(true));
  assert.equal(worker.value.status, "updated");

  // The pre-#916 request did this full projection plus saved pp/art decoration.
  const legacy = () =>
    readOnlyData(async () => {
      const core = await projectPlayerLeaderboard(
        (await readTournaments(true)).map((row) => row.edition),
        publicArchiveStatistics,
      );
      const saved = await cachedDirectoryStatistics(
        core.players.map((p) => p.osuId),
      );
      for (const player of core.players)
        player.pp = saved.statistics.get(player.osuId)?.pp ?? null;
      return { ...core, art: Object.fromEntries(saved.art) };
    });
  await legacy();
  await databasePlayerLeaderboard();
  const before: Sample<Awaited<ReturnType<typeof legacy>>>[] = [];
  const after: Sample<Awaited<ReturnType<typeof databasePlayerLeaderboard>>>[] =
    [];
  for (let sample = 0; sample < 3; sample++) before.push(await timed(legacy));
  for (let sample = 0; sample < 5; sample++)
    after.push(await timed(databasePlayerLeaderboard));
  for (const sample of before) assert.deepEqual(sample.value, before[0].value);
  for (const sample of after) {
    const { state, calculatedAt, ...core } = sample.value;
    assert.equal(state, "ready");
    assert.ok(calculatedAt);
    assert.deepEqual(core, before[0].value);
  }
  const parallel = await timed(() =>
    Promise.all(Array.from({ length: 10 }, () => databasePlayerLeaderboard())),
  );
  for (const value of parallel.value) assert.deepEqual(value, after[0].value);
  assert.equal((await db().select().from(playerLeaderboardVersions)).length, 1);
  console.log(
    JSON.stringify(
      {
        node: process.version,
        fixture: {
          seasons: 10,
          rawGames: 5010,
          players: after[0].value.players.length,
          countedMaps: after[0].value.maps,
        },
        pendingMs: cold.ms,
        workerMs: worker.ms,
        legacyFullLeaderboardMs: before.map((s) => s.ms),
        savedFullLeaderboardMs: after.map((s) => s.ms),
        tenConcurrentReadsMs: parallel.ms,
        wireBytes: Buffer.byteLength(JSON.stringify(after[0].value)),
        exactFullDto: true,
        generationsAfterReads: 1,
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb();
}
