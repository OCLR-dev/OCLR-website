import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client } from "pg";
import { NextRequest } from "next/server";
import { GET } from "../../src/app/api/admin/registrations/export/route";
import { requireStaff } from "../../src/lib/auth/staff-request";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import {
  registrations,
  staffRoles,
  userProfileCache,
  users,
} from "../../src/db/schema";
import {
  exportApplications,
  listApplications,
} from "../../src/lib/staff-registration-reads";
import {
  cachedDirectoryStatistics,
  cachedExportStatistics,
  PROFILE_TTL_MS,
} from "../../src/lib/osu-profiles";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { profileResponse } from "../fixtures/osu-profile";
vi.mock("../../src/lib/auth/staff-request", () => ({ requireStaff: vi.fn() }));
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
import { osuApi } from "../../src/lib/osu-api";

const url = process.env.TEST_DATABASE_URL;
const base = 2000000;
const admin = { osuId: base - 3, username: "Synthetic Export Admin" };
const scoped = { osuId: base - 2, username: "Synthetic Scoped Admin" };
const referee = { osuId: base - 1, username: "Synthetic Referee" };
const fetchedAt = new Date(Date.now() - 1000).toISOString();
const statuses = ["pending", "accepted", "rejected", "withdrawn"] as const;

async function cache(
  index: number,
  options: {
    mode?: "osu" | "mania";
    errorStatus?: number;
    old?: boolean;
    patch?: Record<string, unknown>;
    rank?: unknown;
    pp?: unknown;
    noProfile?: boolean;
  } = {},
) {
  const osuId = base + index;
  const mode = options.mode ?? "osu";
  const profile = normalizeOsuProfile(
    { ...profileResponse, id: osuId },
    osuId,
    mode,
    options.old
      ? new Date(Date.now() - PROFILE_TTL_MS - 1000).toISOString()
      : fetchedAt,
  );
  const saved = {
    ...profile,
    ...options.patch,
    statistics: {
      ...profile.statistics,
      globalRank: options.rank === undefined ? 12345 : options.rank,
      pp: options.pp === undefined ? 7890.45 : options.pp,
    },
  } as typeof profile;
  await db()
    .insert(userProfileCache)
    .values({
      osuId,
      mode,
      profile: options.noProfile ? null : saved,
      errorStatus: options.errorStatus ?? null,
      attemptedAt: new Date(),
      retryAt: new Date(Date.now() + 60000),
    });
}

function cacheQueries(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([query]) =>
    String(
      query && typeof query === "object" && "text" in query
        ? query.text
        : query,
    ).includes('from "user_profile_cache"'),
  );
}

describe.skipIf(!url)("private registration export statistics", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedEditions([edition, { ...edition, slug: "other-test-cup" }]);
    await db()
      .insert(users)
      .values([
        admin,
        scoped,
        referee,
        ...Array.from({ length: 30 }, (_, i) => ({
          osuId: base + i,
          username: `Synthetic Export Player ${i}`,
        })),
      ]);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: scoped.osuId,
          role: "admin",
          editionSlug: edition.slug,
          grantedBy: admin.osuId,
        },
        {
          userId: referee.osuId,
          role: "referee",
          editionSlug: edition.slug,
          grantedBy: admin.osuId,
        },
      ]);
    await db()
      .insert(registrations)
      .values(
        Array.from({ length: 30 }, (_, i) => ({
          userId: base + i,
          editionSlug: edition.slug,
          status: statuses[i % statuses.length],
          rulesVersion: "test-v1",
          answers: {},
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
        })),
      );
    vi.mocked(osuApi).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("exports saved standard statistics, independent missing fields and honest freshness without provider calls", async () => {
    await cache(0);
    await cache(1, { rank: 0, pp: 0 });
    await cache(2, { pp: null });
    await cache(3, { old: true });
    await cache(4, { errorStatus: 502 });
    await cache(5, { errorStatus: 404 });
    await cache(6, { noProfile: true });
    await cache(7, { mode: "mania" });
    await cache(8, { patch: { osuId: base + 9 } });
    await cache(9, { patch: { ruleset: "mania" } });
    await cache(10, { patch: { fetchedAt: "invalid" } });
    await cache(11, { rank: "12345", pp: "7890.45" });
    await cache(12, { rank: 1.5, pp: -1 });
    await cache(13, { rank: null });
    const query = vi.spyOn(Client.prototype, "query");
    const rows = await exportApplications(admin, { status: "" });
    expect(rows).toHaveLength(30);
    expect(cacheQueries(query)).toHaveLength(1);
    const byId = new Map(rows.map((row) => [row.userId, row.statistics]));
    expect(byId.get(base)).toEqual({
      globalRank: 12345,
      pp: 7890.45,
      fetchedAt,
      status: "fresh",
    });
    expect(byId.get(base + 1)).toMatchObject({ globalRank: null, pp: 0 });
    expect(byId.get(base + 2)).toMatchObject({ globalRank: 12345, pp: null });
    for (const i of [3, 4])
      expect(byId.get(base + i)).toMatchObject({
        globalRank: 12345,
        pp: 7890.45,
        status: "stale",
      });
    for (const i of [5, 6, 7, 8, 9, 10, 14])
      expect(byId.get(base + i)).toBeNull();
    for (const i of [11, 12])
      expect(byId.get(base + i)).toMatchObject({ globalRank: null, pp: null });
    expect(byId.get(base + 13)).toMatchObject({
      globalRank: null,
      pp: 7890.45,
    });
    expect(JSON.stringify(rows)).not.toMatch(/avatarUrl|badges|countryRank/);
    expect(osuApi).not.toHaveBeenCalled();
  });

  it("preserves filters, full export order, duplicate identities across editions and edition scopes", async () => {
    await cache(0);
    await db().insert(registrations).values({
      userId: base,
      editionSlug: "other-test-cup",
      rulesVersion: "test-v1",
      answers: {},
    });
    const listed = await listApplications(admin, { status: "" });
    const all = await exportApplications(admin, { status: "", page: 2 });
    expect(listed.rows).toHaveLength(25);
    expect(all).toHaveLength(31);
    expect(all.slice(0, 25).map((row) => row.id)).toEqual(
      listed.rows.map((row) => row.id),
    );
    const duplicate = all.filter((row) => row.userId === base);
    expect(duplicate).toHaveLength(2);
    expect(duplicate[0].statistics).toEqual(duplicate[1].statistics);
    const filtered = await exportApplications(scoped, {
      q: String(base),
      status: "pending",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      userId: base,
      editionSlug: edition.slug,
    });
    expect(
      await exportApplications(scoped, { edition: "other-test-cup" }),
    ).toEqual([]);
    expect(
      (await exportApplications(admin, {})).every(
        (row) => row.status !== "withdrawn",
      ),
    ).toBe(true);
    // The private list endpoint must not gain the export-only projection.
    expect(listed.rows[0]).not.toHaveProperty("statistics");
    expect(osuApi).not.toHaveBeenCalled();
  });

  it("downloads only the selected bot field for all matching authorized rows", async () => {
    await db().insert(registrations).values({
      userId: base,
      editionSlug: "other-test-cup",
      rulesVersion: "test-v1",
      answers: {},
    });
    vi.mocked(requireStaff).mockResolvedValue(scoped);
    const search = "q=Synthetic+Export+Player&status=&page=2";
    const request = (query: string) =>
      GET(
        new NextRequest(
          `http://localhost/api/admin/registrations/export?${query}`,
        ),
      );
    const matching = Array.from({ length: 30 }, (_, i) => 29 - i);

    for (const [format, body] of [
      ["uid", matching.map((i) => base + i).join("\n")],
      [
        "username",
        matching.map((i) => `Synthetic Export Player ${i}`).join(","),
      ],
    ]) {
      const download = await request(`${search}&format=${format}`);
      expect(download.status).toBe(200);
      expect(download.headers.get("content-type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(download.headers.get("content-disposition")).toBe(
        `attachment; filename="oclr-registrations-${format}.txt"`,
      );
      expect(download.headers.get("cache-control")).toBe("no-store");
      expect(await download.text()).toBe(body);
    }

    expect(
      await (await request("format=uid&status=accepted&q=2000001")).text(),
    ).toBe(String(base + 1));
    expect(
      await (await request("format=username&status=accepted&q=2000000")).text(),
    ).toBe("");
    expect((await request("format=unknown")).status).toBe(400);

    vi.mocked(requireStaff).mockResolvedValue(referee);
    for (const format of ["uid", "username"])
      expect((await request(`format=${format}`)).status).toBe(403);
  });

  it("does not read profile data for unauthorized or empty exports", async () => {
    const query = vi.spyOn(Client.prototype, "query");
    for (const actor of [
      referee,
      { osuId: base, username: "Synthetic Player" },
    ])
      await expect(exportApplications(actor, {})).rejects.toMatchObject({
        status: 403,
      });
    expect(
      await exportApplications(scoped, { edition: "other-test-cup" }),
    ).toEqual([]);
    expect(await exportApplications(admin, { q: "no-such-player" })).toEqual(
      [],
    );
    expect(cacheQueries(query)).toHaveLength(0);
    expect(osuApi).not.toHaveBeenCalled();
  });

  it("deduplicates and batches cache reads while retaining the export limit", async () => {
    await cache(0);
    const ids = Array.from({ length: 501 }, (_, i) => base + i);
    const query = vi.spyOn(Client.prototype, "query");
    const statistics = await cachedExportStatistics([...ids, ...ids]);
    expect(cacheQueries(query)).toHaveLength(2);
    expect(statistics.size).toBe(1);
    expect(
      (await cachedDirectoryStatistics(ids.slice(0, 25))).statistics.size,
    ).toBe(1);
    await expect(
      cachedExportStatistics(Array.from({ length: 10001 }, (_, i) => base + i)),
    ).rejects.toMatchObject({ status: 413 });
    expect(osuApi).not.toHaveBeenCalled();
  });

  it("retains the 10,000-registration export cap before looking up profiles", async () => {
    await db().execute(sql`INSERT INTO users (osu_id, username)
      SELECT id, 'Synthetic large export ' || id FROM generate_series(${base + 30}::bigint, ${base + 9999}::bigint) AS id`);
    await db()
      .execute(sql`INSERT INTO registrations (user_id, edition_slug, rules_version, answers)
      SELECT id, 'test-cup', 'test-v1', '{}'::jsonb FROM generate_series(${base + 30}::bigint, ${base + 9999}::bigint) AS id`);
    expect(await exportApplications(admin, { status: "" })).toHaveLength(10000);
    await db()
      .insert(users)
      .values({ osuId: base + 10000, username: "Synthetic overflow" });
    await db()
      .insert(registrations)
      .values({
        userId: base + 10000,
        editionSlug: edition.slug,
        rulesVersion: "test-v1",
        answers: {},
      });
    const query = vi.spyOn(Client.prototype, "query");
    await expect(
      exportApplications(admin, { status: "" }),
    ).rejects.toMatchObject({ status: 413 });
    expect(cacheQueries(query)).toHaveLength(0);
    expect(osuApi).not.toHaveBeenCalled();
  });
});
