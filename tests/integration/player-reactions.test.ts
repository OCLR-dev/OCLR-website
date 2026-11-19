import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { editionEvents, registrations, users } from "../../src/db/schema";
import {
  playerReactionDirectory,
  setPlayerReaction,
} from "../../src/lib/tournament-player-reactions";
import { withReadChannel } from "../../src/lib/read-channel";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

const url = process.env.TEST_DATABASE_URL;
const [first, second, target, pending] = [119301, 119302, 119303, 119304];
const secondEdition = "player-reactions-other-test";
const privateEdition = "player-reactions-private-test";
const add = { id: "qq-13", selected: true };
const remove = { ...add, selected: false };

describe.skipIf(!url)("saved tournament player reactions", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url);
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([
      edition,
      { ...edition, slug: secondEdition },
      { ...edition, slug: privateEdition, published: false },
    ]);
    await db()
      .insert(users)
      .values(
        [first, second, target, pending].map((osuId) => ({
          osuId,
          username: `Synthetic User ${osuId}`,
        })),
      );
    await db()
      .insert(registrations)
      .values([
        ...[edition.slug, secondEdition, privateEdition].map((editionSlug) => ({
          editionSlug,
          userId: target,
          status: "accepted" as const,
          configurationVersion: 0,
          answers: {},
        })),
        {
          editionSlug: edition.slug,
          userId: pending,
          status: "pending",
          configurationVersion: 0,
          answers: {},
        },
      ]);
  });

  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("serializes concurrent writes and counts each account once", async () => {
    const writes = await Promise.all([
      setPlayerReaction(first, edition.slug, target, add),
      setPlayerReaction(first, edition.slug, target, add),
      setPlayerReaction(second, edition.slug, target, add),
    ]);
    expect(writes.map(([row]) => row.count).sort()).toEqual(
      expect.arrayContaining([1, 2]),
    );
    expect(writes.flat().every((row) => row.selected)).toBe(true);
    expect(await playerReactionDirectory(edition.slug)).toEqual({
      [target]: [{ ...add, count: 2, selected: false }],
    });
    expect(await playerReactionDirectory(secondEdition)).toEqual({});

    const remaining = [{ ...remove, count: 1 }];
    expect(
      await setPlayerReaction(first, edition.slug, target, remove),
    ).toEqual(remaining);
    expect(
      await setPlayerReaction(first, edition.slug, target, remove),
    ).toEqual(remaining);
    expect(await playerReactionDirectory(edition.slug, second)).toEqual({
      [target]: [{ ...add, count: 1 }],
    });
    const events = await db()
      .select({ actorId: editionEvents.actorId })
      .from(editionEvents)
      .where(eq(editionEvents.kind, "player_reaction_changed"));
    expect(events.map(({ actorId }) => actorId).sort()).toEqual([
      first,
      first,
      second,
    ]);
  });

  it("protects catalog validity, publication, registration and the read-only channel", async () => {
    await expect(
      setPlayerReaction(first, edition.slug, target, { ...add, id: "invalid" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      setPlayerReaction(first, edition.slug, target, { ...add, id: "osu-NM" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      setPlayerReaction(first, edition.slug, pending, add),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      setPlayerReaction(first, privateEdition, target, add),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withReadChannel(() =>
        setPlayerReaction(first, edition.slug, target, add),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await setPlayerReaction(first, secondEdition, target, add);
    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(eq(registrations.editionSlug, secondEdition));
    expect(await playerReactionDirectory(secondEdition, first)).toEqual({});
    await expect(
      setPlayerReaction(first, secondEdition, target, remove),
    ).rejects.toMatchObject({ status: 404 });
  });
});
