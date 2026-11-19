import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readContractVersion } from "../../src/lib/read-api-version";
import { emptyRefereeSettings } from "../../src/lib/referee-commands";
import * as poolsModule from "../../src/lib/mappool-reads";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  staffRoles,
  fixtures,
  fixtureStreams,
  tournamentStages,
  tournamentRounds,
  streamingApiTokens,
  streamingApiEvents,
  sessions,
  mappools,
  mappoolEntries,
  registrations,
  captains,
  refereeSessions,
  refereeEvents,
  matchResults,
  matchImports,
  resultRevisions,
} from "../../src/db/schema";
import { createSession, readSessionContext } from "../../src/lib/auth/sessions";
import {
  hasStreamingMenuAccess,
  streamingAccessEditions,
  createStreamingToken,
  revokeStreamingToken,
  listStreamingTokens,
} from "../../src/lib/streaming-api";
import { createDeveloperToken } from "../../src/lib/developer-api";
import { nextStreamingRead } from "../../src/lib/streaming-read";
import { mappoolCommand } from "../../src/lib/mappools";
import {
  deleteMappoolReplay,
  uploadMappoolReplay,
} from "../../src/lib/mappool-replays";
import * as replayStorage from "../../src/lib/replay-storage";
import { GET as publicPool } from "../../src/app/api/tournaments/[edition]/mappools/[poolId]/route";
import { GET as showcaseList } from "../../src/app/api/v1/streaming/tournaments/[edition]/showcase/pools/route";
import { GET as showcaseDetail } from "../../src/app/api/v1/streaming/tournaments/[edition]/showcase/pools/[poolId]/route";
import { GET as showcaseCover } from "../../src/app/api/v1/streaming/tournaments/[edition]/showcase/pools/[poolId]/covers/[entryId]/route";
import { GET as showcaseReplays } from "../../src/app/api/v1/streaming/tournaments/[edition]/showcase/pools/[poolId]/replays/route";
import { GET as showcaseReplayFile } from "../../src/app/api/v1/streaming/tournaments/[edition]/showcase/pools/[poolId]/replays/[replayId]/route";
import { GET as stream } from "../../src/app/api/v1/streaming/tournaments/[edition]/next/route";
import { GET as me } from "../../src/app/api/v1/me/route";
import { POST as issueAccess } from "../../src/app/api/streaming/tokens/route";
import { DELETE as revokeAccess } from "../../src/app/api/streaming/tokens/[tokenId]/route";
import {
  createStreamingAccessWrite,
  revokeStreamingAccessWrite,
} from "../../src/lib/streaming-write-contract";
import { readApiRoute } from "../../src/lib/read-api";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { syntheticReplay } from "../fixtures/replay";
let ownerId = 541000;
const url = process.env.TEST_DATABASE_URL;
const slug = "test-cup",
  origin = "http://127.0.0.1:3001",
  backend = "https://oclr.example.test";
let subject: Awaited<ReturnType<typeof readSessionContext>>,
  browserToken: string,
  token: string,
  accessId: string,
  first: string,
  second: string,
  roundId: string;
vi.mock("next/headers.js", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "__Host-oclr_session" ? { value: browserToken } : undefined,
  }),
  headers: async () => new Headers(),
}));
const request = (
  method = "GET",
  query = "",
  credential = token,
  localOrigin: string | null = origin,
) =>
  new Request(`${backend}/api/v1/streaming/tournaments/${slug}/next${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${credential}`,
      ...(localOrigin ? { Origin: localOrigin } : {}),
    },
  });
const read = (req = request(), edition = slug) =>
  stream(req, { params: Promise.resolve({ edition }) });
const tokenRow = async () =>
  (
    await db()
      .select()
      .from(streamingApiTokens)
      .where(eq(streamingApiTokens.id, accessId))
  )[0];
describe.skipIf(!url)("streaming read channel #540", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", backend);
  });
  beforeEach(async () => {
    vi.stubEnv("OCLR_STREAMING_ORIGINS", undefined);
    ownerId++;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([edition, { ...edition, slug: "other-test" }]);
    await db()
      .insert(users)
      .values([
        { osuId: ownerId, username: "Synthetic streamer" },
        { osuId: 540002, username: "Other streamer" },
      ]);
    await db().insert(staffRoles).values({
      userId: ownerId,
      role: "streamer",
      editionSlug: slug,
      grantedBy: ownerId,
    });
    const browser = await createSession(ownerId);
    browserToken = browser.token;
    subject = await readSessionContext(browser.token);
    const issued = await createStreamingToken(subject!, {
      editionSlug: slug,
      origin,
    });
    token = issued.token;
    accessId = issued.access.id;
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: slug, kind: "knockout" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: slug,
        stageId: stage.id,
        name: "Synthetic round",
        position: 1,
      })
      .returning();
    roundId = round.id;
    const rows = await db()
      .insert(fixtures)
      .values(
        [1, 2].map((position) => ({
          editionSlug: slug,
          roundId,
          label: `Match ${position}`,
          timeZone: "Asia/Taipei",
          position,
          publishedAt: new Date(),
          scheduledAt: new Date("2020-01-01T00:00:00Z"),
        })),
      )
      .returning();
    [first, second] = rows.map((f) => f.id);
    await db()
      .insert(fixtureStreams)
      .values(
        rows.map((f) => ({
          fixtureId: f.id,
          userId: ownerId,
          assignedBy: ownerId,
          source: "staff" as const,
          confirmedTimeZone: "Asia/Taipei",
        })),
      );
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("issues custom-port access with localhost aliases while retaining scheme/port restrictions", async () => {
    const localOrigin = "http://127.0.0.1:3011";
    const issued = await createStreamingToken(subject!, {
      editionSlug: slug,
      origin: localOrigin,
    });
    expect(issued.access.origin).toBe(localOrigin);
    expect(
      (await read(request("GET", "", issued.token, localOrigin))).status,
    ).toBe(200);
    expect((await read(request("GET", "", issued.token, origin))).status).toBe(
      403,
    );
    expect(
      (await read(request("GET", "", issued.token, "http://localhost:3011")))
        .status,
    ).toBe(200);
    expect(
      (await read(request("GET", "", issued.token, "https://localhost:3011")))
        .status,
    ).toBe(403);
    vi.stubEnv("OCLR_STREAMING_ORIGINS", "http://localhost:3011");
    expect(
      (await read(request("GET", "", issued.token, localOrigin))).status,
    ).toBe(200);
    const alias = await createStreamingToken(subject!, {
      editionSlug: slug,
      origin: "http://localhost:3011",
    });
    expect(
      (await read(request("GET", "", alias.token, localOrigin))).status,
    ).toBe(200);
    expect((await read(request("GET", "", issued.token, null))).status).toBe(
      200,
    );
    vi.stubEnv("OCLR_STREAMING_ORIGINS", origin);
    expect(
      (await read(request("GET", "", issued.token, localOrigin))).status,
    ).toBe(403);
    await expect(
      createStreamingToken(subject!, {
        editionSlug: slug,
        origin: localOrigin,
      }),
    ).rejects.toMatchObject({ code: "ORIGIN_NOT_ALLOWED" });
  });
  it("lists only live Streamer editions and never infers API access from Admin or Developer", async () => {
    await seedEditions([
      { ...edition, slug: "history-test", status: "completed" },
      { ...edition, slug: "unpublished-test", published: false },
    ]);
    expect(await hasStreamingMenuAccess(ownerId)).toBe(true);
    expect((await streamingAccessEditions(ownerId)).map((e) => e.slug)).toEqual(
      [slug],
    );
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: 540002,
          role: "admin",
          editionSlug: null,
          grantedBy: ownerId,
        },
        {
          userId: 540002,
          role: "developer",
          editionSlug: null,
          grantedBy: ownerId,
        },
      ]);
    expect(await hasStreamingMenuAccess(540002)).toBe(false);
    await expect(streamingAccessEditions(540002)).rejects.toMatchObject({
      status: 403,
    });
    await db().insert(staffRoles).values({
      userId: 540002,
      role: "streamer",
      editionSlug: null,
      grantedBy: ownerId,
    });
    expect(
      (await streamingAccessEditions(540002)).map((e) => e.slug).sort(),
    ).toEqual(["other-test", slug].sort());
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, ownerId));
    expect(await hasStreamingMenuAccess(ownerId)).toBe(false);
    await expect(streamingAccessEditions(ownerId)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("uses shared fixture/stage schema and keeps delayed matches; honors explicit next anchor", async () => {
    const response = await read();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.nextFixture.id).toBe(first);
    expect(body.data.stage.round.id).toBe(roundId);
    expect(body.data.mappools).toEqual([]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-oclr-read-contract")).toBe(
      readContractVersion,
    );
    expect(body.data).toEqual(
      JSON.parse(JSON.stringify(await nextStreamingRead(subject!, slug))),
    );
    expect(
      (await (await read(request("GET", `?afterFixtureId=${first}`))).json())
        .data.nextFixture.id,
    ).toBe(second);
    expect(
      (await (await read(request("GET", `?afterFixtureId=${second}`))).json())
        .data,
    ).toEqual({ nextFixture: null, stage: null, mappools: [] });
  });
  it("excludes approved but unpublished results without exposing review details", async () => {
    await db()
      .insert(matchResults)
      .values({ fixtureId: first, state: "approved" });
    const [imported] = await db()
      .insert(matchImports)
      .values({
        fixtureId: first,
        externalMatchId: 54001,
        fingerprint: "synthetic",
        source: {},
        createdBy: ownerId,
      })
      .returning();
    await db()
      .insert(resultRevisions)
      .values({
        fixtureId: first,
        importId: imported.id,
        revision: 1,
        proposal: {} as never,
        createdBy: ownerId,
        approvedAt: new Date(),
        approvedBy: ownerId,
      });
    const body = await (await read()).json();
    expect(body.data.nextFixture.id).toBe(second);
    expect(JSON.stringify(body)).not.toContain("proposal");
  });
  it("excludes a saved referee-complete series before any result submission", async () => {
    const home = randomUUID(),
      away = randomUUID(),
      pick = randomUUID(),
      attempt = pick;
    await db()
      .insert(refereeSessions)
      .values({
        fixtureId: first,
        editionSlug: slug,
        dependencyFingerprint: "a".repeat(64),
        settings: emptyRefereeSettings,
        basis: {
          policy: null,
          teamIds: [home, away],
          maps: [],
          series: { type: "first_to", wins: 1 },
        },
      });
    await db()
      .insert(refereeEvents)
      .values([
        {
          id: pick,
          fixtureId: first,
          ordinal: 1,
          actorId: ownerId,
          requestKey: randomUUID(),
          requestHash: "a".repeat(64),
          payload: {
            type: "selection_recorded",
            stepIndex: 0,
            kind: "pick",
            teamId: home,
            entryId: randomUUID(),
            beatmapId: 1,
            category: "NM",
          },
        },
        {
          fixtureId: first,
          ordinal: 2,
          actorId: ownerId,
          requestKey: randomUUID(),
          requestHash: "b".repeat(64),
          payload: {
            type: "attempt_started",
            pickId: pick,
            attemptId: attempt,
          },
        },
        {
          fixtureId: first,
          ordinal: 3,
          actorId: ownerId,
          requestKey: randomUUID(),
          requestHash: "c".repeat(64),
          payload: {
            type: "attempt_resolved",
            pickId: pick,
            attemptId: attempt,
            status: "completed",
            winnerTeamId: home,
          },
        },
      ]);
    expect((await (await read()).json()).data.nextFixture.id).toBe(second);
  });
  it("returns 429 and Retry-After without extending the idle lease", async () => {
    const before = await tokenRow();
    let response: Response | undefined;
    for (let i = 0; i < 121; i++) response = await read(request("HEAD"));
    expect(response!.status).toBe(429);
    expect(response!.headers.get("retry-after")).toBe("60");
    expect((await tokenRow()).lastUsedAt).toEqual(before.lastUsedAt);
  });
  it("keeps fixture, stage and pool on one snapshot during a concurrent edit", async () => {
    const [pool] = await db()
      .insert(mappools)
      .values({
        editionSlug: slug,
        roundId,
        name: "Before pool",
        publishedAt: new Date(),
      })
      .returning();
    await db()
      .update(fixtures)
      .set({ mappoolId: pool.id })
      .where(eq(fixtures.id, first));
    let reached!: () => void, resume!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const original = poolsModule.publicMappools;
    const spy = vi
      .spyOn(poolsModule, "publicMappools")
      .mockImplementationOnce(async (...args) => {
        reached();
        await gate;
        return original(...args);
      });
    const pending = read();
    try {
      await paused;
      await db().transaction(async (tx) => {
        await tx
          .update(tournamentRounds)
          .set({ name: "After round" })
          .where(eq(tournamentRounds.id, roundId));
        await tx
          .update(mappools)
          .set({ name: "After pool" })
          .where(eq(mappools.id, pool.id));
      });
    } finally {
      resume();
    }
    const response = await pending;
    spy.mockRestore();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.stage.round.name).toBe("Synthetic round");
    expect(data.mappools[0].name).toBe("Before pool");
    const fresh = await (await read()).json();
    expect(fresh.data.stage.round.name).toBe("After round");
    expect(fresh.data.mappools[0].name).toBe("After pool");
  });
  it("does not modify business rows when reading or rejecting mutations", async () => {
    const state = async () =>
      JSON.stringify([
        await db().select().from(fixtures),
        await db().select().from(tournamentRounds),
        await db().select().from(mappools),
        await db().select().from(fixtureStreams),
      ]);
    const before = await state();
    await read();
    await read(request("POST"));
    await read(request("HEAD"));
    expect(await state()).toBe(before);
  });
  it("never substitutes another published pool for the explicit fixture pool", async () => {
    await db().insert(mappools).values({
      editionSlug: slug,
      roundId,
      name: "Unrelated public pool",
      publishedAt: new Date(),
    });
    const [pool] = await db()
      .insert(mappools)
      .values({ editionSlug: slug, roundId, name: "Hidden pool" })
      .returning();
    await db()
      .update(fixtures)
      .set({ mappoolId: pool.id })
      .where(eq(fixtures.id, first));
    expect((await (await read()).json()).data.mappools).toEqual([]);
    await db()
      .update(mappools)
      .set({ publishedAt: new Date() })
      .where(eq(mappools.id, pool.id));
    expect(
      (await (await read()).json()).data.mappools.map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual([pool.id]);
  });
  const showcasePath = (edition: string) =>
    `/api/v1/streaming/tournaments/${edition}/showcase/pools`;
  const showcaseRequest = (
    suffix = "",
    credential: string | null = token,
    edition = slug,
    method = "GET",
  ) =>
    new Request(backend + showcasePath(edition) + suffix, {
      method,
      headers: {
        Origin: origin,
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
    });
  const listShowcase = (req = showcaseRequest(), edition = slug) =>
    showcaseList(req, { params: Promise.resolve({ edition }) });
  const detailShowcase = (poolId: string, query = "", credential = token) =>
    showcaseDetail(showcaseRequest(`/${poolId}${query}`, credential), {
      params: Promise.resolve({ edition: slug, poolId }),
    });
  const readCover = (
    poolId: string,
    entryId: string,
    version: number,
    credential: string | null = token,
  ) =>
    showcaseCover(
      showcaseRequest(
        `/${poolId}/covers/${entryId}?version=${version}`,
        credential,
      ),
      { params: Promise.resolve({ edition: slug, poolId, entryId }) },
    );
  const listReplays = (poolId: string, version: number, edition = slug) =>
    showcaseReplays(
      showcaseRequest(`/${poolId}/replays?version=${version}`, token, edition),
      { params: Promise.resolve({ edition, poolId }) },
    );
  const downloadReplay = (
    poolId: string,
    replayId: string,
    version: number,
    edition = slug,
    method = "GET",
  ) =>
    showcaseReplayFile(
      showcaseRequest(
        `/${poolId}/replays/${replayId}?version=${version}`,
        token,
        edition,
        method,
      ),
      { params: Promise.resolve({ edition, poolId, replayId }) },
    );
  const showcaseAdmin = { osuId: 540002, username: "Other streamer" };
  async function configureShowcaseAdmin() {
    await db().insert(staffRoles).values({
      userId: showcaseAdmin.osuId,
      role: "admin",
      editionSlug: slug,
      grantedBy: ownerId,
    });
  }
  const lock = (poolId: string, expectedVersion: number, locked = true) =>
    mappoolCommand(showcaseAdmin, slug, {
      action: "pool_selection_lock",
      poolId,
      expectedVersion,
      locked,
      confirmed: true,
    });
  const grant = (
    poolId: string,
    expectedVersion: number,
    enabled = true,
    userId = ownerId,
  ) =>
    mappoolCommand(showcaseAdmin, slug, {
      action: "pool_showcase",
      poolId,
      expectedVersion,
      userId,
      enabled,
      confirmed: true,
    });

  it("lists only locked, unpublished pools granted to this Streamer without any fixture assignment", async () => {
    await configureShowcaseAdmin();
    await db().delete(fixtureStreams);
    const [pool, empty, draft] = await db()
      .insert(mappools)
      .values(
        ["Synthetic embargoed pool", "Empty rehearsal", "Locked nowhere"].map(
          (name) => ({ editionSlug: slug, roundId, name }),
        ),
      )
      .returning();
    const [entry, uncovered] = await db()
      .insert(mappoolEntries)
      .values([
        {
          poolId: pool.id,
          category: "NM",
          position: 1,
          beatmapId: 9101,
          metadata: {
            setId: 8181,
            title: "Synthetic track",
            difficulty: "Insane",
            artist: "Synthetic artist",
            mapper: "Synthetic mapper",
            stars: 5,
            bpm: 180,
            duration: 100,
          },
          downloadMirror: "https://example.test/private-map.zip",
        },
        {
          poolId: pool.id,
          category: "HD",
          position: 2,
          beatmapId: 9102,
          metadata: {
            setId: 0,
            title: "Synthetic second",
            difficulty: "Extra",
            artist: "Synthetic artist",
            mapper: "Synthetic mapper",
            stars: 6,
            bpm: 180,
            duration: 100,
          },
        },
      ])
      .returning();

    await expect(grant(pool.id, 0)).rejects.toMatchObject({ status: 409 });
    expect((await (await listShowcase()).json()).data.pools).toEqual([]);
    await lock(pool.id, 0);
    await expect(
      mappoolCommand(showcaseAdmin, slug, {
        action: "pool_settings",
        poolId: pool.id,
        expectedVersion: 1,
        name: "Unreviewed change",
        fmMode: null,
        fmRestrictions: "",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 409 });

    await lock(empty.id, 0);
    await grant(pool.id, 1);
    await grant(empty.id, 1);
    expect((await (await read()).json()).data).toEqual({
      nextFixture: null,
      stage: null,
      mappools: [],
    });
    expect(await poolsModule.publicMappools(slug)).toEqual([]);
    const publicResponse = await publicPool(
      new Request(`${backend}/api/tournaments/${slug}/mappools/${pool.id}`),
      { params: Promise.resolve({ edition: slug, poolId: pool.id }) },
    );
    expect(publicResponse.status).toBe(404);
    expect(await publicResponse.text()).not.toContain(pool.name);

    const list = await listShowcase();
    expect(list.headers.get("Cache-Control")).toBe("private, no-store");
    expect(list.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(list.headers.get("Vary")).toContain("Authorization");
    expect(list.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    const {
      data: { pools },
    } = await list.json();
    expect(pools.map((p: { id: string }) => p.id)).toEqual([empty.id, pool.id]);
    const response = await detailShowcase(pool.id, "?version=1");
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.pool).toEqual(pools[1]);
    expect(data.pool).toMatchObject({
      version: 1,
      stage: { kind: "knockout" },
      round: { id: roundId },
      entryCount: 2,
    });
    expect(data.entries).toEqual([
      {
        entryId: entry.id,
        slot: "NM1",
        category: "NM",
        position: 1,
        beatmapId: 9101,
        title: "Synthetic track",
        difficulty: "Insane",
        coverUrl: `${showcasePath(slug)}/${pool.id}/covers/${entry.id}?version=1`,
      },
      {
        entryId: uncovered.id,
        slot: "HD2",
        category: "HD",
        position: 2,
        beatmapId: 9102,
        title: "Synthetic second",
        difficulty: "Extra",
        coverUrl: null,
      },
    ]);
    expect(
      (await (await detailShowcase(empty.id)).json()).data.entries,
    ).toEqual([]);
    expect((await detailShowcase(draft.id)).status).toBe(404);
    expect((await detailShowcase(pool.id, "?version=0")).status).toBe(409);
    expect((await detailShowcase(pool.id, "?version=1&version=2")).status).toBe(
      400,
    );
    expect((await listShowcase(showcaseRequest("", null))).status).toBe(401);
    expect(
      (
        await listShowcase(
          showcaseRequest("", token, "other-test"),
          "other-test",
        )
      ).status,
    ).toBe(403);
    expect(
      (await listShowcase(showcaseRequest("", token, slug, "POST"))).status,
    ).toBe(405);
    const head = await listShowcase(showcaseRequest("", token, slug, "HEAD"));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    await mappoolCommand(showcaseAdmin, slug, {
      action: "pool_publish",
      poolId: pool.id,
      expectedVersion: 1,
      published: true,
      confirmed: true,
    });
    expect((await detailShowcase(pool.id, "?version=1")).status).toBe(404);
    expect((await readCover(pool.id, entry.id, 1)).status).toBe(404);
    expect(
      (await poolsModule.publicMappools(slug)).map(({ id }) => id),
    ).toContain(pool.id);
  });

  it("rechecks per-pool grants, participants, locks, credentials and artwork before serving", async () => {
    await configureShowcaseAdmin();
    await db().insert(staffRoles).values({
      userId: showcaseAdmin.osuId,
      role: "streamer",
      editionSlug: slug,
      grantedBy: ownerId,
    });
    const secondBrowser = await createSession(showcaseAdmin.osuId);
    const secondAccess = await createStreamingToken(
      (await readSessionContext(secondBrowser.token))!,
      {
        editionSlug: slug,
        origin,
      },
    );
    const [pool] = await db()
      .insert(mappools)
      .values({ editionSlug: slug, roundId, name: "Synthetic private plan" })
      .returning();
    const [entry] = await db()
      .insert(mappoolEntries)
      .values({
        poolId: pool.id,
        category: "NM",
        position: 1,
        beatmapId: 9101,
        metadata: {
          setId: 8181,
          title: "Synthetic track",
          difficulty: "Insane",
          artist: "Synthetic artist",
          mapper: "Synthetic mapper",
          stars: 5,
          bpm: 180,
          duration: 100,
        },
      })
      .returning();
    await lock(pool.id, 0);
    await grant(pool.id, 1);
    expect((await detailShowcase(pool.id, "", secondAccess.token)).status).toBe(
      404,
    );

    const media = () =>
      new Response(Uint8Array.of(255, 216, 255, 217), {
        headers: { "Content-Type": "image/jpeg" },
      });
    const fetchCover = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => media());
    try {
      expect((await readCover(pool.id, entry.id, 1, null)).status).toBe(401);
      expect(
        (await readCover(pool.id, entry.id, 1, secondAccess.token)).status,
      ).toBe(404);
      expect((await readCover(pool.id, randomUUID(), 1)).status).toBe(404);
      expect(fetchCover).not.toHaveBeenCalled();
      const cover = await readCover(pool.id, entry.id, 1);
      expect(cover.status).toBe(200);
      expect(cover.headers.get("Cache-Control")).toBe("private, no-store");
      expect(cover.headers.get("Content-Type")).toBe("image/jpeg");
      expect(await cover.arrayBuffer()).toEqual(
        new Uint8Array([255, 216, 255, 217]).buffer,
      );
      expect(fetchCover).toHaveBeenCalledWith(
        "https://assets.ppy.sh/beatmaps/8181/covers/cover.jpg",
        expect.objectContaining({
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
        }),
      );

      await db().insert(registrations).values({
        editionSlug: slug,
        userId: ownerId,
        status: "accepted",
        answers: {},
      });
      for (const request of [
        listShowcase(),
        detailShowcase(pool.id),
        readCover(pool.id, entry.id, 1),
      ]) {
        const denied = await request;
        expect(denied.status).toBe(403);
        expect(await denied.text()).not.toContain(pool.name);
      }
      await db().delete(registrations).where(eq(registrations.userId, ownerId));
      await db().insert(captains).values({
        editionSlug: slug,
        userId: ownerId,
        position: 1,
        published: false,
      });
      expect((await listShowcase()).status).toBe(403);
      expect((await detailShowcase(pool.id)).status).toBe(403);
      expect((await readCover(pool.id, entry.id, 1)).status).toBe(403);
      await expect(grant(pool.id, 1)).rejects.toMatchObject({ status: 403 });
      await db().delete(captains).where(eq(captains.userId, ownerId));
      expect(fetchCover).toHaveBeenCalledTimes(1);

      // Withdrawal during provider I/O prevents returning the already-fetched artwork.
      fetchCover.mockImplementationOnce(async () => {
        await grant(pool.id, 1, false);
        return media();
      });
      const revoked = await readCover(pool.id, entry.id, 1);
      expect(revoked.status).toBe(404);
      expect(await revoked.text()).not.toContain(pool.name);
      expect((await (await listShowcase()).json()).data.pools).toEqual([]);
      expect((await detailShowcase(pool.id)).status).toBe(404);
      expect((await readCover(pool.id, entry.id, 1)).status).toBe(404);

      await grant(pool.id, 1);
      const replay = await readApiRoute(
        new Request(
          `${backend}/api/v1/staff/tournaments/${slug}/mappool-entries/${entry.id}/replays/${randomUUID()}/file`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      expect(replay.status).toBe(401);
      await lock(pool.id, 1, false);
      await lock(pool.id, 2);
      expect((await (await listShowcase()).json()).data.pools).toEqual([]);
      expect((await detailShowcase(pool.id)).status).toBe(404);
      expect((await readCover(pool.id, entry.id, 1)).status).toBe(404);
      await grant(pool.id, 3);
      expect((await readCover(pool.id, entry.id, 1)).status).toBe(409);
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, ownerId));
      expect((await listShowcase()).status).toBe(403);
      expect((await detailShowcase(pool.id)).status).toBe(403);
      expect((await readCover(pool.id, entry.id, 3)).status).toBe(403);
      await revokeStreamingToken(subject!, accessId);
      expect((await listShowcase()).status).toBe(401);
      expect((await readCover(pool.id, entry.id, 3)).status).toBe(401);
      expect(fetchCover).toHaveBeenCalledTimes(2);
    } finally {
      fetchCover.mockRestore();
    }
  });
  it("lists every Showcase slot and downloads original replays only for the separately approved version", async () => {
    await configureShowcaseAdmin();
    await db().delete(fixtureStreams);
    const media = await realpath(
      await mkdtemp(join(tmpdir(), "oclr-1189-media-")),
    );
    vi.stubEnv("OCLR_MEDIA_DIR", media);
    const replayAccess = (
      poolId: string,
      expectedVersion: number,
      enabled = true,
    ) =>
      mappoolCommand(showcaseAdmin, slug, {
        action: "pool_showcase_replays",
        poolId,
        expectedVersion,
        userId: ownerId,
        enabled,
        confirmed: true,
      });

    const [pool, other] = await db()
      .insert(mappools)
      .values(
        ["Replay Showcase", "Other Showcase"].map((name) => ({
          editionSlug: slug,
          roundId,
          name,
        })),
      )
      .returning();
    const metadata = {
      setId: 0,
      title: "Synthetic track",
      difficulty: "Insane",
      artist: "Synthetic artist",
      mapper: "Synthetic mapper",
      stars: 5,
      bpm: 180,
      duration: 100,
    };
    const [empty, one, many] = await db()
      .insert(mappoolEntries)
      .values(
        [1, 2, 3].map((position) => ({
          poolId: pool.id,
          category: "NM" as const,
          position,
          beatmapId: 9100 + position,
          metadata,
        })),
      )
      .returning();

    const bytes = syntheticReplay({ player: "Replay A", mods: 8 });
    const secondBytes = syntheticReplay({ player: "Replay B", mods: 0 });
    const filename = "示範 A.osr";
    const upload = (
      entryId: string,
      expectedVersion: number,
      original = bytes,
      name = filename,
    ) =>
      uploadMappoolReplay(
        showcaseAdmin,
        slug,
        entryId,
        { confirmed: true, expectedVersion },
        name,
        "Private notes",
        original,
      );
    const expectDenied = async (
      version: number,
      replayId: string,
      status: number,
      code?: string,
    ) => {
      const responses = await Promise.all([
        listReplays(pool.id, version),
        downloadReplay(pool.id, replayId, version),
      ]);
      for (const response of responses) {
        expect(response.status).toBe(status);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        const error = (await response.json()).error;
        if (code) expect(error.code).toBe(code);
        expect(error.message).not.toContain(filename);
      }
    };

    try {
      await lock(pool.id, 0);
      const single = await upload(one.id, 1);
      const firstReplay = await upload(many.id, single.version);
      const secondReplay = await upload(
        many.id,
        firstReplay.version,
        secondBytes,
        "B.osr",
      );
      const version = secondReplay.version;
      await expect(replayAccess(pool.id, version)).rejects.toMatchObject({
        status: 409,
      });
      await grant(pool.id, version);
      expect(
        (await detailShowcase(pool.id, `?version=${version}`)).status,
      ).toBe(200);
      await expectDenied(
        version,
        firstReplay.id,
        403,
        "SHOWCASE_REPLAYS_FORBIDDEN",
      );
      await replayAccess(pool.id, version);
      const workspace = await poolsModule.mappoolWorkspace(showcaseAdmin, slug);
      expect(
        workspace.pools.find(({ id }) => id === pool.id)?.showcaseGrants,
      ).toEqual([
        { osuId: ownerId, username: "Synthetic streamer", allowReplays: true },
      ]);

      const list = await listReplays(pool.id, version);
      expect(list.status).toBe(200);
      expect(list.headers.get("Cache-Control")).toBe("private, no-store");
      expect(list.headers.get("CDN-Cache-Control")).toBe("no-store");
      const replayA = { filename, playerName: "Replay A", mods: 8 };
      expect((await list.json()).data).toEqual({
        poolId: pool.id,
        version,
        entries: [
          { entryId: empty.id, slot: "NM1", replays: [] },
          {
            entryId: one.id,
            slot: "NM2",
            replays: [{ replayId: single.id, ...replayA }],
          },
          {
            entryId: many.id,
            slot: "NM3",
            replays: [
              { replayId: firstReplay.id, ...replayA },
              {
                replayId: secondReplay.id,
                filename: "B.osr",
                playerName: "Replay B",
                mods: 0,
              },
            ],
          },
        ],
      });
      const file = await downloadReplay(pool.id, firstReplay.id, version);
      expect(file.status).toBe(200);
      expect(file.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(file.headers.get("Content-Disposition")).toContain(
        encodeURIComponent(filename),
      );
      expect(file.headers.get("Content-Length")).toBe(String(bytes.length));
      expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
      const head = await downloadReplay(
        pool.id,
        firstReplay.id,
        version,
        slug,
        "HEAD",
      );
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");

      await lock(other.id, 0);
      await grant(other.id, 1);
      await replayAccess(other.id, 1);
      expect((await downloadReplay(other.id, firstReplay.id, 1)).status).toBe(
        404,
      );
      expect((await listReplays(pool.id, version, "other-test")).status).toBe(
        403,
      );
      expect(
        (await downloadReplay(pool.id, firstReplay.id, version, "other-test"))
          .status,
      ).toBe(403);

      await db().insert(registrations).values({
        editionSlug: slug,
        userId: ownerId,
        status: "accepted",
        answers: {},
      });
      await expectDenied(version, firstReplay.id, 403, "SHOWCASE_FORBIDDEN");
      await db().delete(registrations).where(eq(registrations.userId, ownerId));
      await db().insert(captains).values({
        editionSlug: slug,
        userId: ownerId,
        position: 1,
        published: false,
      });
      await expectDenied(version, firstReplay.id, 403, "SHOWCASE_FORBIDDEN");
      await db().delete(captains).where(eq(captains.userId, ownerId));

      const readReplay = replayStorage.readReplay;
      const revokeDuringRead = vi
        .spyOn(replayStorage, "readReplay")
        .mockImplementationOnce(async (...args) => {
          const original = await readReplay(...args);
          await replayAccess(pool.id, version, false);
          return original;
        });
      try {
        const denied = await downloadReplay(pool.id, firstReplay.id, version);
        expect(denied.status).toBe(403);
        expect((await denied.json()).error.code).toBe(
          "SHOWCASE_REPLAYS_FORBIDDEN",
        );
      } finally {
        revokeDuringRead.mockRestore();
      }
      await expectDenied(
        version,
        firstReplay.id,
        403,
        "SHOWCASE_REPLAYS_FORBIDDEN",
      );
      expect((await detailShowcase(pool.id)).status).toBe(200);

      await replayAccess(pool.id, version);
      await grant(pool.id, version, false);
      await expectDenied(version, firstReplay.id, 404);
      await expect(replayAccess(pool.id, version)).rejects.toMatchObject({
        status: 409,
      });
      await grant(pool.id, version);
      await replayAccess(pool.id, version);
      expect(await upload(many.id, version)).toMatchObject({
        duplicate: true,
        version,
      });
      const added = await upload(empty.id, version);
      expect(added.version).toBe(version + 1);
      await expectDenied(version, added.id, 404);
      await expectDenied(added.version, added.id, 404);
      await grant(pool.id, added.version);
      await expectDenied(
        added.version,
        added.id,
        403,
        "SHOWCASE_REPLAYS_FORBIDDEN",
      );
      await replayAccess(pool.id, added.version);
      await expectDenied(version, added.id, 409, "SHOWCASE_VERSION_CHANGED");
      expect(
        (await downloadReplay(pool.id, added.id, added.version)).status,
      ).toBe(200);
      const deleted = await deleteMappoolReplay(
        showcaseAdmin,
        slug,
        many.id,
        firstReplay.id,
        {
          expectedVersion: added.version,
          confirmed: true,
        },
      );
      expect(deleted).toEqual({ removed: true, version: added.version + 1 });
      await expectDenied(added.version, secondReplay.id, 404);
      await grant(pool.id, deleted.version);
      await replayAccess(pool.id, deleted.version);
      expect(
        (await downloadReplay(pool.id, firstReplay.id, deleted.version)).status,
      ).toBe(404);
      expect((await listReplays(pool.id, deleted.version)).status).toBe(200);

      await lock(pool.id, deleted.version, false);
      await expectDenied(deleted.version, secondReplay.id, 404);
      await lock(pool.id, deleted.version + 1);
      const relockedVersion = deleted.version + 2;
      await grant(pool.id, relockedVersion);
      await replayAccess(pool.id, relockedVersion);
      await mappoolCommand(showcaseAdmin, slug, {
        action: "pool_publish",
        poolId: pool.id,
        expectedVersion: relockedVersion,
        published: true,
        confirmed: true,
      });
      await expectDenied(relockedVersion, secondReplay.id, 404);
      expect(
        (await poolsModule.publicMappools(slug)).map(({ id }) => id),
      ).toContain(pool.id);
    } finally {
      await rm(media, { recursive: true, force: true });
    }
  });

  it("handles unassigned, cancelled, unscheduled and unpublished fixtures without fallback", async () => {
    await db()
      .update(fixtures)
      .set({ status: "cancelled" })
      .where(eq(fixtures.id, first));
    expect((await (await read()).json()).data.nextFixture.id).toBe(second);
    await db()
      .update(fixtures)
      .set({ scheduledAt: null })
      .where(eq(fixtures.id, second));
    expect((await (await read()).json()).data.nextFixture).toBeNull();
    expect(
      (await read(request("GET", `?afterFixtureId=${second}`))).status,
    ).toBe(404);
    await db()
      .update(fixtures)
      .set({ status: "scheduled", publishedAt: null })
      .where(eq(fixtures.id, first));
    expect((await (await read()).json()).data.nextFixture).toBeNull();
  });
  it("rechecks reassignment and live grants, does not inherit Admin or Developer", async () => {
    await db().update(fixtureStreams).set({ userId: 540002 });
    expect((await (await read()).json()).data.nextFixture).toBeNull();
    expect(
      (await read(request("GET", `?afterFixtureId=${first}`))).status,
    ).toBe(404);
    await db()
      .insert(staffRoles)
      .values({ userId: ownerId, role: "admin", grantedBy: ownerId });
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.role, "streamer"));
    expect((await read()).status).toBe(403);
    await expect(
      createStreamingToken(subject!, { editionSlug: slug, origin }),
    ).rejects.toMatchObject({ status: 403 });
    // Owners can still revoke a credential after losing Streamer.
    await revokeStreamingToken(subject!, accessId);
  });
  it("rejects cross-edition, wrong origin, queries, token audience and all mutations", async () => {
    expect((await read(request(), "other-test")).status).toBe(403);
    expect((await read(request("GET", "", token, "null"))).status).toBe(403);
    expect((await read(request("GET", "?userId=540002"))).status).toBe(400);
    expect(
      (
        await read(
          request("GET", `?afterFixtureId=${first}&afterFixtureId=${first}`),
        )
      ).status,
    ).toBe(400);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      expect((await read(request(method))).status).toBe(405);
    expect((await me(request("GET", "", token, null))).status).toBe(401);
    expect(
      (await read(request("GET", "", "oclr_dev_" + "a".repeat(43)))).status,
    ).toBe(401);
    expect((await read(request("GET", "", token, null))).status).toBe(200);
  });
  it("returns the same JSON through the Developer channel only with both grants", async () => {
    await db()
      .insert(staffRoles)
      .values({ userId: ownerId, role: "developer", grantedBy: ownerId });
    const developer = await createDeveloperToken(subject!, {
      origin: "http://localhost:3000",
      scopes: ["identity:read"],
    });
    const path = ["me", "tournaments", slug, "streaming", "next"];
    const req = new Request(`${backend}/api/v1/${path.join("/")}`, {
      headers: { Authorization: `Bearer ${developer.token}` },
    });
    const res = await readApiRoute(req);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual((await (await read()).json()).data);
  });
  it("renews successful GET only, including empty responses, with bounded lease writes", async () => {
    await db().delete(fixtureStreams);
    await db()
      .update(streamingApiTokens)
      .set({
        createdAt: new Date(Date.now() - 7_200_000),
        lastUsedAt: new Date(Date.now() - 3_000_000),
        expiresAt: new Date(Date.now() + 600_000),
      })
      .where(eq(streamingApiTokens.id, accessId));
    const before = await tokenRow();
    expect((await read(request("HEAD"))).status).toBe(200);
    expect((await tokenRow()).expiresAt).toEqual(before.expiresAt);
    expect((await read(request("GET", "?invalid=1"))).status).toBe(400);
    expect((await tokenRow()).expiresAt).toEqual(before.expiresAt);
    expect((await read()).status).toBe(200);
    const renewed = await tokenRow();
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(
      before.expiresAt.getTime(),
    );
    await read();
    expect((await tokenRow()).lastUsedAt).toEqual(renewed.lastUsedAt);
  });
  it("caps renewal at the browser session and never revives expired tokens", async () => {
    const cap = new Date(Date.now() + 120_000);
    await db()
      .update(sessions)
      .set({ expiresAt: cap })
      .where(eq(sessions.tokenHash, subject!.tokenHash));
    await db()
      .update(streamingApiTokens)
      .set({
        createdAt: new Date(Date.now() - 120_000),
        lastUsedAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() + 600_000),
      })
      .where(eq(streamingApiTokens.id, accessId));
    expect((await read()).status).toBe(200);
    expect((await tokenRow()).expiresAt).toEqual(cap);
    await db()
      .update(streamingApiTokens)
      .set({
        createdAt: new Date(Date.now() - 7_200_000),
        lastUsedAt: new Date(Date.now() - 7_200_000),
        expiresAt: new Date(Date.now() - 3_600_000),
      })
      .where(eq(streamingApiTokens.id, accessId));
    expect((await read()).status).toBe(401);
  });
  it("revokes immediately and stores no raw token in metadata or audit", async () => {
    const list = await listStreamingTokens(subject!, slug);
    expect(JSON.stringify(list)).not.toContain(token);
    expect(
      JSON.stringify(await db().select().from(streamingApiEvents)),
    ).not.toContain(token);
    const creation = (authorization?: string) =>
      issueAccess(
        new Request(backend + createStreamingAccessWrite.path, {
          method: createStreamingAccessWrite.method,
          headers: {
            Origin: backend,
            "Content-Type": "application/json",
            ...(authorization ? { Authorization: authorization } : {}),
          },
          body: JSON.stringify({ editionSlug: slug, origin }),
        }),
      );
    const denied = await creation(`Bearer ${token}`);
    expect(denied.status).toBe(403);
    expect(
      createStreamingAccessWrite.error.safeParse(await denied.json()).success,
    ).toBe(true);
    const issued = await creation();
    expect(issued.status).toBe(201);
    expect(issued.headers.get("Cache-Control")).toBe("no-store");
    const body = createStreamingAccessWrite.response.parse(await issued.json());
    expect(body.access).toMatchObject({
      editionSlug: slug,
      origin,
      scopes: ["streaming:read"],
      revokedAt: null,
    });
    expect(body.backend).toBe(backend);
    const revoke = () =>
      revokeAccess(
        new Request(
          backend +
            revokeStreamingAccessWrite.path.replace("{tokenId}", accessId),
          {
            method: revokeStreamingAccessWrite.method,
            headers: { Origin: backend },
          },
        ),
        { params: Promise.resolve({ tokenId: accessId }) },
      );
    const revoked = await revoke();
    expect(revoked.status).toBe(200);
    const metadata = revokeStreamingAccessWrite.response.parse(
      await revoked.json(),
    );
    expect(metadata.id).toBe(accessId);
    expect(metadata.revokedAt).not.toBeNull();
    const repeated = await revoke();
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(metadata);
    expect(
      (
        await db()
          .select()
          .from(streamingApiEvents)
          .where(eq(streamingApiEvents.accessId, accessId))
      ).filter((event) => event.action === "revoke"),
    ).toHaveLength(1);
    expect((await read()).status).toBe(401);
  });
  it("invalidates on parent logout and checks preflight without extending activity", async () => {
    const before = await tokenRow();
    const preflight = new Request(request().url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect((await read(preflight)).status).toBe(204);
    expect((await tokenRow()).lastUsedAt).toEqual(before.lastUsedAt);
    await db()
      .delete(sessions)
      .where(eq(sessions.tokenHash, subject!.tokenHash));
    expect((await read()).status).toBe(401);
  });
});
