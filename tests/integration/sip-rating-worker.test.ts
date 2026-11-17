import { closeDb, db } from "../../src/db";
import {
  importedPlayerRatings,
  registrations,
  sipRatingCache,
  users,
} from "../../src/db/schema";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { publicPlayerDirectoryModel } from "../../src/lib/public-read-models";
import { refreshSipRatings } from "../../src/lib/sip-rating-worker";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

const url = process.env.TEST_DATABASE_URL;
const slug = "s11";
const [updated, missing, failed, limited, deferred, pending] = [
  90401, 90402, 90403, 90404, 90405, 90406,
];

describe.skipIf(!url)("Daily S11 SIP cache", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("SIP_API_TOKEN", "synthetic-worker-token");
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([{ ...edition, slug }, edition]);
    const ids = [updated, missing, failed, limited, deferred, pending];
    await db()
      .insert(users)
      .values(ids.map((osuId) => ({ osuId, username: `Synthetic ${osuId}` })));
    await db()
      .insert(registrations)
      .values(
        ids.map((userId) => ({
          editionSlug: slug,
          userId,
          status:
            userId === pending ? ("pending" as const) : ("accepted" as const),
          rulesVersion: "test-v1",
          answers: {},
        })),
      );
    await db()
      .insert(importedPlayerRatings)
      .values({
        editionSlug: slug,
        userId: deferred,
        source: "sip",
        value: 9876,
      });
    await db()
      .insert(sipRatingCache)
      .values({
        osuId: failed,
        value: 2920,
        fetchedAt: new Date("2025-01-01"),
      });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await closeDb();
  });

  it("paces provider calls, excludes private players and serves only verified saved totals", async () => {
    const calls: { id: number; at: number }[] = [];
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      const id = Number(input.split("/").at(-1));
      calls.push({ id, at: performance.now() });
      expect(input).toBe(`https://skillissue.app/ratings/${id}`);
      expect(new Headers(init.headers).get("source")).toBe(
        "synthetic-worker-token",
      );
      expect(init.redirect).toBe("error");
      if (id === updated) {
        expect((await refreshSipRatings(true)).stopped).toBe("busy");
        return Response.json({
          playerId: id,
          rating: { value: 4567, pp: 1111 },
          skillsets: { aim: { value: 1234 } },
        });
      }
      if (id === missing) return new Response(null, { status: 404 });
      if (id === failed)
        return Response.json({ playerId: id + 1, rating: { value: 9999 } });
      return new Response(null, { status: 429 });
    });

    expect((await refreshSipRatings(false)).pending).toBe(5);
    expect(calls).toHaveLength(0);
    expect(await refreshSipRatings(true)).toEqual({
      pending: 5,
      updated: 1,
      missing: 1,
      failed: 1,
      stopped: "rate-limited",
    });
    expect(calls.map(({ id }) => id)).toEqual([
      updated,
      missing,
      failed,
      limited,
    ]);
    for (let i = 1; i < calls.length; i++)
      expect(calls[i].at - calls[i - 1].at).toBeGreaterThanOrEqual(990);

    // Successful and unrated players need no second request on the same day.
    expect((await refreshSipRatings(false)).pending).toBe(3);
    const { rows } = await publicPlayerDirectoryModel(slug);
    expect(rows.find((row) => row.osuId === updated)?.importedRatings).toEqual({
      sip: 4567,
    });
    expect(rows.find((row) => row.osuId === failed)?.importedRatings).toEqual({
      sip: 2920,
    });
    expect(
      rows.find((row) => row.osuId === missing)?.importedRatings,
    ).toBeUndefined();
    expect(
      rows.find((row) => row.osuId === deferred)?.importedRatings,
    ).toBeUndefined();
    expect(rows.some((row) => row.osuId === pending)).toBe(false);
    expect(calls).toHaveLength(4);
  });
});
