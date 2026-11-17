import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "@/db";
import {
  editionState,
  etxRatingCache,
  registrations,
  users,
} from "@/db/schema";
import { readDirectoryEtxRatings } from "@/lib/etx-rating";
import { refreshEtxRatings } from "@/lib/etx-rating-worker";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

const url = process.env.TEST_DATABASE_URL;
const slug = "s11";
const participants = [
  { osuId: 92101, username: "ETX A" },
  { osuId: 92102, username: "ETX B" },
  { osuId: 92103, username: "ETX C" },
  { osuId: 92104, username: "ETX Private" },
];
const ids = participants.map(({ osuId }) => osuId);

function providerRating(osuId: number) {
  return Response.json({
    osuUserId: String(osuId),
    duelRating: {
      osuDuelStarRating: "4.96954251",
      osuDuelProvisional: true,
      osuDuelOutdated: false,
    },
  });
}

describe.skipIf(!url)("S11 ETX refresh", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url);
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([{ ...edition, slug }]);
    await db().insert(users).values(participants);
    await db()
      .insert(registrations)
      .values(
        participants.map(({ osuId }, index) => ({
          editionSlug: slug,
          userId: osuId,
          status: index === 3 ? ("pending" as const) : ("accepted" as const),
          rulesVersion: "test-v1",
          answers: {},
        })),
      );
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("paces public lookups, caches confirmed results and preserves them on failure", async () => {
    const starts: number[] = [];
    const fetchRating = vi
      .fn<(url: URL) => Promise<Response>>()
      .mockImplementation(async (uri) => {
        starts.push(performance.now());
        switch (uri.searchParams.get("u")) {
          case String(ids[0]):
            expect(await refreshEtxRatings()).toEqual({ state: "busy" });
            return providerRating(ids[0]);
          case String(ids[1]):
            return new Response(
              "No duel rating found for the specified osu! user id",
              { status: 404 },
            );
          default:
            return new Response(null, { status: 502 });
        }
      });
    vi.stubGlobal("fetch", fetchRating);
    expect(await refreshEtxRatings()).toEqual({
      state: "complete",
      updated: 1,
      missing: 1,
      failed: 1,
      skipped: 0,
    });
    expect(
      fetchRating.mock.calls.map(([uri]) => uri.searchParams.get("u")),
    ).toEqual(ids.slice(0, 3).map(String));
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000);
    const saved = new Map([
      [ids[0], { value: 4.96954251, provisional: true, outdated: false }],
      [ids[1], null],
    ]);
    expect(await readDirectoryEtxRatings(ids)).toEqual(saved);
    expect(await refreshEtxRatings()).toMatchObject({ skipped: 3 });
    expect(fetchRating).toHaveBeenCalledTimes(3);

    await db().update(etxRatingCache).set({ attemptedOn: "2000-01-01" });
    fetchRating
      .mockReset()
      .mockResolvedValueOnce(providerRating(ids[3]))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect(await refreshEtxRatings()).toMatchObject({
      state: "throttled",
      updated: 0,
      failed: 2,
    });
    expect(fetchRating).toHaveBeenCalledTimes(2);
    expect(await readDirectoryEtxRatings(ids)).toEqual(saved);

    await db()
      .update(editionState)
      .set({ configuration: { ...edition, slug, published: false } })
      .where(eq(editionState.slug, slug));
    expect(await refreshEtxRatings()).toEqual({ state: "unavailable" });
    expect(fetchRating).toHaveBeenCalledTimes(2);
  });
});
