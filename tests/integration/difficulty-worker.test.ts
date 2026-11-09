import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db, getPool } from "../../src/db";
import {
  beatmapDifficultySnapshots,
  editionState,
  mappoolEntries,
  mappools,
  tournamentRounds,
  tournamentStages,
} from "../../src/db/schema";
import { displayDifficulty } from "../../src/lib/difficulty-display";
import { refreshBeatmapDifficulties } from "../../src/lib/difficulty-worker";
import { HttpError } from "../../src/lib/http";
import { publicMappools } from "../../src/lib/mappool-reads";
import { osuApi } from "../../src/lib/osu-api";
import { readApiRoute } from "../../src/lib/read-api";
import { withReadChannel } from "../../src/lib/read-channel";
import { attachArchiveDifficulties } from "../../src/lib/saved-difficulty";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { historicalArchive } from "../fixtures/historical-archive";

vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
const api = vi.mocked(osuApi);
const url = process.env.TEST_DATABASE_URL;
const checksum = "a".repeat(32);
const values = {
  stars: 5,
  bpm: 180,
  duration: 120,
  ar: 9,
  od: 8,
  cs: 4,
  hp: 6,
};

function archiveEdition(slug: string, beatmapId: number, published = true) {
  const archive = structuredClone(historicalArchive);
  archive.editionSlug = slug;
  Object.assign(archive.pools[0].maps[0], { slot: "DT1", beatmapId });
  return {
    ...edition,
    slug,
    published,
    status: "completed",
    registration: null,
    archive,
  };
}

function officialBeatmap(path: string) {
  return {
    id: Number(path.split("/").at(-1)),
    beatmapset_id: 1,
    version: "Synthetic",
    difficulty_rating: 5,
    bpm: 180,
    total_length: 120,
    mode: "osu",
    checksum,
    ar: 9,
    accuracy: 8,
    cs: 4,
    drain: 6,
    beatmapset: {
      title: "Synthetic",
      artist: "Synthetic",
      creator: "Synthetic",
    },
  };
}

describe.skipIf(!url)("background official mappool difficulty", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", "https://oclr.example.test");
    vi.stubEnv("OCLR_DATA_SOURCE", "database");
  });
  beforeEach(async () => {
    await db().execute(
      sql`TRUNCATE edition_state, beatmap_difficulty_snapshots CASCADE`,
    );
    api.mockReset();
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("deduplicates published maps, saves provider results and serves both public read paths", async () => {
    await seedEditions([
      edition,
      archiveEdition("history-test", 51001),
      archiveEdition("hidden-test", 51004, false),
    ]);
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: edition.slug, kind: "group" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: edition.slug,
        stageId: stage.id,
        name: "Synthetic round",
        position: 1,
      })
      .returning();
    const [published, draft] = await db()
      .insert(mappools)
      .values([
        {
          editionSlug: edition.slug,
          roundId: round.id,
          name: "Published pool",
          publishedAt: new Date(),
          lockedAt: new Date(),
        },
        { editionSlug: edition.slug, roundId: round.id, name: "Draft pool" },
      ])
      .returning();
    const metadata = {
      setId: 1,
      title: "Synthetic",
      artist: "Synthetic",
      difficulty: "Synthetic",
      mapper: "Synthetic",
      mode: "osu" as const,
      checksum,
      ...values,
    };
    await db()
      .insert(mappoolEntries)
      .values([
        {
          poolId: published.id,
          category: "FM",
          position: 1,
          beatmapId: 51001,
          metadata,
        },
        {
          poolId: published.id,
          category: "HD",
          position: 1,
          beatmapId: 51002,
          metadata: { ...metadata, checksum: "b".repeat(32) },
        },
        {
          poolId: draft.id,
          category: "DT",
          position: 1,
          beatmapId: 51003,
          metadata,
        },
      ]);
    const source = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, "history-test"));
    expect(await refreshBeatmapDifficulties()).toMatchObject({
      tracked: 2,
      pending: 2,
      saved: 0,
    });
    expect(
      (await publicMappools(edition.slug))[0].entries.every(
        (entry) => !entry.metadata.difficultySnapshot,
      ),
    ).toBe(true);
    expect(api).not.toHaveBeenCalled();
    await expect(
      withReadChannel(() => refreshBeatmapDifficulties(true)),
    ).rejects.toMatchObject({ status: 403 });

    const lock = await getPool().connect();
    try {
      await lock.query("SELECT pg_advisory_lock(1329810514, 851)");
      expect(await refreshBeatmapDifficulties(true)).toMatchObject({
        status: "busy",
        saved: 0,
      });
    } finally {
      lock.release(true);
    }
    api.mockImplementation(async (path, request) => {
      if (request)
        return {
          attributes: {
            star_rating: request.mods.includes("DT") ? 7.25 : 6.75,
            max_combo: 1000,
          },
        };
      return officialBeatmap(path);
    });
    expect(await refreshBeatmapDifficulties(true)).toMatchObject({
      saved: 2,
      failed: 0,
      pending: 0,
    });
    expect(
      api.mock.calls
        .filter(([, request]) => !request)
        .map(([path]) => path)
        .sort(),
    ).toEqual(["/beatmaps/51001", "/beatmaps/51002"]);
    expect(
      api.mock.calls
        .filter(([path]) => path === "/beatmaps/51001/attributes")
        .map(([, request]) => request?.mods[0])
        .sort(),
    ).toEqual(["DT", "EZ", "HD", "HR"]);
    api.mockClear();

    const native = await readApiRoute(
      new Request(
        `https://oclr.example.test/api/v1/tournaments/${edition.slug}/mappools`,
      ),
    );
    expect(native.status).toBe(200);
    const [pool] = (await native.json()).data;
    expect(
      pool.entries.find(
        (entry: { beatmapId: number }) => entry.beatmapId === 51001,
      ).metadata.difficultySnapshot.variants.HR.stars,
    ).toBe(6.75);
    expect(
      pool.entries.find(
        (entry: { beatmapId: number }) => entry.beatmapId === 51002,
      ).metadata.difficultySnapshot,
    ).toBeUndefined();
    const historical = await readApiRoute(
      new Request(
        "https://oclr.example.test/api/v1/tournaments/history-test/configuration",
      ),
    );
    expect(historical.status).toBe(200);
    const [map] = (await historical.json()).data.edition.archive.pools[0].maps;
    expect(map.stars).toBe(5.5);
    const input = {
      beatmapId: 51001,
      category: "DT",
      historical: true,
      base: values,
      snapshot: map.difficultySnapshot,
    };
    expect(
      displayDifficulty(input, { adjusted: false, fm: "" }).values,
    ).toMatchObject({ stars: 5, bpm: 180 });
    expect(
      displayDifficulty(input, { adjusted: true, fm: "" }).values,
    ).toMatchObject({ stars: 7.25, bpm: 270 });
    expect(await refreshBeatmapDifficulties(true)).toMatchObject({
      status: "current",
      saved: 0,
    });
    expect(api).not.toHaveBeenCalled();
    expect(
      await db()
        .select()
        .from(editionState)
        .where(eq(editionState.slug, "history-test")),
    ).toEqual(source);
    const [locked] = await db()
      .select()
      .from(mappools)
      .where(eq(mappools.id, published.id));
    expect(locked).toEqual(published);
  });

  it("uses a partial daemon snapshot ahead of historical values and retries the missing FM variant", async () => {
    const source = archiveEdition("history-test", 51006);
    const [map] = source.archive.pools[0].maps;
    Object.assign(map, { slot: "FM1" });
    const oldTime = "2025-01-01T00:00:00.000Z";
    Object.assign(map, {
      difficultySnapshot: {
        beatmapId: 51006,
        ruleset: "osu",
        checksum,
        fetchedAt: oldTime,
        base: { ...values, stars: 4 },
        variants: Object.fromEntries(
          ["HD", "HR", "EZ"].map((mod) => [
            mod,
            {
              configuration: mod,
              mods: [mod],
              ruleset: "osu",
              stars: 4,
              maxCombo: null,
              values: {},
              fetchedAt: oldTime,
            },
          ]),
        ),
      },
    });
    await seedEditions([source]);
    api.mockImplementation(async (path, request) => {
      if (!request) return officialBeatmap(path);
      if (request.mods.includes("HR"))
        throw new HttpError(404, "Synthetic missing variant");
      return { attributes: { star_rating: 6.75 } };
    });
    expect(await refreshBeatmapDifficulties(true)).toMatchObject({
      saved: 0,
      failed: 1,
      partial: 1,
      deferred: 1,
    });
    const [result] = (await attachArchiveDifficulties(source.archive)).pools[0]
      .maps;
    expect(result.stars).toBe(5.5);
    const input = {
      beatmapId: 51006,
      category: "FM",
      historical: true,
      base: { ...values, stars: 5.5 },
      snapshot: result.difficultySnapshot,
    };
    expect(displayDifficulty(input, { adjusted: false, fm: "" })).toMatchObject(
      {
        status: "base",
        values: { stars: 5, hp: 6 },
      },
    );
    expect(
      displayDifficulty(input, { adjusted: true, fm: "HR" }),
    ).toMatchObject({
      status: "missing",
      values: { stars: null, ar: 10 },
    });
    expect(
      displayDifficulty(input, { adjusted: true, fm: "EZ" }),
    ).toMatchObject({
      status: "adjusted",
      values: { stars: 6.75, ar: 4.5 },
    });
    api.mockClear();
    api.mockResolvedValue({ attributes: { star_rating: 7.25 } });
    await db().update(beatmapDifficultySnapshots).set({ retryAt: null });
    expect(await refreshBeatmapDifficulties(true)).toMatchObject({
      saved: 1,
      failed: 0,
      partial: 0,
    });
    expect(api.mock.calls).toEqual([
      ["/beatmaps/51006/attributes", { mods: ["HR"], ruleset: "osu" }],
    ]);
    const [saved] = await db().select().from(beatmapDifficultySnapshots);
    expect(saved.snapshot?.variants.HR?.stars).toBe(7.25);
  });

  it("retains the last complete result and defers a rate-limited refresh", async () => {
    await seedEditions([archiveEdition("history-test", 51005)]);
    const fetchedAt = new Date(Date.now() - 8 * 86400000).toISOString();
    const snapshot = {
      beatmapId: 51005,
      ruleset: "osu" as const,
      checksum,
      fetchedAt,
      base: values,
      variants: {
        DT: {
          configuration: "DT" as const,
          mods: ["DT"],
          ruleset: "osu" as const,
          stars: 7.25,
          maxCombo: 1000,
          values: {},
          fetchedAt,
        },
      },
    };
    await db()
      .insert(beatmapDifficultySnapshots)
      .values({ beatmapId: 51005, snapshot });
    api.mockRejectedValueOnce(new HttpError(429, "Synthetic rate limit"));
    expect(await refreshBeatmapDifficulties(true)).toMatchObject({
      saved: 0,
      failed: 1,
      deferred: 1,
    });
    const [saved] = await db().select().from(beatmapDifficultySnapshots);
    expect(saved.snapshot).toEqual(snapshot);
    expect(saved.retryAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await refreshBeatmapDifficulties(true)).toMatchObject({
      saved: 0,
      failed: 0,
      deferred: 1,
    });
    expect(api).toHaveBeenCalledTimes(1);
  });
});
