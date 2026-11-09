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
import { archiveEditionStates } from "../../src/lib/archive-relations";
import {
  backfillArchiveRelations,
  verifyArchiveRelations,
} from "../../src/lib/archive-relation-maintenance";
import { syncArchiveRelations } from "../../src/lib/archive-relation-writes";
import backgrounds from "../../src/data/archive-background-supplements.json";

const url = process.env.TEST_DATABASE_URL;
const migration = readFileSync(
  "drizzle/0088_archive_background_alternatives.sql",
  "utf8",
);
const apply = () =>
  db().execute(sql.raw(migration.slice(migration.indexOf("DO $$"))));
const states = () =>
  db().select().from(editionState).orderBy(editionState.slug);
const seasons = [...new Set(backgrounds.map((x) => x.editionSlug))].sort();
describe.skipIf(!url)("historical background alternative migration", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions(
      seasons.map((slug) => {
        const archive = structuredClone(statisticsArchive);
        archive.editionSlug = slug;
        for (const target of backgrounds.filter(
          (x) => x.editionSlug === slug,
        )) {
          let pool = archive.pools.find((p) => p.id === target.poolId);
          if (!pool) {
            pool = { ...archive.pools[0], id: target.poolId, maps: [] };
            archive.pools.push(pool);
          }
          pool.maps.push({
            ...statisticsArchive.pools[0].maps[0],
            slot: target.slot,
            beatmapId: target.beatmapId,
            originalId: 17,
            beatmapSetId: target.originalSetId,
            downloadMirror: "https://example.com/reviewed.osz",
          });
        }
        return {
          ...edition,
          slug,
          status: "completed" as const,
          registration: null,
          published: true,
          archive,
        };
      }),
    );
    for (const slug of seasons)
      await db().transaction((tx) => syncArchiveRelations(tx, slug));
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("persists all eight alternatives in one revision per season, preserves source identity/history and verifies typed reads idempotently", async () => {
    const before = await states();
    await apply();
    const after = await states();
    for (const [i, slug] of seasons.entries()) {
      const expected = structuredClone(before[i].configuration!);
      for (const target of backgrounds.filter((x) => x.editionSlug === slug)) {
        const row = expected
          .archive!.pools.find((p) => p.id === target.poolId)!
          .maps.find((m) => m.slot === target.slot)!;
        row.backgroundSetId = target.backgroundSetId;
      }
      expect(after[i].configuration).toEqual(expected);
      expect(after[i].configurationVersion).toBe(
        before[i].configurationVersion + 1,
      );
      expect(after[i].poolPublished).toBe(before[i].poolPublished);
      expect(statisticsArchiveKey(expected.archive!)).toBe(
        statisticsArchiveKey(before[i].configuration!.archive!),
      );
      const [fallback] = await archiveEditionStates(db(), true, slug);
      expect(fallback.configuration!.archive).toEqual(expected.archive);
      await backfillArchiveRelations(slug, true);
      expect(await verifyArchiveRelations(db(), slug)).toMatchObject({
        documents: 1,
      });
      const [typed] = await archiveEditionStates(db(), true, slug);
      expect(typed.configuration!.archive).toEqual(expected.archive);
      const revisions = await db()
        .select()
        .from(editionRevisions)
        .where(eq(editionRevisions.editionSlug, slug));
      expect(revisions.find((r) => r.version === 0)!.configuration).toEqual(
        before[i].configuration,
      );
      const events = await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.editionSlug, slug));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "archive_background_alternatives",
        detail: {
          alternatives: backgrounds.filter((x) => x.editionSlug === slug),
        },
      });
    }
    const events = await db().select().from(editionEvents);
    const revisions = await db().select().from(editionRevisions);
    await apply();
    expect(await states()).toEqual(after);
    expect(await db().select().from(editionEvents)).toEqual(events);
    expect(await db().select().from(editionRevisions)).toEqual(revisions);
  });
  it("ignores a lookalike edition anchor whose archive belongs to another season", async () => {
    await db().execute(
      sql`UPDATE edition_state SET configuration=jsonb_set(configuration,'{archive,editionSlug}','"s10"') WHERE slug='s9'`,
    );
    const before = (await states()).find((s) => s.slug === "s9");
    await apply();
    expect((await states()).find((s) => s.slug === "s9")).toEqual(before);
    expect(
      await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.editionSlug, "s9")),
    ).toEqual([]);
  });
  it.each(["conflict", "duplicate"])(
    "rolls back all five seasons on a %s in the final season",
    async (kind) => {
      const slug = seasons.at(-1)!;
      const target = backgrounds.find((x) => x.editionSlug === slug)!;
      const [state] = await db()
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug));
      const configuration = structuredClone(state.configuration!);
      const pool = configuration.archive!.pools.find(
        (p) => p.id === target.poolId,
      )!;
      const row = pool.maps.find((m) => m.slot === target.slot)!;
      if (kind === "conflict") row.backgroundSetId = 42;
      else pool.maps.push({ ...row });
      await db()
        .update(editionState)
        .set({ configuration })
        .where(eq(editionState.slug, slug));
      const before = await states();
      await expect(apply()).rejects.toThrow();
      expect(await states()).toEqual(before);
      expect(await db().select().from(editionEvents)).toEqual([]);
    },
  );
});
