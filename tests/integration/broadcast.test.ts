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
import { userProfileCache, teams, draftSessions } from "../../src/db/schema";
import { prepareDraft } from "../fixtures/draft";
import { pickPlayer } from "../../src/lib/draft";
import { captainDraft, staffDraft } from "../../src/lib/draft-reads";
import { draftBoardTiers } from "../../src/lib/award-tiers";
import { publicBroadcastDraft } from "../../src/lib/broadcast";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { getOsuUserProfile } from "../../src/lib/osu-profiles";
import { profileResponse } from "../fixtures/osu-profile";
import { assertTestDatabase } from "../database";
import { randomUUID } from "node:crypto";
vi.mock("../../src/lib/osu-profiles", async (original) => ({
  ...(await original<typeof import("../../src/lib/osu-profiles")>()),
  getOsuUserProfile: vi.fn(),
}));
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("public broadcast profile projection", () => {
  const slug = "overlay-103-test";
  let f: Awaited<ReturnType<typeof prepareDraft>>;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", "110001");
  });
  beforeEach(async () => {
    vi.mocked(getOsuUserProfile).mockReset();
    await db().execute(
      sql`TRUNCATE edition_state,users,user_profile_cache CASCADE`,
    );
    f = await prepareDraft(slug, 110001, 4);
    const s = (await staffDraft(f.staff, slug)).session!;
    await pickPlayer(f.staff, slug, {
      sessionId: s.id,
      turnIndex: s.turnIndex,
      candidateId: f.players[0].osuId,
      expectedVersion: s.version,
      idempotencyKey: randomUUID(),
    });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function cache(
    id: number,
    mode: "osu" | "mania" = "osu",
    age = 0,
    errorStatus: number | null = null,
  ) {
    const profile = normalizeOsuProfile(
      { ...profileResponse, id, avatar_url: `https://a.ppy.sh/${id}` },
      id,
      mode,
      new Date(Date.now() - age).toISOString(),
    );
    await db()
      .insert(userProfileCache)
      .values({
        osuId: id,
        mode,
        profile,
        errorStatus,
        attemptedAt: new Date(),
        retryAt: new Date(Date.now() - 1),
      });
  }
  it("projects only already-published players, cached standard stats and no private profile fields without changing snapshots", async () => {
    await cache(f.players[0].osuId);
    await cache(f.players[7].osuId);
    const before = (await db().select().from(draftSessions))[0];
    const deferred: (() => Promise<void>)[] = [];
    const board = await publicBroadcastDraft(slug, (w) => {
      deferred.push(w);
    });
    expect(board!.picks[0].tier).toBe(1);
    expect(board!.picks[0].player.profile).toEqual({
      avatarUrl: `https://a.ppy.sh/${f.players[0].osuId}`,
      pp: 1234.56,
      globalRank: 12345,
      status: "fresh",
      fetchedAt: expect.any(String),
    });
    const text = JSON.stringify(board);
    for (const hidden of [
      f.players[7].username,
      String(f.players[7].osuId),
      f.staff.username,
      "countryRank",
      "previousUsernames",
      "badges",
      "MUST_NOT_CACHE_PRIVATE_CONTACT",
      "actorId",
      "staff_on_behalf",
      "turnSequence",
    ])
      expect(text).not.toContain(hidden);
    expect(board!.pool).toBeNull();
    expect(deferred).toHaveLength(0);
    expect(getOsuUserProfile).not.toHaveBeenCalled();
    expect((await db().select().from(draftSessions))[0]).toEqual(before);
  });
  it("uses the released round for each pick and omits Tier when the order is newer than the board", async () => {
    for (const player of f.players.slice(1, 3)) {
      const session = (await staffDraft(f.staff, slug)).session!;
      await pickPlayer(f.staff, slug, {
        sessionId: session.id,
        turnIndex: session.turnIndex,
        candidateId: player.osuId,
        expectedVersion: session.version,
        idempotencyKey: randomUUID(),
      });
    }
    const published = (await publicBroadcastDraft(slug))!;
    expect(published.picks.map(({ tier }) => tier)).toEqual([1, 1, 2]);
    const captainBoard = (await captainDraft(f.a, slug))!;
    const captainTiers = draftBoardTiers(
      captainBoard,
      captainBoard.turnSequence,
    );
    expect(
      f.players.slice(0, 3).map(({ osuId }) => captainTiers.get(osuId)),
    ).toEqual([1, 1, 2]);
    expect(captainTiers.get(f.a.osuId)).toBe(0);
    expect(captainTiers.has(f.players[3].osuId)).toBe(false);
    await db()
      .update(draftSessions)
      .set({ version: sql`${draftSessions.version} + 1` })
      .where(eq(draftSessions.editionSlug, slug));
    const held = (await publicBroadcastDraft(slug))!;
    expect(held.picks.map(({ id }) => id)).toEqual(
      published.picks.map(({ id }) => id),
    );
    expect(held.picks.every((pick) => pick.tier === undefined)).toBe(true);
  });
  it("keeps the board available with stale/missing/error data and defers at most the featured refresh using existing backoff", async () => {
    await cache(f.players[0].osuId, "osu", 31 * 60000, 503);
    for (const p of [f.a, f.b]) await cache(p.osuId, "osu", 60 * 60000);
    const tasks: (() => Promise<void>)[] = [];
    const board = await publicBroadcastDraft(slug, (w) => {
      tasks.push(w);
    });
    expect(board!.picks[0].player.profile).toMatchObject({
      pp: null,
      globalRank: null,
      status: "unavailable",
    });
    expect(tasks).toHaveLength(1);
    expect(getOsuUserProfile).not.toHaveBeenCalled();
    vi.mocked(getOsuUserProfile).mockRejectedValue(
      new Error("Synthetic provider outage"),
    );
    await expect(tasks[0]()).resolves.toBeUndefined();
    expect(getOsuUserProfile).toHaveBeenCalledExactlyOnceWith(
      f.players[0].osuId,
      "osu",
    );
    await db()
      .update(userProfileCache)
      .set({ retryAt: new Date(Date.now() + 60000) });
    tasks.length = 0;
    await publicBroadcastDraft(slug, (w) => {
      tasks.push(w);
    });
    expect(tasks).toHaveLength(0);
  });
  it("does not substitute another mode, use deleted avatars, or enrich unpublished/retracted picks", async () => {
    await cache(f.players[0].osuId, "mania");
    expect(
      (await publicBroadcastDraft(slug))!.picks[0].player.profile,
    ).toMatchObject({ pp: null, globalRank: null, status: "loading" });
    await cache(f.players[0].osuId, "osu", 0, 404);
    expect(
      (await publicBroadcastDraft(slug))!.picks[0].player.profile,
    ).toMatchObject({
      avatarUrl: null,
      pp: null,
      globalRank: null,
      status: "unavailable",
    });
    await db()
      .update(teams)
      .set({ identityPublished: false })
      .where(eq(teams.id, f.teamRows[0].id));
    expect(await publicBroadcastDraft(slug)).toBeNull();
    await db().update(draftSessions).set({ publicSnapshot: null });
    expect(await publicBroadcastDraft(slug)).toBeNull();
    expect(getOsuUserProfile).not.toHaveBeenCalled();
  });
  it("keeps partial statistics unknown and rejects unsafe cached avatar URLs and non-ranks", async () => {
    await cache(f.players[0].osuId);
    const [row] = await db().select().from(userProfileCache);
    await db()
      .update(userProfileCache)
      .set({
        profile: {
          ...row.profile!,
          avatarUrl: "https://untrusted.example.test/avatar",
          statistics: { ...row.profile!.statistics, pp: null, globalRank: 0 },
        },
      });
    expect(
      (await publicBroadcastDraft(slug))!.picks[0].player.profile,
    ).toMatchObject({ avatarUrl: null, pp: null, globalRank: null });
  });
});
