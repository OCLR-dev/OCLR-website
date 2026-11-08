import assert from "node:assert/strict";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { arch, platform } from "node:os";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { editionState, registrations, users } from "../src/db/schema";
import { createSession } from "../src/lib/auth/sessions";
import { playerTimetableCommand } from "../src/lib/player-workspace";
import { assertTestDatabase } from "../tests/database";
import { refereeTestUser, seedRefereeFixture } from "../tests/fixtures/referee";

const parallel = 12;
const samplesPerLane = 6;
const addedPlayers = 240;
const origin = "http://127.0.0.1:31615";
const playerPath = "/api/tournaments/test-cup/player/availability";

type ClientSample = {
  id: string;
  status: number;
  ms: number;
  bytes: number;
};
type ServerSample = {
  id: string;
  status: number;
  handlerMs: number;
  sql: { count: number; ms: number };
  pool: { count: number; ms: number };
  blockedFetches: number;
};
type Report = {
  samples: ServerSample[];
  cpuMs: number;
  wallMs: number;
  rssBytes: number;
  heapUsedBytes: number;
  eventLoopSamples: number;
  eventLoopP95Ms: number | null;
  blockedFetches: number;
};

function receive<T>(child: ChildProcess, command?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(Error("Benchmark worker timed out."));
    }, 30_000);
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const onMessage = (message: unknown) => {
      cleanup();
      resolve(message as T);
    };
    const onError = () => {
      cleanup();
      reject(Error("Benchmark worker failed."));
    };
    const onExit = () => {
      cleanup();
      reject(Error("Benchmark worker exited."));
    };
    child.once("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
    if (command) child.send(command);
  });
}

function stats(values: number[]) {
  const ordered = values.toSorted((a, b) => a - b);
  const percentile = (p: number) =>
    Number(ordered[Math.ceil(ordered.length * p) - 1].toFixed(3));
  return { p50: percentile(0.5), p95: percentile(0.95) };
}

function cookie(token: string) {
  return { Cookie: `oclr_session=${token}` };
}

async function request(path: string, options?: RequestInit) {
  const id = randomUUID();
  const headers = new Headers(options?.headers);
  headers.set("x-oclr-benchmark-id", id);
  const started = performance.now();
  try {
    const response = await fetch(origin + path, {
      ...options,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const bytes = (await response.arrayBuffer()).byteLength;
    return {
      id,
      status: response.status,
      ms: performance.now() - started,
      bytes,
    };
  } catch {
    return { id, status: 0, ms: performance.now() - started, bytes: 0 };
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert(
    args.length === 0 || (args.length === 1 && args[0] === "--profile-first"),
    "Usage: npm run perf:api -- [--profile-first]",
  );
  const modes = args.length ? ["profile", "control"] : ["control", "profile"];
  const database = process.env.TEST_DATABASE_URL;
  assert(database, "Set TEST_DATABASE_URL for the isolated benchmark.");
  assertTestDatabase(database);
  const target = new URL(database);
  assert(
    target.hostname === "127.0.0.1" &&
      target.pathname === "/oclr_api_benchmark_test" &&
      !target.search &&
      process.env.DATABASE_URL === database,
    "Use a fresh loopback oclr_api_benchmark_test DB and matching DATABASE_URL.",
  );
  assert(
    [".env", ".env.local", ".env.production", ".env.production.local"].every(
      (path) => !existsSync(path),
    ),
    "Use an isolated checkout without Next.js environment files.",
  );
  assert(existsSync(".next/BUILD_ID"), "Build the application first.");
  process.env.OCLR_DATA_SOURCE = "database";
  process.env.PRIVACY_CONTACT_OSU_ID = String(refereeTestUser.osuId);
  process.env.OSU_CLIENT_ID = "";
  process.env.OSU_CLIENT_SECRET = "";
  const current = await db().execute(
    sql`SELECT current_database() AS name, current_setting('server_version') AS version`,
  );
  assert.equal(current.rows[0]?.name, "oclr_api_benchmark_test");
  const existingEditions = await db()
    .select({ slug: editionState.slug })
    .from(editionState);
  // The migrations install s11. Refuse to run the fixture against a used DB.
  assert(
    existingEditions.every(({ slug }) => slug === "s11") &&
      (await db().select({ id: users.osuId }).from(users).limit(1)).length ===
        0,
    "Create a fresh benchmark database before seeding.",
  );
  const fixture = await seedRefereeFixture();
  const players = Array.from({ length: addedPlayers }, (_, i) => ({
    osuId: 9_900_000 + i,
    username: `Benchmark Player ${i + 1}`,
  }));
  await db().insert(users).values(players);
  await db()
    .insert(registrations)
    .values(
      players.map(({ osuId }) => ({
        userId: osuId,
        editionSlug: "test-cup",
        status: "accepted" as const,
        rulesVersion: "test-v1",
        answers: {},
      })),
    );
  const lanes = await Promise.all(
    players.slice(0, parallel).map(async (player) => {
      const { version } = await playerTimetableCommand(player, "test-cup", {
        action: "save_availability",
        intervals: [],
        expectedVersion: 0,
        requestKey: randomUUID(),
      });
      return { token: (await createSession(player.osuId)).token, version };
    }),
  );
  const referee = cookie((await createSession(refereeTestUser.osuId)).token);
  await closeDb();

  const cases = [
    {
      name: "public-directory",
      run: () => request("/api/v1/tournaments/test-cup/players?pageSize=100"),
    },
    { name: "public-ssr", run: () => request("/tournaments/test-cup/players") },
    {
      name: "private-workspace",
      run: () => request(playerPath, { headers: cookie(lanes[0].token) }),
    },
    {
      name: "referee-poll",
      run: () =>
        request(
          `/api/admin/tournaments/test-cup/matches/${fixture.fixtureId}/referee/irc`,
          { headers: referee },
        ),
    },
    {
      name: "availability-write",
      run: async (index: number) => {
        const lane = lanes[index];
        const sample = await request(playerPath, {
          method: "POST",
          headers: {
            ...cookie(lane.token),
            Origin: origin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "save_availability",
            intervals: [],
            expectedVersion: lane.version,
            requestKey: randomUUID(),
          }),
        });
        if (sample.status === 200) lane.version++;
        return sample;
      },
    },
  ];
  const results: Record<string, unknown>[] = [];
  for (const mode of modes) {
    const child: ChildProcess = fork(
      "scripts/api-baseline/server.mjs",
      [mode],
      {
        execArgv: [],
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "production",
          NEXT_TELEMETRY_DISABLED: "1",
          APP_URL: origin,
          DATABASE_URL: database,
          ADMIN_OSU_IDS: process.env.ADMIN_OSU_IDS,
          PRIVACY_CONTACT_OSU_ID: process.env.PRIVACY_CONTACT_OSU_ID,
        },
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      },
    );
    try {
      assert.equal(await receive(child), "ready");
      for (const phase of ["first-hit", "serial", "parallel"]) {
        const concurrency = phase === "parallel" ? parallel : 1;
        const iterations =
          phase === "first-hit" ? 1 : phase === "serial" ? 30 : samplesPerLane;
        for (const scenario of cases) {
          assert.equal(await receive(child, "start"), "started");
          const requests = (
            await Promise.all(
              Array.from({ length: concurrency }, async (_, index) => {
                const laneSamples: ClientSample[] = [];
                for (let i = 0; i < iterations; i++)
                  laneSamples.push(await scenario.run(index));
                return laneSamples;
              }),
            )
          ).flat();
          const { samples, ...processMetrics } = await receive<Report>(
            child,
            "report",
          );
          const failed = requests.filter((sample) => sample.status !== 200);
          const byId = new Map(samples.map((sample) => [sample.id, sample]));
          const matched = requests.flatMap(({ id, status }) => {
            const sample = byId.get(id);
            return sample?.status === status ? [sample] : [];
          });
          const profileData =
            mode === "profile" && matched.length === requests.length
              ? {
                  handlerMs: stats(matched.map((sample) => sample.handlerMs)),
                  blockedFetches: matched.reduce(
                    (sum, sample) => sum + sample.blockedFetches,
                    0,
                  ),
                  sqlCount: stats(matched.map((sample) => sample.sql.count)),
                  sqlMs: stats(matched.map((sample) => sample.sql.ms)),
                  poolAcquisitions: stats(
                    matched.map((sample) => sample.pool.count),
                  ),
                  poolAcquireMs: stats(matched.map((sample) => sample.pool.ms)),
                }
              : null;
          results.push({
            mode,
            phase,
            scenario: scenario.name,
            requests: requests.length,
            concurrency,
            errorRate: failed.length / requests.length,
            httpMs: stats(requests.map((sample) => sample.ms)),
            responseBytes: stats(requests.map((sample) => sample.bytes)),
            ...processMetrics,
            profile: profileData,
            failures: failed.map(({ id, status }) => ({ id, status })),
          });
          if (failed.length)
            console.error(
              JSON.stringify({
                mode,
                phase,
                scenario: scenario.name,
                failures: failed.map(({ id, status, ms }) => ({
                  id,
                  status,
                  ms,
                  server: byId.get(id),
                })),
              }),
            );
          assert.equal(
            failed.length,
            0,
            `${mode}/${phase}/${scenario.name}: ${failed.map(({ id, status }) => `${status} (${id})`).join(", ")}`,
          );
          assert.equal(
            processMetrics.blockedFetches,
            0,
            "Unexpected provider access.",
          );
          if (mode === "profile")
            assert(
              profileData && profileData.sqlCount.p50 > 0,
              `Missing DB samples for ${scenario.name}`,
            );
        }
      }
    } finally {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        dirty: Boolean(
          execFileSync("git", ["status", "--porcelain"], {
            encoding: "utf8",
          }).trim(),
        ),
        node: process.version,
        platform: platform(),
        architecture: arch(),
        postgres: current.rows[0].version,
        addedPlayers,
        fixtureCount: 1,
        results,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  // Do not print driver errors, which can contain connection data or SQL.
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "API benchmark failed.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
