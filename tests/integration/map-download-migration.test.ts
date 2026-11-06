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
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { statisticsArchive } from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import {
  archiveEditionStates,
  backfillArchiveRelations,
  syncArchiveRelations,
  verifyArchiveRelations,
} from "../../src/lib/archive-relations";
import downloads from "../../src/data/archive-map-downloads.json";

const url = process.env.TEST_DATABASE_URL;
const migration = readFileSync(
  "drizzle/0086_mappool_download_mirrors.sql",
  "utf8",
);
const apply = () =>
  db().execute(sql.raw(migration.slice(migration.indexOf("DO $$"))));
const states = () =>
  db().select().from(editionState).orderBy(editionState.slug);

describe.skipIf(!url)("official OSZ download mirror migration", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions(
      downloads.map((target) => {
        const archive = structuredClone(statisticsArchive);
        archive.editionSlug = target.editionSlug;
        archive.pools.push({
          ...archive.pools[0],
          id: target.poolId,
          maps: [
            {
              ...archive.pools[0].maps[0],
              slot: target.slot,
              beatmapId: target.beatmapId,
            },
          ],
        });
        return {
          ...edition,
          slug: target.editionSlug,
          status: "completed" as const,
          registration: null,
          published: true,
          archive,
        };
      }),
    );
    for (const target of downloads)
      await db().transaction((tx) =>
        syncArchiveRelations(tx, target.editionSlug),
      );
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("writes both mirrors with provenance/history, roundtrips typed reads and is idempotent", async () => {
    const before = await states();
    await apply();
    const after = await states();
    for (const [index, target] of downloads.entries()) {
      const expected = structuredClone(before[index].configuration!);
      expected.archive!.pools[1].maps[0].downloadMirror = target.downloadMirror;
      expect(after[index].configuration).toEqual(expected);
      expect(after[index].configurationVersion).toBe(
        before[index].configurationVersion + 1,
      );
      expect(after[index].poolPublished).toEqual(before[index].poolPublished);
      expect(statisticsArchiveKey(expected.archive!)).toBe(
        statisticsArchiveKey(before[index].configuration!.archive!),
      );
      const [fallback] = await archiveEditionStates(
        db(),
        true,
        target.editionSlug,
      );
      expect(fallback.configuration!.archive).toEqual(expected.archive);
      await backfillArchiveRelations(target.editionSlug, true);
      expect(
        await verifyArchiveRelations(db(), target.editionSlug),
      ).toMatchObject({ documents: 1 });
      const [typed] = await archiveEditionStates(
        db(),
        true,
        target.editionSlug,
      );
      expect(typed.configuration!.archive).toEqual(expected.archive);
      const revisions = await db()
        .select()
        .from(editionRevisions)
        .where(eq(editionRevisions.editionSlug, target.editionSlug));
      expect(revisions.find((r) => r.version === 0)!.configuration).toEqual(
        before[index].configuration,
      );
      const events = await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.editionSlug, target.editionSlug));
      expect(events).toMatchObject([
        {
          kind: "archive_map_download_mirror",
          detail: {
            beatmapId: target.beatmapId,
            packageSha256: target.packageSha256,
            downloadMirror: target.downloadMirror,
          },
        },
      ]);
    }
    const audit = await db().select().from(editionEvents);
    const revisions = await db().select().from(editionRevisions);
    await apply();
    expect(await states()).toEqual(after);
    expect(await db().select().from(editionEvents)).toEqual(audit);
    expect(await db().select().from(editionRevisions)).toEqual(revisions);
  });

  it.each(["conflict", "duplicate"])(
    "rolls back both seasons for a %s in the second target",
    async (kind) => {
      const target = downloads[1];
      const [state] = await db()
        .select()
        .from(editionState)
        .where(eq(editionState.slug, target.editionSlug));
      const configuration = structuredClone(state.configuration!);
      const pool = configuration.archive!.pools[1];
      if (kind === "conflict")
        pool.maps[0].downloadMirror = "https://example.com/other.osz";
      else pool.maps.push({ ...pool.maps[0] });
      await db()
        .update(editionState)
        .set({ configuration })
        .where(eq(editionState.slug, target.editionSlug));
      const before = await states();
      await expect(apply()).rejects.toThrow();
      expect(await states()).toEqual(before);
      expect(await db().select().from(editionEvents)).toEqual([]);
    },
  );
});
