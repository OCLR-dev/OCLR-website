import { and, eq, sql } from "drizzle-orm";
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
import { closeDb, db, readOnlyData } from "../../src/db";
import {
  captains,
  draftPicks,
  draftSessions,
  editionState,
  registrations,
  staffRoles,
  teamCoaches,
  teams,
  userProfileCache,
  users,
} from "../../src/db/schema";
import { createSession, readSessionContext } from "../../src/lib/auth/sessions";
import { createDeveloperToken } from "../../src/lib/developer-api";
import { developerApiScopes } from "../../src/lib/developer-api-model";
import type { DraftBoard } from "../../src/lib/draft-types";
import { osuApi } from "../../src/lib/osu-api";
import {
  normalizeOsuProfile,
  type ProfileMode,
} from "../../src/lib/osu-profile-model";
import {
  publishedPlayerProfile,
  staffPlayerProfile,
} from "../../src/lib/player-profiles";
import { publicPlayers } from "../../src/lib/players";
import {
  publicPlayerDirectoryModel,
  publicTournamentListModel,
  publicTournamentModel,
} from "../../src/lib/public-read-models";
import { readApiRoute } from "../../src/lib/read-api";
import { readOperations, readSchemas } from "../../src/lib/read-api-operations";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { historicalArchive } from "../fixtures/historical-archive";
import { profileResponse } from "../fixtures/osu-profile";
import { seedPublicDirectory } from "../fixtures/players";
const url = process.env.TEST_DATABASE_URL;
const backend = "https://oclr.example.test",
  origin = "http://localhost:3000",
  base = 2691000,
  firstOwnerId = 2690001;
let ownerId = firstOwnerId;
let owner: NonNullable<Awaited<ReturnType<typeof readSessionContext>>>;
let fullToken = "";
let seeded: Awaited<ReturnType<typeof seedPublicDirectory>>;
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
const provider = vi.mocked(osuApi);
async function cache(
  id: number,
  mode: ProfileMode = "osu",
  pp = 1234.56,
  stale = false,
  errorStatus: number | null = null,
) {
  const profile = normalizeOsuProfile(
    {
      ...profileResponse,
      id,
      statistics: { ...profileResponse.statistics, pp },
    },
    id,
    mode,
    new Date(Date.now() - (stale ? 3_600_000 : 0)).toISOString(),
  );
  await db()
    .insert(userProfileCache)
    .values({
      osuId: id,
      mode,
      profile,
      attemptedAt: new Date(),
      retryAt: new Date(0),
      errorStatus,
    })
    .onConflictDoUpdate({
      target: [userProfileCache.osuId, userProfileCache.mode],
      set: { profile, errorStatus },
    });
  return profile;
}
function request(
  path: string,
  token?: string,
  method = "GET",
  local: string | null = origin,
) {
  const headers = new Headers();
  if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
  if (local !== null) headers.set("Origin", local);
  return new Request(backend + "/api/v1" + path, { method, headers });
}
async function get(path: string, token?: string) {
  const response = await readApiRoute(request(path, token));
  return { response, body: await response.json() };
}
async function state() {
  const tableNames = await db().execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  const records: unknown[] = [];
  for (const row of tableNames.rows)
    records.push([
      row.tablename,
      (
        await db().execute(
          sql.raw(
            `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS data FROM "${row.tablename}" t`,
          ),
        )
      ).rows[0].data,
    ]);
  return records;
}
describe.skipIf(!url)("v1 public/private saved read projections", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", backend);
    vi.stubEnv("ADMIN_OSU_IDS", "");
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(ownerId));
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", origin);
  });
  beforeEach(async () => {
    ownerId++;
    await db().execute(
      sql`TRUNCATE users,edition_state,user_profile_cache CASCADE`,
    );
    seeded = await seedPublicDirectory(base);
    await seedEditions(
      [
        {
          ...edition,
          slug: historicalArchive.editionSlug,
          status: "completed",
          registration: null,
          archive: historicalArchive,
        },
      ],
      false,
    );
    await db()
      .insert(users)
      .values({ osuId: ownerId, username: "Synthetic API Developer" });
    await db()
      .insert(staffRoles)
      .values({ userId: ownerId, role: "developer", grantedBy: ownerId });
    owner = (await readSessionContext((await createSession(ownerId)).token))!;
    fullToken = (
      await createDeveloperToken(owner, {
        origin,
        scopes: [...developerApiScopes],
      })
    ).token;
    await cache(base);
    await cache(base + 1, "osu", 0);
    await cache(base + 3);
    provider.mockReset();
    provider.mockRejectedValue(
      new Error("No provider I/O is allowed from v1 reads"),
    );
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("projects published summaries and SSR overview through the same schema with no private fields", async () => {
    const listing = await get("/tournaments");
    expect(listing.response.status).toBe(200);
    expect(
      listing.body.data.map((row: { slug: string }) => row.slug),
    ).not.toContain("private-test-cup");
    expect(listing.body.data).toEqual(await publicTournamentListModel());
    const detail = await get("/tournaments/test-cup");
    expect(detail.response.status).toBe(200);
    expect(detail.body.data).toEqual(await publicTournamentModel("test-cup"));
    expect(detail.body.data.overview.kind).toBe("database");
    expect(detail.body.data.registration).not.toHaveProperty("questions");
    expect(detail.body.data).not.toHaveProperty("configuration");
    expect(
      (await get("/tournaments/private-test-cup", fullToken)).response.status,
    ).toBe(404);
  });
  it("keeps public projections identical with a token and allows private configuration only with the matching live scope", async () => {
    const anonymous = await get("/tournaments/test-cup");
    const authorized = await get("/tournaments/test-cup", fullToken);
    expect(authorized.body.data).toEqual(anonymous.body.data);
    expect((await get("/staff/tournaments")).response.status).toBe(401);
    expect((await get("/staff/tournaments", "invalid")).response.status).toBe(
      401,
    );
    const narrow = (
      await createDeveloperToken(owner, { origin, scopes: ["identity:read"] })
    ).token;
    expect((await get("/staff/tournaments", narrow)).response.status).toBe(403);
    const privateResult = await get(
      "/staff/tournaments/private-test-cup",
      fullToken,
    );
    expect(privateResult.response.status).toBe(200);
    expect(privateResult.body.data.configuration.published).toBe(false);
    expect(privateResult.body.data).not.toHaveProperty("applications");
    expect((await get("/tournaments", "invalid")).response.status).toBe(401);
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, ownerId));
    expect((await get("/staff/tournaments", fullToken)).response.status).toBe(
      403,
    );
    expect((await get("/tournaments")).response.status).toBe(200);
  });
  it("delivers every accepted player and independently released coach, never pending identity or unreleased captain/team metadata", async () => {
    const result = await get("/tournaments/test-cup/players");
    expect(result.response.status).toBe(200);
    expect(
      result.body.data.map((player: { osuId: number }) => player.osuId),
    ).toEqual(
      (await publicPlayers({ edition: "test-cup" })).rows.map(
        (player) => player.osuId,
      ),
    );
    expect(
      result.body.data.map((player: { osuId: number }) => player.osuId),
    ).not.toContain(base + 2);
    expect(
      result.body.data.find(
        (player: { osuId: number }) => player.osuId === base,
      ),
    ).toMatchObject({ captain: true, tier: 0, tierLabel: "Captain" });
    expect(
      result.body.data.find(
        (player: { osuId: number }) => player.osuId === base + 3,
      ),
    ).toMatchObject({ captain: false, tier: null, team: null });
    expect(JSON.stringify(result.body)).not.toContain(
      "SYNTHETIC_PRIVATE_CONTACT",
    );
    expect(JSON.stringify(result.body)).not.toContain(
      "SYNTHETIC_INTERNAL_REASON",
    );
    await db()
      .insert(users)
      .values({ osuId: base + 1000, username: "Released Coach" });
    await db()
      .insert(teamCoaches)
      .values({
        teamId: seeded.teamId,
        userId: base + 1000,
        editionSlug: "test-cup",
      });
    const coach = (await get("/tournaments/test-cup/players")).body.data.find(
      (player: { osuId: number }) => player.osuId === base + 1000,
    );
    expect(coach).toMatchObject({
      participation: "coach",
      role: "coach",
      tier: null,
    });
    await db()
      .update(teams)
      .set({ identityPublished: false })
      .where(eq(teams.id, seeded.teamId));
    expect(
      (await get("/tournaments/test-cup/players")).body.data.some(
        (player: { osuId: number }) => player.osuId === base + 1000,
      ),
    ).toBe(false);
  });
  it("whitelists the expressly public introduction and preserves profile zero/missing/stale semantics", async () => {
    await seedEditions([
      {
        ...edition,
        registration: {
          ...edition.registration!,
          questions: [
            {
              id: "bio",
              label: "Public biography",
              required: false,
              type: "text",
              maxLength: 500,
            },
          ],
          publicIntroductionQuestionId: "bio",
        },
      },
    ]);
    await db()
      .update(registrations)
      .set({
        answers: {
          bio: "AUTHORED_PUBLIC_BIO",
          private: "FORBIDDEN_PRIVATE_ANSWER",
        },
      })
      .where(eq(registrations.userId, base + 1));
    await cache(base, "osu", 42, true);
    await db()
      .delete(userProfileCache)
      .where(eq(userProfileCache.osuId, base + 3));
    const result = await get("/tournaments/test-cup/players");
    const zero = result.body.data.find(
      (player: { osuId: number }) => player.osuId === base + 1,
    );
    expect(zero).toMatchObject({
      bio: "AUTHORED_PUBLIC_BIO",
      statistics: { pp: 0, state: "fresh" },
    });
    expect(JSON.stringify(result.body)).not.toContain(
      "FORBIDDEN_PRIVATE_ANSWER",
    );
    expect(
      result.body.data.find(
        (player: { osuId: number }) => player.osuId === base,
      ),
    ).toMatchObject({ statistics: { pp: 42, state: "stale" } });
    expect(
      result.body.data.find(
        (player: { osuId: number }) => player.osuId === base + 3,
      ),
    ).toMatchObject({ statistics: { pp: null, state: "missing" } });
    expect(result.body.data).toEqual(
      (await publicPlayerDirectoryModel("test-cup")).rows,
    );
  });
  it("returns saved-only profiles across all explicit rulesets, sanitizes cache internals and preserves legacy lookup consumers", async () => {
    for (const mode of ["osu", "taiko", "fruits", "mania"] as const)
      await cache(base + 1, mode, 0);
    for (const mode of ["osu", "taiko", "fruits", "mania"]) {
      const saved = await get(
        `/staff/profiles/${base + 1}?mode=${mode}`,
        fullToken,
      );
      expect(saved.response.status).toBe(200);
      expect(saved.body.data.profile.ruleset).toBe(mode);
      expect(saved.body.data.profile.statistics.pp).toBe(0);
      expect(saved.body.data).not.toHaveProperty("refreshToken");
    }
    const publicResult = await get(
      `/tournaments/test-cup/players/${base + 1}?mode=osu`,
    );
    expect(publicResult.response.status).toBe(200);
    expect(publicResult.body.data.snapshot.profile).toEqual(
      (await publishedPlayerProfile(String(base + 1), "osu", "test-cup"))
        .snapshot!.profile,
    );
    expect(publicResult.body.data.snapshot.profile).toEqual(
      (
        await staffPlayerProfile(owner, {
          input: String(base + 1),
          mode: "osu",
        })
      ).profile,
    );
    await cache(base + 1, "osu", 0, false, 502);
    expect(
      (await get(`/staff/profiles/${base + 1}`, fullToken)).body.data.state,
    ).toBe("stale");
    const cacheRow = (
      await db()
        .select()
        .from(userProfileCache)
        .where(
          and(
            eq(userProfileCache.osuId, base + 1),
            eq(userProfileCache.mode, "osu"),
          ),
        )
    )[0];
    await db()
      .update(userProfileCache)
      .set({
        profile: {
          ...cacheRow.profile!,
          privateToken: "FORBIDDEN_CACHE_FIELD",
        } as typeof cacheRow.profile,
      })
      .where(
        and(
          eq(userProfileCache.osuId, base + 1),
          eq(userProfileCache.mode, "osu"),
        ),
      );
    expect(
      JSON.stringify(
        (await get(`/staff/profiles/${base + 1}`, fullToken)).body,
      ),
    ).not.toContain("FORBIDDEN_CACHE_FIELD");
  });
  it("distinguishes missing provider snapshots from valid public membership and rejects cross-edition guesses", async () => {
    const missing = await get(`/staff/profiles/${base + 300}`, fullToken);
    expect(missing.response.status).toBe(404);
    expect(missing.body.error.code).toBe("PROFILE_SNAPSHOT_NOT_FOUND");
    await db()
      .delete(userProfileCache)
      .where(
        and(
          eq(userProfileCache.osuId, base + 1),
          eq(userProfileCache.mode, "osu"),
        ),
      );
    const player = await get(`/tournaments/test-cup/players/${base + 1}`);
    expect(player.response.status).toBe(200);
    expect(player.body.data.snapshot).toBeNull();
    const wrong = normalizeOsuProfile(
      { ...profileResponse, id: base + 999 },
      base + 999,
      "osu",
    );
    await db()
      .insert(userProfileCache)
      .values({
        osuId: base + 1,
        mode: "osu",
        profile: wrong,
        attemptedAt: new Date(),
        retryAt: new Date(0),
      });
    const corrupt = await get(`/tournaments/test-cup/players/${base + 1}`);
    expect(corrupt.response.status).toBe(200);
    expect(corrupt.body.data.snapshot).toBeNull();
    expect(corrupt.body.data.player.statistics.state).toBe("missing");

    expect(
      (await get(`/tournaments/test-cup/players/${base + 2}`)).response.status,
    ).toBe(404);
    expect(
      (
        await get(
          `/tournaments/${historicalArchive.editionSlug}/players/${base}`,
        )
      ).response.status,
    ).toBe(404);
    expect(
      (await get(`/tournaments/private-test-cup/players/${base}`, fullToken))
        .response.status,
    ).toBe(404);
  });
  it("keeps historical identity, Captain and recorded Tiers separate from current cached statistics", async () => {
    const historicalId = historicalArchive.players[0].osuId;
    await cache(historicalId, "osu", 9999);
    const detail = await get(`/tournaments/${historicalArchive.editionSlug}`);
    expect(detail.response.status).toBe(200);
    expect(detail.body.data.overview).toMatchObject({
      kind: "historical_archive",
      counts: { players: historicalArchive.players.length },
    });
    const player = await get(
      `/tournaments/${historicalArchive.editionSlug}/players/${historicalId}`,
    );
    expect(player.response.status).toBe(200);
    expect(player.body.data.player).toMatchObject({
      role: "captain",
      tier: 0,
      tierLabel: "Captain",
      statistics: { pp: null, state: "not_recorded" },
    });
    expect(player.body.data.snapshot).toBeNull();
    expect(player.body.data.bws).toBeNull();
  });
  it("uses only explicit released valid draft rounds, with unknown Tier for withheld or irregular sources", async () => {
    await db()
      .update(captains)
      .set({ published: true })
      .where(eq(captains.userId, base + 3));
    const [secondTeam] = await db()
      .insert(teams)
      .values({
        editionSlug: "test-cup",
        captainId: base + 3,
        name: "Second published team",
        identityPublished: true,
      })
      .returning();
    const [session] = await db()
      .insert(draftSessions)
      .values({
        editionSlug: "test-cup",
        state: "completed",
        version: 3,
        publishedRevision: 3,
        turnSequence: [seeded.teamId, secondTeam.id],
      })
      .returning();
    const first = {
      id: seeded.teamId,
      name: "First published team",
      captain: { osuId: base, username: "Synthetic Captain A" },
    };
    const second = {
      id: secondTeam.id,
      name: secondTeam.name,
      captain: { osuId: base + 3, username: "Synthetic Captain B" },
    };
    const pickId = randomUUID();
    const snapshot: DraftBoard = {
      sessionId: session.id,
      version: 1,
      state: "completed",
      turnIndex: 1,
      turnCount: 2,
      activeTeam: null,
      pool: null,
      picks: [
        {
          id: pickId,
          turnIndex: 0,
          team: first,
          player: { osuId: base + 1, username: "Synthetic member" },
        },
      ],
      rosters: [
        {
          team: first,
          players: [{ osuId: base + 1, username: "Synthetic member" }],
        },
        { team: second, players: [] },
      ],
    };
    await db()
      .insert(draftPicks)
      .values({
        id: pickId,
        sessionId: session.id,
        turnIndex: 0,
        teamId: first.id,
        captainId: base,
        playerId: base + 1,
        actorId: ownerId,
        mode: "staff_on_behalf",
        requestKey: randomUUID(),
        requestHash: "synthetic",
        revision: 3,
      });
    await db()
      .update(draftSessions)
      .set({ publicSnapshot: snapshot })
      .where(eq(draftSessions.id, session.id));
    expect(
      (await get(`/tournaments/test-cup/players/${base + 1}`)).body.data.player,
    ).toMatchObject({ tier: 1, tierLabel: "T1" });
    await db()
      .update(draftSessions)
      .set({ version: 4 })
      .where(eq(draftSessions.id, session.id));
    expect(
      (await get(`/tournaments/test-cup/players/${base + 1}`)).body.data.player
        .tier,
    ).toBeNull();
    await db()
      .update(draftSessions)
      .set({
        version: 5,
        publishedRevision: 5,
        turnSequence: [first.id, first.id, second.id],
      })
      .where(eq(draftSessions.id, session.id));
    expect(
      (await get(`/tournaments/test-cup/players/${base + 1}`)).body.data.player
        .tier,
    ).toBeNull();
    expect(
      (await get(`/tournaments/test-cup/players/${base}`)).body.data.player
        .tierLabel,
    ).toBe("Captain");
  });
  it("paginates the whole list consistently and detects mid-collection changes without truncating the SSR model", async () => {
    const extra = Array.from({ length: 75 }, (_, index) => ({
      osuId: base + 100 + index,
      username: `Synthetic extra ${index}`,
    }));
    await db().insert(users).values(extra);
    await db()
      .insert(registrations)
      .values(
        extra.map((person) => ({
          userId: person.osuId,
          editionSlug: "test-cup",
          status: "accepted" as const,
          answers: { private: "HIDDEN" },
        })),
      );
    const first = await get("/tournaments/test-cup/players?pageSize=50");
    expect(first.response.status).toBe(200);
    const version = first.body.meta.pagination.collectionVersion;
    const second = await get(
      `/tournaments/test-cup/players?pageSize=50&page=2&version=${version}`,
    );
    expect(second.response.status).toBe(200);
    expect([...first.body.data, ...second.body.data]).toEqual(
      (await publicPlayerDirectoryModel("test-cup")).rows,
    );
    expect(second.body.meta.pagination.total).toBe(78);
    expect(
      (await get("/tournaments/test-cup/players?page=2")).body.error.code,
    ).toBe("COLLECTION_VERSION_REQUIRED");
    await db()
      .update(users)
      .set({ username: "Changed public name" })
      .where(eq(users.osuId, base + 1));
    const changed = await get(
      `/tournaments/test-cup/players?pageSize=50&page=2&version=${version}`,
    );
    expect(changed.response.status).toBe(409);
    expect(changed.body.error.code).toBe("COLLECTION_CHANGED");
  });
  it("validates parameters and retains CORS on success, query errors, hidden resources and HEAD", async () => {
    for (const path of [
      "/tournaments?pageSize=101",
      "/tournaments?q=a&q=b",
      "/tournaments?page=0",
      "/tournaments/test-cup?published=false",
      `/staff/profiles/${base}?mode=unsupported`,
      `/staff/profiles/${base}?mode=osu&mode=mania`,
      `/staff/profiles/9007199254740992`,
    ]) {
      const response = (await get(path, fullToken)).response;
      expect(response.status, path).toBe(400);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
    const head = await readApiRoute(
      request("/tournaments/test-cup", undefined, "HEAD"),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("Cache-Control")).toBe("no-store");
    const preflight = await readApiRoute(
      request("/staff/tournaments", undefined, "OPTIONS"),
    );
    expect(preflight.status).toBe(204);
    const forbidden = await readApiRoute(
      request("/tournaments", undefined, "GET", "null"),
    );
    expect(forbidden.status).toBe(403);
    expect(
      (await readApiRoute(request("/tournaments", fullToken, "POST"))).status,
    ).toBe(405);
  });
  it("performs no provider calls or database writes, and restores ordinary write behavior outside the read scope", async () => {
    const before = await state();
    const samples: Record<string, string> = {
      getApiIdentity: "/me",
      getPublicSite: "/site",
      listPublicTournaments: "/tournaments",
      getPublicTournament: "/tournaments/test-cup",
      listPublicPlayers: "/tournaments/test-cup/players",
      getPublicPlayer: `/tournaments/test-cup/players/${base + 1}`,
      listStaffTournaments: "/staff/tournaments",
      getStaffTournament: "/staff/tournaments/private-test-cup",
      getSavedProfile: `/staff/profiles/${base + 1}`,
    };
    for (const operation of readOperations.filter((op) => op.id in samples)) {
      const result = await get(
        samples[operation.id],
        operation.public ? undefined : fullToken,
      );
      expect(result.response.status, operation.id).toBe(200);
      expect(
        readSchemas[operation.schema].safeParse(result.body.data).success,
      ).toBe(true);
    }
    expect(provider).not.toHaveBeenCalled();
    expect(await state()).toEqual(before);
    await expect(
      readOnlyData(async () => {
        await db()
          .update(users)
          .set({ username: "Forbidden" })
          .where(eq(users.osuId, ownerId));
      }),
    ).rejects.toThrow();
    await db()
      .update(users)
      .set({ username: "Allowed normal session write" })
      .where(eq(users.osuId, ownerId));
    expect(
      (await db().select().from(users).where(eq(users.osuId, ownerId)))[0]
        .username,
    ).toBe("Allowed normal session write");
  });
  it("withdraws published identities on the next request and serves the raw OpenAPI document without a database", async () => {
    const known = await get(`/tournaments/test-cup/players/${base + 1}`);
    expect(known.response.status).toBe(200);
    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(eq(registrations.userId, base + 1));
    expect(
      (await get(`/tournaments/test-cup/players/${base + 1}`)).response.status,
    ).toBe(404);
    const configuration = (
      await db()
        .select()
        .from(editionState)
        .where(eq(editionState.slug, "test-cup"))
    )[0].configuration!;
    await db()
      .update(editionState)
      .set({ configuration: { ...configuration, published: false } })
      .where(eq(editionState.slug, "test-cup"));
    expect((await get("/tournaments/test-cup")).response.status).toBe(404);
    vi.stubEnv("DATABASE_URL", "");
    try {
      const spec = await get("/openapi.json");
      expect(spec.response.status).toBe(200);
      expect(spec.body.openapi).toBe("3.1.0");
      expect((await get("/site")).response.status).toBe(503);
    } finally {
      vi.stubEnv("DATABASE_URL", url!);
    }
  });
});
