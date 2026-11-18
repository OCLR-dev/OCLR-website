import { db, closeDb } from "../../src/db";
import {
  editionEvents,
  editionState,
  etxRatingCache,
  importedPlayerRatings,
  registrations,
  sipRatingCache,
  users,
} from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { publishedPlayerProfile } from "../../src/lib/player-profiles";
import { oclrProfileSchema } from "../../src/lib/read-api-contract";
import { readApiRoute } from "../../src/lib/read-api";
import { importPlayerRatings } from "../../src/lib/player-rating-import";
import { publicPlayerDirectoryModel } from "../../src/lib/public-read-models";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

vi.mock("server-only", () => ({}));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 90201, username: "Synthetic Admin" };
const player = { osuId: 90202, username: "Synthetic Player" };
const pending = { osuId: 90203, username: "Synthetic Pending" };
const same = { osuId: 90204, username: "Synthetic Duplicate" };
const slug = "s11";

describe.skipIf(!url)("S11 imported player ratings", () => {
  beforeEach(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", "https://oclr.example.test");
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([{ ...edition, slug }, edition]);
    await db().insert(users).values([admin, player, pending, same]);
    await db()
      .insert(registrations)
      .values(
        [player, pending, same].map((user) => ({
          editionSlug: slug,
          userId: user.osuId,
          status:
            user === pending ? ("pending" as const) : ("accepted" as const),
          rulesVersion: "test-v1",
          answers: {},
        })),
      );
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("requires current public participation, and separately a published accepted S11 match for CSV", async () => {
    const read = async (id: number, include = true) =>
      oclrProfileSchema.parse(
        await publishedPlayerProfile(
          String(id),
          "osu",
          undefined,
          id,
          true,
          undefined,
          undefined,
          include,
        ),
      );
    for (const userId of [player.osuId, pending.osuId]) {
      await db()
        .insert(importedPlayerRatings)
        .values([
          { editionSlug: slug, userId, source: "sip", value: -31 },
          {
            editionSlug: slug,
            userId,
            source: "etx",
            value: 0,
            provisional: true,
          },
        ]);
    }
    const fetchedAt = new Date("2025-01-01T00:00:00.000Z");
    await db()
      .insert(sipRatingCache)
      .values({ osuId: pending.osuId, value: 0, fetchedAt });
    const published = await read(player.osuId);
    expect(published.snapshot).toBeNull();
    expect(published.ratings).toMatchObject({
      sip: { api: null, csv: { value: -31, importedAt: null } },
      etx: { value: 0, provisional: true, mods: null, importedAt: null },
    });
    const url = `https://oclr.example.test/api/v1/players/${player.osuId}/oclr-profile`;
    const wire = await readApiRoute(new Request(url + "?ratings=1"));
    expect(wire.status).toBe(200);
    expect(oclrProfileSchema.parse((await wire.json()).data).ratings).toEqual(
      published.ratings,
    );
    await db()
      .insert(etxRatingCache)
      .values(
        [player, pending].map(({ osuId }) => ({
          osuId,
          attemptedOn: "2025-01-01",
          fetchedAt,
          rating: { value: 5.125, provisional: false, outdated: true },
        })),
      );
    const providerRating = {
      value: 5.125,
      provisional: false,
      outdated: true,
      importedAt: fetchedAt.toISOString(),
      mods: null,
    };
    expect((await read(player.osuId)).ratings?.etx).toEqual(providerRating);
    const apiProviderRating = await readApiRoute(
      new Request(url + "?ratings=1"),
    );
    expect(
      oclrProfileSchema.parse((await apiProviderRating.json()).data).ratings
        ?.etx,
    ).toEqual(providerRating);
    await db()
      .update(etxRatingCache)
      .set({ rating: null })
      .where(eq(etxRatingCache.osuId, player.osuId));
    expect((await read(player.osuId)).ratings?.etx).toBeNull();
    const legacy = await readApiRoute(new Request(url));
    expect(legacy.status).toBe(200);
    expect((await legacy.json()).data).not.toHaveProperty("ratings");
    expect(
      (await readApiRoute(new Request(url + "?ratings=invalid"))).status,
    ).toBe(400);
    expect(await read(player.osuId, false)).not.toHaveProperty("ratings");
    expect(await read(pending.osuId)).not.toHaveProperty("ratings");
    await db()
      .insert(registrations)
      .values(
        [player, pending].map(({ osuId }) => ({
          editionSlug: edition.slug,
          userId: osuId,
          status: "accepted" as const,
          rulesVersion: "test-v1",
          answers: {},
        })),
      );
    // Public elsewhere: API ratings are current player metrics; the pending S11
    // application and even already-existing S11 import rows grant nothing.
    expect((await read(pending.osuId)).ratings).toMatchObject({
      sip: {
        api: { value: 0, fetchedAt: fetchedAt.toISOString(), snapshot: null },
        csv: null,
      },
      etx: providerRating,
    });
    await db()
      .update(editionState)
      .set({ configuration: { ...edition, published: false } })
      .where(eq(editionState.slug, slug));
    expect((await read(player.osuId)).ratings).toMatchObject({
      sip: { api: null, csv: null },
      etx: null,
    });
  });

  it("merges only supplied mod columns and timestamps only observed ratings", async () => {
    const load = (columns: string, line: string) =>
      importPlayerRatings(admin, slug, {
        source: "etx",
        csv: `osuUserId,duelRating${columns}\n${player.osuId},${line}`,
      });
    const saved = async (userId: number) =>
      (
        await db()
          .select()
          .from(importedPlayerRatings)
          .where(eq(importedPlayerRatings.userId, userId))
      )[0];
    await db().insert(importedPlayerRatings).values({
      editionSlug: slug,
      source: "etx",
      userId: same.osuId,
      value: 5,
    });
    const start = Date.now();
    await load(
      ",noModDuelStarRating,hiddenDuelStarRating,hardRockDuelStarRating,doubleTimeDuelStarRating,freeModDuelStarRating,duelProvisional,duelOutdated",
      "6.123456789,0,2.5,3,4.5,5,true,false",
    );
    const mods = { NM: 0, HD: 2.5, HR: 3, DT: 4.5, FM: 5 };
    expect(await saved(player.osuId)).toMatchObject({
      value: 6.123456789,
      etxMods: mods,
      provisional: true,
      outdated: false,
    });
    expect(
      (await saved(player.osuId)).importedAt!.getTime(),
    ).toBeGreaterThanOrEqual(start);
    await load("", "6.2");
    expect((await saved(player.osuId)).etxMods).toEqual(mods);
    await load(",hiddenDuelStarRating,doubleTimeDuelStarRating", "6.2,,NaN");
    const final = await saved(player.osuId);
    expect(final.etxMods).toEqual({ NM: 0, HR: 3, FM: 5 });
    await expect(
      load(",freeModDuelStarRating", `6.2,0\n${player.osuId},6.2,`),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      load(",freeModDuelStarRating", "6.2,-2"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(load("", `NaN\n${player.osuId},5`)).rejects.toMatchObject({
      status: 400,
    });
    await expect(load("", "6.2\n01,6")).rejects.toMatchObject({ status: 400 });
    expect(await saved(player.osuId)).toEqual(final);
    expect(await saved(same.osuId)).toMatchObject({
      value: 5,
      importedAt: null,
      etxMods: null,
    });
  });

  it("publishes only matched accepted player scores and audits changes atomically", async () => {
    const etx = {
      source: "etx",
      csv: `osuUserId,duelRating,noModDuelRating,provisional,outdated\n${player.osuId},6.04581216,NaN,1,1\n${same.osuId},NaN,NaN,,\n${pending.osuId},6,6,,`,
    };
    await expect(importPlayerRatings(player, slug, etx)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      importPlayerRatings(admin, edition.slug, etx),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      importPlayerRatings(admin, slug, {
        source: "sip",
        csv: "username,rating",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await importPlayerRatings(admin, slug, etx)).toMatchObject({
      matched: 1,
      updated: 1,
      unmatched: 1,
      unmatchedRows: [4],
      missing: 1,
    });

    expect(await importPlayerRatings(admin, slug, etx)).toMatchObject({
      updated: 0,
    });
    await expect(
      importPlayerRatings(admin, slug, {
        source: "etx",
        csv: `osuUserId,duelRating\n${player.osuId},4\n${player.osuId},5`,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(importedPlayerRatings)).toHaveLength(1);
    expect(
      await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.kind, "player_ratings_import")),
    ).toHaveLength(1);

    const rows = (await publicPlayerDirectoryModel(slug)).rows;
    expect(
      rows.find((row) => row.osuId === player.osuId)?.importedRatings,
    ).toEqual({
      etx: { value: 6.04581216, provisional: true, outdated: true },
    });
    expect(rows.find((row) => row.osuId === pending.osuId)).toBeUndefined();
    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(eq(registrations.userId, player.osuId));
    expect(
      (await publicPlayerDirectoryModel(slug)).rows.some(
        (row) => row.osuId === player.osuId,
      ),
    ).toBe(false);
    await db()
      .update(editionState)
      .set({ configuration: { ...edition, published: false } })
      .where(eq(editionState.slug, slug));
    await expect(publicPlayerDirectoryModel(slug)).rejects.toMatchObject({
      status: 404,
    });
  });
});
