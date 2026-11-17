import { db, closeDb } from "../../src/db";
import {
  editionEvents,
  editionState,
  importedPlayerRatings,
  registrations,
  users,
} from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importPlayerRatings } from "../../src/lib/player-rating-import";
import { publicPlayerDirectoryModel } from "../../src/lib/public-read-models";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 90201, username: "Synthetic Admin" };
const player = { osuId: 90202, username: "Synthetic Player" };
const pending = { osuId: 90203, username: "Synthetic Pending" };
const same = { osuId: 90204, username: "Synthetic Duplicate" };
const slug = "s11";

describe.skipIf(!url)("S11 imported player ratings", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
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
