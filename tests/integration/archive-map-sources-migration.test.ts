import { readFileSync } from "node:fs";
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
import { closeDb, db } from "../../src/db";
import {
  editionEvents,
  editionRevisions,
  editionState,
  historicalStatistics,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import { publicArchiveStatistics } from "../../src/lib/archive-statistics";
import {
  publicHistoricalArchive,
  type HistoricalArchive,
} from "../../src/lib/historical-archive";
import {
  archiveEditionStates,
  backfillArchiveRelations,
  syncArchiveRelations,
  verifyArchiveRelations,
} from "../../src/lib/archive-relations";
import supplements from "../../src/data/archive-map-supplements.json";

const url = process.env.TEST_DATABASE_URL;
const migration = readFileSync("drizzle/0084_archive_original_ids.sql", "utf8");
const targets = Object.entries(supplements).flatMap(([slug, entries]) =>
  entries
    .filter((m) => m.source.endsWith("/issues/852"))
    .map((m) => ({ slug, ...m })),
);
function archive(slug: string): HistoricalArchive {
  const value = structuredClone(statisticsArchive);
  value.editionSlug = slug;
  const template = value.pools[0];
  for (const target of targets.filter((t) => t.slug === slug)) {
    let pool = value.pools.find((p) => p.id === target.poolId);
    if (!pool)
      value.pools.push((pool = { ...template, id: target.poolId, maps: [] }));
    pool.maps.push({
      ...template.maps[0],
      slot: target.slot,
      beatmapId: target.beatmapId,
    });
  }
  // Same slot/BID in a different pool must remain untouched.
  const first = targets.find((t) => t.slug === slug)!;
  value.pools.push({
    ...template,
    id: "unrelated",
    maps: [
      { ...template.maps[0], slot: first.slot, beatmapId: first.beatmapId },
    ],
  });
  return value;
}
async function states() {
  return db().select().from(editionState).orderBy(editionState.slug);
}
const apply = () => db().execute(sql.raw(migration));

describe.skipIf(!url)("#852 original-map data migration", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions(
      ["s5", "s10"].map((slug) => ({
        ...edition,
        slug,
        status: "completed",
        registration: null,
        published: true,
        archive: archive(slug),
      })),
    );
    for (const state of await states()) {
      const snapshot = {
        archiveKey: statisticsArchiveKey(state.configuration!.archive!),
        source: statisticsSource(),
        poolId: "final",
        included: [1, 2],
      };
      await db()
        .insert(historicalStatistics)
        .values({
          editionSlug: state.slug,
          fixtureId: "one",
          mpId: 999177,
          version: 3,
          draft: snapshot,
          published: snapshot,
          publishedAt: new Date("2026-01-01T00:00:00Z"),
        });
      await db().transaction((tx) => syncArchiveRelations(tx, state.slug));
    }
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("writes all five IDs, retains raw history/statistics/publication, and safely reads before and after normalization", async () => {
    const before = await states();
    const statistics = await db().select().from(historicalStatistics);
    const plays = await publicArchiveStatistics("s10", "one");
    await apply();
    const after = await states();
    for (const state of after) {
      const prior = before.find((s) => s.slug === state.slug)!;
      const expected = structuredClone(prior.configuration!);
      for (const target of targets.filter((t) => t.slug === state.slug)) {
        const map = expected
          .archive!.pools.find((p) => p.id === target.poolId)!
          .maps.find((m) => m.slot === target.slot)!;
        map.originalId = target.originalId;
      }
      const actual = structuredClone(state.configuration!);
      expect(actual).toEqual(expected);
      expect(state.configurationVersion).toBe(1);
      expect(statisticsArchiveKey(state.configuration!.archive!)).toBe(
        statisticsArchiveKey(prior.configuration!.archive!),
      );
      const [read] = await archiveEditionStates(db(), true, state.slug);
      const maps = publicHistoricalArchive(
        read.configuration!.archive!,
      ).pools.flatMap((p) => p.maps);
      for (const target of targets.filter((t) => t.slug === state.slug))
        expect(
          maps.find((m) => m.beatmapId === target.beatmapId),
        ).toMatchObject({ originalId: target.originalId });
      await backfillArchiveRelations(state.slug, true);
      expect(await verifyArchiveRelations(db(), state.slug)).toMatchObject({
        documents: 3,
      });
      const [normalized] = await archiveEditionStates(db(), true, state.slug);
      expect(normalized.configuration!.archive!.pools).toEqual(
        expected.archive!.pools,
      );
      const old = await db()
        .select()
        .from(editionRevisions)
        .where(eq(editionRevisions.editionSlug, state.slug));
      expect(old.find((r) => r.version === 0)!.configuration).toEqual(
        prior.configuration,
      );
      expect(old.find((r) => r.version === 1)!.configuration).toEqual(
        state.configuration,
      );
    }
    expect(await db().select().from(historicalStatistics)).toEqual(statistics);
    const updated = await publicArchiveStatistics("s10", "one");
    expect(updated.plays).toEqual(plays.plays);
    expect(updated.fixtures).toEqual(plays.fixtures);
    expect(updated.publishedAt).toBe(plays.publishedAt);
    const events = await db().select().from(editionEvents);
    expect(events).toHaveLength(2);
    expect(events.flatMap((e) => e.detail.changes as unknown[])).toHaveLength(
      5,
    );
    await apply();
    expect(await states()).toEqual(after);
    expect(await db().select().from(editionEvents)).toEqual(events);
  });
  it("rolls back both editions when an explicit original conflicts", async () => {
    await db().execute(
      sql`UPDATE edition_state SET configuration=jsonb_set(configuration,'{archive,pools,1,maps,0,originalId}','42'::jsonb) WHERE slug='s5'`,
    );
    const before = await states();
    await expect(apply()).rejects.toThrow();
    expect(await states()).toEqual(before);
    expect(await db().select().from(editionEvents)).toHaveLength(0);
    expect(await db().select().from(editionRevisions)).toHaveLength(2);
  });
  it("rejects duplicate targets atomically and leaves other seasons alone", async () => {
    await db().execute(
      sql`UPDATE edition_state SET configuration=jsonb_set(configuration,'{archive,pools,1,maps}',(configuration#>'{archive,pools,1,maps}') || (configuration#>'{archive,pools,1,maps}')) WHERE slug='s5'`,
    );
    const before = await states();
    await expect(apply()).rejects.toThrow();
    expect(await states()).toEqual(before);
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        status: "completed",
        registration: null,
        archive: { ...archive("s5"), editionSlug: "s7" },
      },
    ]);
    const other = await states();
    await apply();
    expect(await states()).toEqual(other);
  });
});
