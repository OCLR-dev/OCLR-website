import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { closeDb, db } from "../src/db";
import {
  editionState,
  registrations,
  staffRoles,
  users,
} from "../src/db/schema";
import { createSession, readSessionContext } from "../src/lib/auth/sessions";
import { createDeveloperToken } from "../src/lib/developer-api";
import { readApiRoute } from "../src/lib/read-api";
import { assertTestDatabase } from "../tests/database";
import { edition } from "../tests/fixtures/edition";
import { seedEditions } from "../tests/fixtures/editions";
import { installWorkerMeasurements } from "./worker-baseline/measure";

const origin = "http://127.0.0.1:31615";
const slug = "collection-benchmark";
const players = 1000;

async function main() {
  const database = process.env.TEST_DATABASE_URL;
  assertTestDatabase(database);
  const target = new URL(database);
  assert(
    target.hostname === "127.0.0.1" &&
      target.port &&
      target.pathname === "/oclr_collection_benchmark_test" &&
      !target.search &&
      !target.hash &&
      process.env.DATABASE_URL === database,
    "Use a fresh loopback oclr_collection_benchmark_test database with matching DATABASE_URL.",
  );
  assert(
    [".env", ".env.local", ".env.production", ".env.production.local"].every(
      (path) => !existsSync(path),
    ),
    "Use an isolated checkout without Next.js environment files.",
  );
  process.env.APP_URL = origin;
  process.env.OCLR_DATA_SOURCE = "database";
  process.env.OCLR_DEVELOPER_ORIGINS = origin;
  process.env.PRIVACY_CONTACT_OSU_ID = "9900001";
  assert(
    (await db().select({ slug: editionState.slug }).from(editionState)).every(
      (row) => row.slug === "s11",
    ) && !(await db().select({ id: users.osuId }).from(users).limit(1)).length,
    "Use a fresh database before seeding.",
  );
  await seedEditions([
    { ...edition, slug },
    ...Array.from({ length: 32 }, (_, i) => ({
      ...edition,
      slug: `${slug}-${i}`,
      published: i < 24,
    })),
  ]);
  const people = Array.from({ length: players }, (_, index) => ({
    osuId: 9_900_001 + index,
    username: `Synthetic directory ${index}`,
  }));
  await db().insert(users).values(people);
  await db()
    .insert(registrations)
    .values(
      people.map(({ osuId }) => ({
        userId: osuId,
        editionSlug: slug,
        status: "accepted" as const,
        rulesVersion: "test-v1",
        answers: {},
      })),
    );
  const developer = people[0].osuId;
  await db().insert(staffRoles).values({
    userId: developer,
    role: "developer",
    grantedBy: developer,
  });
  const session = await createSession(developer);
  const context = await readSessionContext(session.token);
  assert(context, "Synthetic session missing.");
  const { token } = await createDeveloperToken(context, {
    origin,
    scopes: ["tournaments:private:read"],
  });
  const probes = installWorkerMeasurements();
  try {
    const results = [];
    for (const workload of [
      {
        resource: `/tournaments/${slug}/players`,
        q: "",
        pageSize: 50,
        total: players,
      },
      { resource: "/tournaments", q: slug, pageSize: 5, total: 25 },
      {
        resource: "/staff/tournaments",
        q: slug,
        pageSize: 5,
        total: 33,
        private: true,
      },
    ]) {
      let page = 1;
      let version = "";
      let count = 0;
      const samples = [];
      while (page > 0) {
        const sample = await probes.measure("collection-page", async () => {
          const query = new URLSearchParams({
            q: workload.q,
            pageSize: String(workload.pageSize),
            page: String(page),
          });
          if (version) query.set("version", version);
          const response = await readApiRoute(
            new Request(origin + "/api/v1" + workload.resource + "?" + query, {
              headers: workload.private
                ? { Authorization: `Bearer ${token}` }
                : {},
            }),
          );
          assert.equal(response.status, 200, "Collection request failed.");
          const body = await response.text();
          const value = JSON.parse(body);
          const metadata = value.meta.pagination;
          assert.equal(metadata.total, workload.total);
          assert.equal(metadata.page, page);
          if (version) assert.equal(metadata.collectionVersion, version);
          version = metadata.collectionVersion;
          page = metadata.nextPage ?? 0;
          count += value.data.length;
          return { bytes: Buffer.byteLength(body), rows: value.data.length };
        });
        samples.push(sample);
        assert(
          samples.length <= Math.ceil(workload.total / workload.pageSize),
          "Too many pages.",
        );
      }
      assert.equal(count, workload.total);
      results.push({ resource: workload.resource, total: count, samples });
    }
    assert.equal(probes.blockedFetches(), 0);
    console.log(
      JSON.stringify(
        {
          commit: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    probes.restore();
  }
}
try {
  await main();
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Collection benchmark failed.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
