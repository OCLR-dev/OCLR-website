import { randomUUID } from "node:crypto";
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
