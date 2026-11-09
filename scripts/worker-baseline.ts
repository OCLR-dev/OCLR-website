import assert from "node:assert/strict";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { editionState, historicalStatistics, users } from "../src/db/schema";
import { backfillArchiveRelations } from "../src/lib/archive-relation-maintenance";
import { statisticsArchiveKey } from "../src/lib/archive-statistics-key";
import { refreshBeatmapDifficulties } from "../src/lib/difficulty-worker";
import { HttpError } from "../src/lib/http";
import { osuApi } from "../src/lib/osu-api";
import { databasePlayerLeaderboard } from "../src/lib/player-leaderboard";
import { refreshPlayerLeaderboard } from "../src/lib/player-leaderboard-worker";
import { assertTestDatabase } from "../tests/database";
import { archiveQueryFixture } from "../tests/fixtures/archive-query";
import { edition } from "../tests/fixtures/edition";
import { seedEditions } from "../tests/fixtures/editions";
import { installWorkerMeasurements } from "./worker-baseline/measure";

const databaseName = "oclr_worker_benchmark_test";
const archiveGames = 60;

function providerPort(child: ChildProcess) {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => finish(), 10_000);
    const finish = (port?: unknown) => {
      clearTimeout(timer);
      child.off("message", finish);
      child.off("error", failed);
      child.off("exit", failed);
      if (
        typeof port === "number" &&
        Number.isInteger(port) &&
        port > 0 &&
        port < 65536
      )
        resolve(port);
      else reject(new Error("Synthetic provider did not start."));
    };
    const failed = () => finish();
    child.once("message", finish);
    child.once("error", failed);
    child.once("exit", failed);
  });
}

async function seedArchive() {
  const { archive, rows } = archiveQueryFixture(archiveGames);
  // The two verified max combos let the actual leaderboard projector score
  // these synthetic games without fetching maps or supplying fake combos.
  const mapId = (id: number) => (id === 10001 ? 67895 : 136033);
  for (const pool of archive.pools)
    for (const map of pool.maps)
      if (map.beatmapId !== null) map.beatmapId = mapId(map.beatmapId);
  // The archive release check reconciles the selected games with the series score.
  archive.matches.find((match) => match.id === "one")!.score = [
    archiveGames,
    0,
  ];
  const key = statisticsArchiveKey(archive);
  for (const row of rows) {
    for (const snapshot of new Set([row.draft, row.published])) {
      snapshot.archiveKey = key;
      for (const game of snapshot.source.games) {
        assert(game.beatmapId !== null, "Synthetic game lacks a beatmap.");
        game.beatmapId = mapId(game.beatmapId);
      }
      snapshot.included = snapshot.source.games.map((game) => game.id);
    }
  }
  await seedEditions([
    {
      ...edition,
      slug: archive.editionSlug,
      status: "completed",
      registration: null,
      archive,
    },
  ]);
  await db().insert(historicalStatistics).values(rows);
  await backfillArchiveRelations(archive.editionSlug, true);
  return rows.reduce(
    (total, row) => total + row.published.source.games.length,
    0,
  );
}

async function lookup(id: number, expectedStatus = 200) {
  try {
    const value = await osuApi(`/beatmaps/${id}`);
    assert(
      value && typeof value === "object" && "id" in value && value.id === id,
    );
    assert.equal(expectedStatus, 200);
    return 200;
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    assert.equal(error.status, expectedStatus, "Unexpected client status.");
    return error.status;
  }
}

let stage = "environment";
async function main() {
  const database = process.env.TEST_DATABASE_URL;
  assert(database, "Set TEST_DATABASE_URL for the isolated worker benchmark.");
  assertTestDatabase(database);
  const url = new URL(database);
  assert(
    url.hostname === "127.0.0.1" &&
      url.port &&
      url.pathname === `/${databaseName}` &&
      !url.search &&
      !url.hash &&
      process.env.DATABASE_URL === database,
    "Use a fresh loopback oclr_worker_benchmark_test database and matching DATABASE_URL.",
  );
  assert(
    [".env", ".env.local", ".env.production", ".env.production.local"].every(
      (path) => !existsSync(path),
    ),
    "Use an isolated checkout without Next.js environment files.",
  );
  process.env.OCLR_DATA_SOURCE = "database";
  process.env.OSU_CLIENT_ID = "1";
  process.env.OSU_CLIENT_SECRET = "synthetic-perf-secret";
  const info = await db().execute(
    sql`SELECT current_database() AS name, current_setting('server_version') AS version`,
  );
  assert(info.rows[0]?.name === databaseName, "Unexpected connected database.");
  assert(
    (await db().select({ slug: editionState.slug }).from(editionState)).every(
      ({ slug }) => slug === "s11",
    ) &&
      (await db().select({ id: users.osuId }).from(users).limit(1)).length ===
        0,
    "Create a fresh benchmark database before seeding.",
  );

  stage = "provider startup";
  const child = fork("scripts/worker-baseline/provider.mjs", [], {
    execArgv: [],
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  try {
    const probes = installWorkerMeasurements(await providerPort(child));
    try {
      const { measure } = probes;
      stage = "archive seed";
      const rawGames = await seedArchive();
      stage = "provider scenarios";
      const cold = await measure("cold-oauth-and-beatmap", () =>
        lookup(9900001),
      );
      assert.deepEqual(
        cold.provider.map(({ operation, status }) => [operation, status]),
        [
          ["token", 200],
          ["beatmap", 200],
        ],
      );
      const warm = [];
      for (let i = 0; i < 5; i++)
        for (const [id, latency] of [
          [9900001, 20],
          [9900002, 250],
        ] as const) {
          // Wait outside the sample so pacing cannot hide fixture latency.
          await delay(1200);
          const sample = await measure(`isolated-${latency}ms`, () =>
            lookup(id),
          );
          assert.deepEqual(
            sample.provider.map(({ status }) => status),
            [200],
          );
          warm.push(sample);
        }
      await delay(1200);
      const paced = await measure("three-concurrent-lookups", () =>
        Promise.all([lookup(9900001), lookup(9900001), lookup(9900001)]),
      );
      await delay(1200);
      const retry = await measure("retry-503-once", () => lookup(9900003));
      await delay(1200);
      const limited = await measure("rate-limit-429", () =>
        lookup(9900004, 429),
      );
      await delay(1200);
      const timeout = await measure("timeout", () => lookup(9900005, 502));
      assert.deepEqual(
        paced.provider.map(({ status }) => status),
        [200, 200, 200],
      );
      assert.deepEqual(
        retry.provider.map(({ status }) => status),
        [503, 200],
      );
      assert.deepEqual(
        limited.provider.map(({ status }) => status),
        [429],
      );
      assert.deepEqual(
        timeout.provider.map(({ status }) => status),
        [null],
      );

      stage = "difficulty worker";
      const preview = await measure("difficulty-preview", () =>
        refreshBeatmapDifficulties(),
      );
      const sync = await measure("difficulty-sync", () =>
        refreshBeatmapDifficulties(true),
      );
      const current = await measure("difficulty-current", () =>
        refreshBeatmapDifficulties(true),
      );
      assert.equal(preview.result.pending, 2);
      assert.equal(sync.result.saved, 2);
      assert.equal(sync.result.failed, 0);
      assert.deepEqual(
        sync.provider.map(({ status }) => status),
        [200, 200],
      );
      assert.equal(current.result.status, "current");
      assert.equal(preview.provider.length + current.provider.length, 0);

      stage = "leaderboard worker";
      const initial = await measure("leaderboard-initial-build", () =>
        refreshPlayerLeaderboard(true),
      );
      assert.equal(initial.result.status, "updated");
      const warmRuns = [];
      const rebuilds = [];
      for (let i = 0; i < 5; i++) {
        const noop = await measure("leaderboard-current", () =>
          refreshPlayerLeaderboard(true),
        );
        const rebuild = await measure("leaderboard-rebuild", () =>
          refreshPlayerLeaderboard(true, true),
        );
        assert.equal(noop.result.status, "current");
        assert.equal(rebuild.result.status, "updated");
        warmRuns.push(noop);
        rebuilds.push(rebuild);
      }
      const board = await databasePlayerLeaderboard();
      assert(
        board.state === "ready" && board.maps === rawGames,
        "Synthetic games must all be rated.",
      );
      const leaderboard = [initial, ...warmRuns, ...rebuilds].map((sample) => {
        assert.equal(sample.provider.length, 0);
        return {
          ...sample,
          ratedMapsPerSecond: sample.result.created
            ? (board.maps * 1000) / sample.wallMs
            : null,
        };
      });
      assert.equal(probes.blockedFetches(), 0);
      const git = (...args: string[]) =>
        execFileSync("git", args, { encoding: "utf8" }).trim();
      console.log(
        JSON.stringify(
          {
            commit: git("rev-parse", "HEAD"),
            dirty: Boolean(git("status", "--porcelain")),
            node: process.version,
            platform: process.platform,
            architecture: process.arch,
            postgres: info.rows[0].version,
            fixture: {
              editions: 1,
              rawGames,
              ratedMaps: board.maps,
              players: board.players.length,
              difficultyMaps: 2,
            },
            provider: [cold, ...warm, paced, retry, limited, timeout],
            difficultyWorker: [preview, sync, current],
            leaderboard,
            blockedFetches: probes.blockedFetches(),
          },
          null,
          2,
        ),
      );
    } finally {
      probes.restore();
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

try {
  await main();
} catch (error) {
  // Driver/provider errors can contain SQL, URLs or response bodies.
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : `Worker benchmark failed during ${stage}.`,
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
