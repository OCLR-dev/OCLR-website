let fixtureEditions: unknown[];
import { seedEditions } from "../fixtures/editions";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { registrations, userProfileCache, users } from "../../src/db/schema";
import {
  cachedDirectoryStatistics,
  getOsuProfileByUsername,
  getOsuUserProfile,
  PROFILE_TTL_MS,
  PROFILE_CACHE_LIMIT,
} from "../../src/lib/osu-profiles";
import {
  publishedPlayerProfile,
  staffPlayerProfile,
} from "../../src/lib/player-profiles";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { HttpError } from "../../src/lib/http";
import { edition } from "../fixtures/edition";
import { seedPublicDirectory } from "../fixtures/players";
import { profileResponse } from "../fixtures/osu-profile";
import { assertTestDatabase } from "../database";
import { POST as lookupProfile } from "../../src/app/api/admin/profiles/route";
import { requireUser } from "../../src/lib/auth/user";
import { refreshStaffProfileWrite } from "../../src/lib/admin-operations-write-contracts";
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: vi.fn(),
}));
const origin = "https://oclr.example.test";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
import { osuApi } from "../../src/lib/osu-api";
const provider = vi.mocked(osuApi);
const url = process.env.TEST_DATABASE_URL;
const base = 260001;
describe.skipIf(!url)(
  "persistent profile cache and publication boundaries",
  () => {
    let fixture: Awaited<ReturnType<typeof seedPublicDirectory>>;
    beforeAll(() => {
      assertTestDatabase(url);
      fixtureEditions = [edition];
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", "269999");
      vi.stubEnv("APP_URL", origin);
    });
    beforeEach(async () => {
      await db().execute(
        sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
      );
      await seedEditions(fixtureEditions);
      fixture = await seedPublicDirectory(base);
      provider.mockReset().mockResolvedValue(profileResponse);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    const expire = async () => {
      await db().execute(
        sql`UPDATE user_profile_cache SET profile = jsonb_set(profile, '{fetchedAt}', to_jsonb(${new Date(Date.now() - PROFILE_TTL_MS - 1000).toISOString()}::text)), retry_at = NOW() - INTERVAL '1 minute'`,
      );
    };
    it("reads every cached directory statistic beyond the old 24-player limit and batch boundary", async () => {
      const ids = Array.from({ length: 503 }, (_, i) => base + i);
      const fetchedAt = new Date().toISOString();
      await db()
        .insert(userProfileCache)
        .values(
          ids.map((id, i) => ({
            osuId: id,
            mode: "osu" as const,
            profile: normalizeOsuProfile(
              {
                ...profileResponse,
                id,
                statistics: {
                  ...profileResponse.statistics,
                  global_rank: i === 0 ? null : i,
                  pp: i,
                },
              },
              id,
              "osu",
              fetchedAt,
            ),
            attemptedAt: new Date(),
            retryAt: new Date(Date.now() + 60000),
          })),
        );
      const { statistics, refreshIds } = await cachedDirectoryStatistics([
        ...ids,
        ids[0],
      ]);
      expect(statistics.size).toBe(503);
      expect(statistics.get(ids[0])).toMatchObject({ globalRank: null, pp: 0 });
      expect(statistics.get(ids[26])).toMatchObject({ globalRank: 26, pp: 26 });
      expect(statistics.get(ids[502])).toMatchObject({
        globalRank: 502,
        pp: 502,
      });
      expect(refreshIds).toEqual([]);
      expect(provider).not.toHaveBeenCalled();
      await db()
        .update(userProfileCache)
        .set({ errorStatus: 502 })
        .where(eq(userProfileCache.osuId, ids[26]));
      expect(
        (await cachedDirectoryStatistics(ids)).statistics.get(ids[26]),
      ).toMatchObject({ pp: 26, stale: true });
    });
    it("deduplicates simultaneous reads, persists compact snapshots and refreshes mutable usernames only", async () => {
      const [a, b] = await Promise.all([
        getOsuUserProfile(base),
        getOsuUserProfile(base),
      ]);
      expect(a).toEqual(b);
      expect(provider).toHaveBeenCalledTimes(1);
      expect((await getOsuUserProfile(base)).profile.username).toBe(
        "Synthetic Profile Player",
      );
      expect(provider).toHaveBeenCalledTimes(1);
      const [stored] = await db().select().from(userProfileCache);
      expect(JSON.stringify(stored)).not.toMatch(/PRIVATE_CONTACT|HISTORY/);
      expect(
        (await db().select().from(users).where(eq(users.osuId, base)))[0]
          .username,
      ).toBe("Synthetic Profile Player");
      expect(
        (await publishedPlayerProfile(String(base))).participation[0].team?.id,
      ).toBe(fixture.teamId);
    });
    it("isolates mode caches and survives service-module restart without provider calls", async () => {
      await getOsuUserProfile(base, "osu");
      provider.mockResolvedValueOnce({
        ...profileResponse,
        statistics: { pp: 12, mode: "mania" },
      });
      expect(
        (await getOsuUserProfile(base, "mania")).profile.statistics.pp,
      ).toBe(12);
      expect((await getOsuUserProfile(base, "osu")).profile.statistics.pp).toBe(
        1234.56,
      );
      vi.resetModules();
      const restarted = await import("../../src/lib/osu-profiles");
      expect(
        (await restarted.getOsuUserProfile(base)).profile.statistics.pp,
      ).toBe(1234.56);
      expect(provider).toHaveBeenCalledTimes(2);
    });
    it("serves last good data with stale notice on transient failure, backs off and recovers", async () => {
      await getOsuUserProfile(base);
      await expire();
      provider.mockRejectedValueOnce(
        new HttpError(429, "sensitive upstream body"),
      );
      const stale = await getOsuUserProfile(base);
      expect(stale.stale).toBe(true);
      expect(stale.profile.statistics.pp).toBe(1234.56);
      expect(stale.notice).not.toContain("sensitive");
      expect((await getOsuUserProfile(base)).stale).toBe(true);
      expect(provider).toHaveBeenCalledTimes(2);
      await db()
        .update(userProfileCache)
        .set({ retryAt: new Date(0) });
      expect((await getOsuUserProfile(base)).stale).toBe(false);
      expect(provider).toHaveBeenCalledTimes(3);
    });
    it("throttles forced refresh, rejects closed profiles without deleting the previous snapshot", async () => {
      await getOsuUserProfile(base);
      await getOsuUserProfile(base, "osu", { refresh: true });
      expect(provider).toHaveBeenCalledTimes(1);
      await expire();
      provider.mockRejectedValueOnce(new HttpError(404, "closed"));
      await expect(getOsuUserProfile(base)).rejects.toMatchObject({
        status: 404,
      });
      await expect(getOsuUserProfile(base)).rejects.toMatchObject({
        status: 404,
      });
      expect(
        (await db().select().from(userProfileCache))[0].profile,
      ).not.toBeNull();
      expect(provider).toHaveBeenCalledTimes(2);
    });
    it("refreshes a cached pre-rename profile after resolving the current username", async () => {
      await getOsuUserProfile(base);
      const [cached] = await db()
        .select()
        .from(userProfileCache)
        .where(eq(userProfileCache.osuId, base));
      await db()
        .update(userProfileCache)
        .set({
          profile: { ...cached.profile!, username: "Previous Name" },
          retryAt: new Date(0),
        })
        .where(eq(userProfileCache.osuId, base));
      const currentProfile = { ...profileResponse, username: "Current Name" };
      provider
        .mockReset()
        .mockResolvedValueOnce(currentProfile)
        .mockResolvedValueOnce(currentProfile);
      const result = await getOsuProfileByUsername("Current Name");
      expect(result.profile.username).toBe("Current Name");
      expect(provider).toHaveBeenCalledTimes(2);
      expect(
        (
          await db()
            .select()
            .from(userProfileCache)
            .where(eq(userProfileCache.osuId, base))
        )[0].profile?.username,
      ).toBe("Current Name");
    });
    it("negative-caches first lookup failures without returning invented empty stats", async () => {
      provider.mockRejectedValue(new HttpError(502, "private"));
      await expect(getOsuUserProfile(base)).rejects.toMatchObject({
        status: 502,
      });
      await expect(getOsuUserProfile(base)).rejects.toMatchObject({
        status: 502,
      });
      expect(provider).toHaveBeenCalledTimes(1);
      expect(
        (await db().select().from(userProfileCache))[0].profile,
      ).toBeNull();
    });
    it("does not read/refresh cached private participants and rechecks publication after slow I/O", async () => {
      for (const id of [fixture.privateId, 651307])
        await expect(publishedPlayerProfile(String(id))).rejects.toMatchObject({
          status: 404,
        });
      expect(provider).not.toHaveBeenCalled();
      provider.mockImplementationOnce(async () => {
        await db()
          .update(registrations)
          .set({ status: "withdrawn" })
          .where(eq(registrations.userId, base));
        return profileResponse;
      });
      await expect(publishedPlayerProfile(String(base))).rejects.toMatchObject({
        status: 404,
      });
      expect(await db().select().from(userProfileCache)).toHaveLength(1);
      await expect(publishedPlayerProfile(String(base))).rejects.toMatchObject({
        status: 404,
      });
      expect(provider).toHaveBeenCalledTimes(1);
    });
    it("permits authorized lookup without creating an identity or participation", async () => {
      await expect(
        staffPlayerProfile(
          { osuId: base, username: "Player" },
          { input: "651307" },
        ),
      ).rejects.toMatchObject({ status: 403 });
      provider.mockResolvedValueOnce({
        ...profileResponse,
        id: 651307,
        username: "Synthetic only",
      });
      vi.mocked(requireUser).mockResolvedValue({
        osuId: 269999,
        username: "Synthetic Admin",
      });
      const post = (refresh = false) =>
        lookupProfile(new Request(origin + refreshStaffProfileWrite.path, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            input: "https://osu.ppy.sh/users/651307/osu",
            ...(refresh ? { refresh } : {}),
          }),
        }));
      const fetched = await post();
      expect(fetched.status).toBe(200);
      expect(fetched.headers.get("Cache-Control")).toBe("no-store");
      const body = await fetched.json();
      const snapshot = refreshStaffProfileWrite.response.parse(body);
      expect(snapshot).toEqual(body);
      expect(snapshot.profile.osuId).toBe(651307);
      expect(snapshot).toMatchObject({ stale: false, notice: null });
      await expire();
      provider.mockRejectedValueOnce(new HttpError(502, "Synthetic outage"));
      const fallback = await post(true);
      expect(fallback.status).toBe(200);
      const fallbackBody = await fallback.json();
      expect(refreshStaffProfileWrite.response.parse(fallbackBody)).toEqual(fallbackBody);
      expect(fallbackBody).toMatchObject({
        stale: true,
        notice: expect.any(String),
        profile: { osuId: 651307, username: "Synthetic only" },
      });
      expect(
        await db().select().from(users).where(eq(users.osuId, 651307)),
      ).toEqual([]);
      await expect(publishedPlayerProfile("651307")).rejects.toMatchObject({
        status: 404,
      });
    });
    it("claims refreshes across instances and ignores a late response whose lease was superseded", async () => {
      let resolve!: (value: unknown) => void;
      provider.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const first = getOsuUserProfile(base);
      await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
      vi.resetModules();
      const other = await import("../../src/lib/osu-profiles");
      await expect(other.getOsuUserProfile(base)).rejects.toMatchObject({
        status: 429,
      });
      await db()
        .update(userProfileCache)
        .set({ refreshToken: null })
        .where(eq(userProfileCache.osuId, base));
      resolve(profileResponse);
      await expect(first).rejects.toMatchObject({ status: 429 });
      expect(
        (await db().select().from(userProfileCache))[0].profile,
      ).toBeNull();
    });
    it("bounds database keys and enforces supported modes and unique identities", async () => {
      await db().execute(
        sql`INSERT INTO user_profile_cache(osu_id, mode, attempted_at, retry_at) SELECT generate_series(300000, ${300000 + PROFILE_CACHE_LIMIT - 1}), 'osu', NOW() - INTERVAL '1 day', NOW()`,
      );
      await getOsuUserProfile(base);
      expect(
        (
          await db()
            .select({ count: sql<number>`count(*)::int` })
            .from(userProfileCache)
        )[0].count,
      ).toBe(PROFILE_CACHE_LIMIT);
      await expect(
        db().insert(userProfileCache).values({
          osuId: base,
          mode: "osu",
          attemptedAt: new Date(),
          retryAt: new Date(),
        }),
      ).rejects.toThrow();
      await expect(
        db().insert(userProfileCache).values({
          osuId: base,
          mode: "invalid",
          attemptedAt: new Date(),
          retryAt: new Date(),
        }),
      ).rejects.toThrow();
      expect(
        await db()
          .select()
          .from(userProfileCache)
          .where(
            and(
              eq(userProfileCache.osuId, base),
              eq(userProfileCache.mode, "osu"),
            ),
          ),
      ).toHaveLength(1);
    });
  },
);
