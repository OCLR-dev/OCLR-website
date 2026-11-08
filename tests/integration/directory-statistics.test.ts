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
import { db, closeDb, getPool } from "../../src/db";
import { userProfileCache, registrations } from "../../src/db/schema";
import {
  cachedDirectoryStatistics,
  refreshDirectoryStatistics,
  PROFILE_TTL_MS,
} from "../../src/lib/osu-profiles";
import { publicPlayers } from "../../src/lib/players";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { seedPublicDirectory } from "../fixtures/players";
import { profileResponse } from "../fixtures/osu-profile";
import { assertTestDatabase } from "../database";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
import { osuApi } from "../../src/lib/osu-api";
const provider = vi.mocked(osuApi),
  url = process.env.TEST_DATABASE_URL,
  base = 1220001;
async function cache(
  id: number,
  rank: number | null,
  pp: number | null,
  stale = false,
  errorStatus: number | null = null,
) {
  const profile = normalizeOsuProfile(
    { ...profileResponse, id },
    id,
    "osu",
    new Date(Date.now() - (stale ? PROFILE_TTL_MS + 1000 : 0)).toISOString(),
  );
  profile.statistics.globalRank = rank;
  profile.statistics.pp = pp;
  await db()
    .insert(userProfileCache)
    .values({
      osuId: id,
      mode: "osu",
      profile,
      errorStatus,
      attemptedAt: new Date(Date.now() - 100000),
      retryAt: new Date(0),
    });
}
describe.skipIf(!url)("bounded public directory statistics", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedPublicDirectory(base);
    provider.mockReset();
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await closeDb();
  });
  it("reads only the visible accepted page in one cache query with minimal output and no provider call", async () => {
    await cache(base, 12345, 7890.45);
    await cache(base + 1, null, 100);
    await cache(base + 2, 1, 99999);
    await cache(base + 3, 23456, null);
    // Another ruleset is never substituted for osu!standard.
    await db()
      .insert(userProfileCache)
      .values({
        osuId: base,
        mode: "mania",
        attemptedAt: new Date(),
        profile: normalizeOsuProfile(
          { ...profileResponse, id: base, statistics: { pp: 99999 } },
          base,
          "mania",
        ),
        retryAt: new Date(0),
      });
    const visible = await publicPlayers({ edition: "test-cup" });
    const query = vi.spyOn(getPool(), "query");
    const result = await cachedDirectoryStatistics(
      visible.rows.map((p) => p.osuId),
    );
    expect(query).toHaveBeenCalledTimes(1);
    query.mockRestore();
    expect(provider).not.toHaveBeenCalled();
    expect(result.statistics.size).toBe(3);
    expect(result.statistics.has(base + 2)).toBe(false);
    expect(result.statistics.get(base)).toMatchObject({
      globalRank: 12345,
      pp: 7890.45,
      stale: false,
    });
    expect(result.statistics.get(base + 1)).toMatchObject({
      globalRank: null,
      pp: 100,
    });
    expect(result.statistics.get(base + 3)).toMatchObject({
      globalRank: 23456,
      pp: null,
    });
    expect(Object.keys(result.statistics.get(base)!)).toEqual([
      "globalRank",
      "pp",
      "fetchedAt",
      "stale",
    ]);
    expect(result.refreshIds).toEqual([]);
  });
  it("labels last-good data stale on expiry/429/5xx and hides a deleted profile's saved values", async () => {
    await cache(base, 12345, 7890.45, true);
    await cache(base + 1, 456, 200, false, 429);
    await cache(base + 2, 1, 999, false, 404);
    await cache(base + 3, 789, 300, false, 503);
    const result = await cachedDirectoryStatistics([
      base,
      base + 1,
      base + 2,
      base + 3,
    ]);
    expect(result.statistics.size).toBe(3);
    expect([...result.statistics.values()].every((p) => p.stale)).toBe(true);
    expect(result.statistics.has(base + 2)).toBe(false);
    expect(result.refreshIds).toHaveLength(4);
    await db()
      .update(userProfileCache)
      .set({ retryAt: new Date(Date.now() + 60000) });
    expect(
      (await cachedDirectoryStatistics([base, base + 1, base + 2, base + 3]))
        .refreshIds,
    ).toEqual([]);
  });
  it("does not read a private applicant's cached stats through search or other statuses", async () => {
    await cache(base + 2, 12345, 7890.45);
    for (const status of [
      "pending",
      "deferred",
      "rejected",
      "withdrawn",
    ] as const) {
      await db()
        .update(registrations)
        .set({ status })
        .where(eq(registrations.userId, base + 2));
      const visible = await publicPlayers({
        edition: "test-cup",
        q: String(base + 2),
      });
      expect(
        (await cachedDirectoryStatistics(visible.rows.map((p) => p.osuId)))
          .statistics.size,
      ).toBe(0);
    }
    expect((await publicPlayers({ edition: "private-test-cup" })).rows).toEqual(
      [],
    );
    expect(provider).not.toHaveBeenCalled();
  });
  it("reads beyond 24, deduplicates IDs and avoids DB calls for an empty directory", async () => {
    await cache(base, 12345, 7890.45);
    expect(
      (await cachedDirectoryStatistics([base, base])).statistics.size,
    ).toBe(1);
    expect(
      (
        await cachedDirectoryStatistics(
          Array.from({ length: 25 }, (_, i) => base + i),
        )
      ).statistics.size,
    ).toBe(1);
    const query = vi.spyOn(getPool(), "query");
    expect((await cachedDirectoryStatistics([])).refreshIds).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
  });
  it("refreshes only two profiles sequentially and blocks concurrent page fan-out", async () => {
    let release!: (value: unknown) => void;
    provider
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockImplementation(async (path) => ({
        ...profileResponse,
        id: Number(path.split("/")[2]),
      }));
    const ids = [base + 2, ...Array.from({ length: 24 }, (_, i) => base + i)];
    const check = Promise.withResolvers<void>();
    const visible = vi.fn(async () => {
      await check.promise;
      const current = await publicPlayers({ edition: "test-cup" });
      return new Set(current.rows.map((player) => player.osuId));
    });
    const refreshing = refreshDirectoryStatistics(ids, visible);
    try {
      await refreshDirectoryStatistics(ids.slice(2), visible);
      expect(visible).toHaveBeenCalledTimes(1);
      expect(provider).not.toHaveBeenCalled();
    } finally {
      check.resolve();
    }
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
    await refreshDirectoryStatistics(ids.slice(2), visible);
    expect(visible).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledTimes(1);
    release({ ...profileResponse, id: base });
    await refreshing;
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls.map((c) => c[0])).toEqual([
      `/users/${base}/osu?key=id`,
      `/users/${base + 1}/osu?key=id`,
    ]);
    await refreshDirectoryStatistics(ids, visible);
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it("preserves cached values and records backoff when a bounded refresh fails", async () => {
    // A fresh module represents the next process budget; provider behavior remains mocked.
    vi.resetModules();
    const fresh = await import("../../src/lib/osu-profiles");
    const { HttpError } = await import("../../src/lib/http");
    await cache(base, 12345, 7890.45, true);
    provider.mockRejectedValue(new HttpError(503, "PRIVATE_PROVIDER_BODY"));
    await fresh.refreshDirectoryStatistics([base], async () => new Set([base]));
    expect(
      (await fresh.cachedDirectoryStatistics([base])).statistics.get(base),
    ).toMatchObject({ globalRank: 12345, pp: 7890.45, stale: true });
    expect((await fresh.cachedDirectoryStatistics([base])).refreshIds).toEqual(
      [],
    );
    const [row] = await db().select().from(userProfileCache);
    expect(row.errorStatus).toBe(503);
  });
});
