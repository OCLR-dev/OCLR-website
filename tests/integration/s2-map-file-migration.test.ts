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
  archiveEditionStates,
  backfillArchiveRelations,
  syncArchiveRelations,
  verifyArchiveRelations,
} from "../../src/lib/archive-relations";
import { publicHistoricalArchive } from "../../src/lib/historical-archive";
import file from "../../src/data/archive-file-supplements.json";

const url = process.env.TEST_DATABASE_URL;
const entry = file.s2[0];
const migration = readFileSync("drizzle/0089_s2_nm2_file_recovery.sql", "utf8");
const recover = () =>
  db().execute(sql.raw(migration.slice(migration.indexOf("DO $$"))));
async function state() {
  const [saved] = await db()
    .select()
    .from(editionState)
    .where(eq(editionState.slug, "s2"));
  return saved;
}
function archive() {
  const a = structuredClone(statisticsArchive);
  a.editionSlug = "s2";
  a.formatVersion = 2;
  a.pools.push({
    ...a.pools[0],
    id: "captain-qualifier",
    maps: [
      {
        ...a.pools[0].maps[0],
        slot: "NM2",
        beatmapId: 1009329,
        title: null,
        mapper: "#N/A",
        stars: null,
        bpm: null,
        drainSeconds: null,
        cs: null,
        ar: null,
        od: null,
      },
    ],
  });
  a.pools.push({ ...a.pools[1], id: "other" });
  return a;
}
describe.skipIf(!url)("S2 exact-file database recovery", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const a = archive();
    await seedEditions([
      {
        ...edition,
        slug: "s2",
        status: "completed",
        registration: null,
        published: true,
        archive: a,
      },
    ]);
    const snapshot = {
      archiveKey: statisticsArchiveKey(a),
      source: statisticsSource(),
      poolId: "final",
      included: [1, 2],
    };
    await db()
      .insert(historicalStatistics)
      .values({
        editionSlug: "s2",
        fixtureId: "one",
        mpId: 999177,
        version: 3,
        draft: snapshot,
        published: snapshot,
        publishedAt: new Date("2026-01-01T00:00:00Z"),
      });
    await db().transaction((tx) => syncArchiveRelations(tx, "s2"));
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("persists the cover/set/missing attributes, retains history and statistics, and roundtrips public/typed reads", async () => {
    const before = await state();
    const statistics = await db().select().from(historicalStatistics);
    const released = await publicArchiveStatistics("s2", "one");
    await recover();
    const after = await state();
    const expected = structuredClone(before.configuration!);
    const map = expected.archive!.pools[1].maps[0];
    Object.assign(map, {
      ...entry.attributes,
      sourceTitle: null,
      cs: 4,
      ar: 9.3,
      od: 8.3,
      beatmapSetId: 403096,
      coverPath: entry.coverPath,
    });
    expect(after.configuration).toEqual(expected);
    expect(after.configurationVersion).toBe(1);
    expect(statisticsArchiveKey(expected.archive!)).toBe(
      statisticsArchiveKey(before.configuration!.archive!),
    );
    const [read] = await archiveEditionStates(db(), true, "s2");
    expect(
      publicHistoricalArchive(read.configuration!.archive!).pools[1].maps[0],
    ).toMatchObject({
      ...entry.attributes,
      sourceTitle: null,
      coverPath: entry.coverPath,
      beatmapSetId: 403096,
    });
    await backfillArchiveRelations("s2", true);
    expect(await verifyArchiveRelations(db(), "s2")).toMatchObject({
      documents: 3,
    });
    const [typed] = await archiveEditionStates(db(), true, "s2");
    expect(typed.configuration!.archive).toEqual(expected.archive);
    expect(await db().select().from(historicalStatistics)).toEqual(statistics);
    const updated = await publicArchiveStatistics("s2", "one");
    expect(updated.plays).toEqual(released.plays);
    expect(updated.fixtures).toEqual(released.fixtures);
    expect(updated.publishedAt).toBe(released.publishedAt);
    const revisions = await db().select().from(editionRevisions);
    expect(revisions.find((r) => r.version === 0)!.configuration).toEqual(
      before.configuration,
    );
    expect(revisions.find((r) => r.version === 1)!.configuration).toEqual(
      expected,
    );
    expect(await db().select().from(editionEvents)).toMatchObject([
      {
        kind: "archive_map_file_recovery",
        detail: { beatmapMd5: entry.beatmapMd5 },
      },
    ]);
    await recover();
    expect(await state()).toEqual(after);
    expect(await db().select().from(editionEvents)).toHaveLength(1);
  });
  it("preserves nonempty text, original title, non-null metrics and the download mirror", async () => {
    const before = await state();
    const config = structuredClone(before.configuration!);
    Object.assign(config.archive!.pools[1].maps[0], {
      title: "Historical title",
      mapper: "Historical mapper",
      stars: 0,
      cs: 0,
      ar: 8,
      hp: 0,
      downloadMirror: "https://example.com/original.osz",
    });
    await db()
      .update(editionState)
      .set({ configuration: config })
      .where(eq(editionState.slug, "s2"));
    const key = statisticsArchiveKey(config.archive!);
    await recover();
    const after = await state();
    expect(after.configuration!.archive!.pools[1].maps[0]).toMatchObject({
      title: "Historical title",
      mapper: "Historical mapper",
      stars: 0,
      cs: 0,
      ar: 8,
      od: 8.3,
      hp: 0,
      downloadMirror: "https://example.com/original.osz",
    });
    expect(
      after.configuration!.archive!.pools[1].maps[0].sourceTitle,
    ).toBeUndefined();
    expect(statisticsArchiveKey(after.configuration!.archive!)).toBe(key);
  });
  it("retains formula errors and blanks verbatim as the original statistics title", async () => {
    for (const title of ["#N/A", "", "  "]) {
      const config = (await state()).configuration!;
      config.archive!.pools[1].maps[0].title = title;
      delete config.archive!.pools[1].maps[0].sourceTitle;
      await db()
        .update(editionState)
        .set({ configuration: config })
        .where(eq(editionState.slug, "s2"));
      const key = statisticsArchiveKey(config.archive!);
      await recover();
      const after = (await state()).configuration!;
      expect(after.archive!.pools[1].maps[0]).toMatchObject({
        title: entry.attributes.title,
        sourceTitle: title,
      });
      expect(statisticsArchiveKey(after.archive!)).toBe(key);
    }
  });
  it("rolls back conflicting artwork and duplicate targets, and does not patch another BID", async () => {
    for (const change of [
      sql`UPDATE edition_state SET configuration=jsonb_set(configuration,'{archive,pools,1,maps,0,beatmapSetId}','42') WHERE slug='s2'`,
      sql`UPDATE edition_state SET configuration=jsonb_set(configuration,'{archive,pools,1,maps}',(configuration#>'{archive,pools,1,maps}') || (configuration#>'{archive,pools,1,maps}')) WHERE slug='s2'`,
    ]) {
      await db()
        .update(editionState)
        .set({
          configuration: {
            ...edition,
            status: "completed",
            registration: null,
            archive: archive(),
          },
        })
        .where(eq(editionState.slug, "s2"));
      await db().execute(change);
      const before = await state();
      await expect(recover()).rejects.toThrow();
      expect(await state()).toEqual(before);
      expect(await db().select().from(editionEvents)).toHaveLength(0);
    }
    await db()
      .update(editionState)
      .set({
        configuration: {
          ...edition,
          status: "completed",
          registration: null,
          archive: archive(),
        },
      })
      .where(eq(editionState.slug, "s2"));
    await db().execute(
      sql`UPDATE edition_state SET configuration=jsonb_set(configuration,'{archive,pools,1,maps,0,beatmapId}','42') WHERE slug='s2'`,
    );
    const before = await state();
    await recover();
    expect(await state()).toEqual(before);
  });
});
