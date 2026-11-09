import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  archiveRelationDocuments,
  archiveRelationHeads,
  editionState,
  historicalStatistics,
  historicalStatisticsRevisions,
  historicalArchiveSources,
  users,
} from "../../src/db/schema";
import {
  archiveRelArchiveQualifiersRecordsScores,
  archiveRelStatisticsSourceGamesScores,
} from "../../src/db/archive-relational-schema";
import {
  backfillArchiveRelations,
  verifyArchiveRelations,
} from "../../src/lib/archive-relation-maintenance";
import { syncArchiveRelations } from "../../src/lib/archive-relation-writes";
import { normalizedStatistics } from "../../src/lib/archive-relations";
import {
  publicArchiveStatistics,
} from "../../src/lib/archive-statistics-reads";
import {
  readTournament,
  readTournaments,
} from "../../src/lib/tournament-reads";
import { publicPlayer } from "../../src/lib/players";
import { playerMapPerformance } from "../../src/lib/player-map-performance";
import { archiveContentHash } from "../../src/lib/archive-read-model";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import { completeArchive } from "../fixtures/archive-relations";
import { statisticsSource } from "../fixtures/archive-statistics";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { observe, sourceJson } from "../archive-query-observer";

const url = process.env.TEST_DATABASE_URL;
async function seed(slug = "s7") {
  const archive = completeArchive(slug);
  await seedEditions([
    { ...edition, slug, status: "completed", registration: null, archive },
  ]);
  const snapshot = {
    archiveKey: statisticsArchiveKey(archive),
    source: statisticsSource(),
    poolId: "final",
    included: [1, 2],
  };
  await db()
    .insert(historicalStatistics)
    .values({
      editionSlug: slug,
      fixtureId: "one",
      mpId: 999177,
      version: 3,
      draft: snapshot,
      published: snapshot,
      publishedAt: new Date(0),
    });
}
describe.skipIf(!url)("complete historical database relations", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    await seed();
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("normalizes every saved season and retains exact public/private and analysis results", async () => {
    for (let n = 1; n <= 10; n++) if (n !== 7) await seed(`s${n}`);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const jsonbCatalogue = await observe(() => readTournaments(true));
    expect(jsonbCatalogue.sourceArchives).toBe(10);
    const before = {
      public: jsonbCatalogue.value,
      private: await readTournaments(),
      performance: await playerMapPerformance(await publicPlayer(91003)),
    };
    const configurations = await db().select().from(editionState);
    const raw = await db().select().from(historicalStatistics),
      history = await db().select().from(historicalStatisticsRevisions);
    const statistics = await publicArchiveStatistics("s7");
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    for (let n = 1; n <= 10; n++) {
      const slug = `s${n}`,
        preview = await backfillArchiveRelations(slug);
      expect(preview).toMatchObject({
        documents: 3,
        current: 0,
        stale: 3,
        created: 0,
      });
      expect(await backfillArchiveRelations(slug, true)).toMatchObject({
        current: 3,
        stale: 0,
        created: 3,
        archiveReadReady: true,
      });
      expect(await verifyArchiveRelations(db(), slug)).toMatchObject({
        documents: 3,
      });
    }
    expect(await db().select().from(historicalStatistics)).toEqual(raw);
    expect(await db().select().from(editionState)).toEqual(configurations);
    expect(await db().select().from(historicalStatisticsRevisions)).toEqual(
      history,
    );
    expect(await db().select().from(users)).toEqual([]);
    const started = performance.now();
    const catalog = await observe(() => readTournaments(true));
    console.info("archive catalog benchmark", {
      seasons: catalog.value.length,
      queries: catalog.statements.length,
      responseBytes: Buffer.byteLength(JSON.stringify(catalog.value)),
      milliseconds: performance.now() - started,
      sourceArchives: catalog.sourceArchives,
    });
    expect({
      public: catalog.value,
      private: await readTournaments(),
      performance: await playerMapPerformance(await publicPlayer(91003)),
    }).toEqual(before);
    const query = await observe(() => publicArchiveStatistics("s7"));
    expect(query.value).toEqual(statistics);
    expect(sourceJson(query.statements)).toEqual([]);
    expect(
      query.statements.some((s) =>
        s.includes('from "archive_rel_statistics_source_games_scores"'),
      ),
    ).toBe(true);
    // Profile identity/timeline reads enumerate every public season. Their
    // query count must not grow by one query per relation per season.
    expect(catalog.statements.length).toBeLessThanOrEqual(2);
    expect(catalog.sourceArchives).toBe(0);
    const single = await observe(() => readTournament("s7", undefined, true));
    expect(single.value).toEqual(
      before.public.find((r) => r.edition.slug === "s7"),
    );
    expect(single.sourceArchives).toBe(0);
    expect(single.statements.length).toBe(2);
    const detailed = await observe(() => publicArchiveStatistics("s7", "one"));
    expect(sourceJson(detailed.statements)).toEqual([]);
    expect(detailed.value.matchDetails).toHaveLength(1);
    expect(
      (await readTournament("s7"))!.edition.archive!.sourceFacts,
    ).toHaveLength(1);
    expect(
      (await readTournament("s7", undefined, true))!.edition.archive!
        .sourceFacts,
    ).toBeUndefined();
    expect(
      (
        await db().select().from(archiveRelArchiveQualifiersRecordsScores)
      ).every((r) => r.value_score === 0),
    ).toBe(true);
  });
  it("upgrades existing document heads without rebuilding sources and preserves live-season JSONB", async () => {
    await backfillArchiveRelations("s7", true);
    await seedEditions([{ ...edition, slug: "current-test" }]);
    const source = await db().select().from(editionState);
    const documents = await db().select().from(archiveRelationDocuments);
    await db().update(archiveRelationHeads).set({ archiveSourceDigest: null });
    expect(await backfillArchiveRelations("s7")).toMatchObject({
      stale: 0,
      created: 0,
      archiveReadReady: false,
    });
    await expect(verifyArchiveRelations(db(), "s7")).rejects.toMatchObject({
      status: 409,
    });
    const prior = await observe(() => readTournaments());
    expect(prior.sourceArchives).toBe(1);
    expect(
      prior.value.find((r) => r.edition.slug === "current-test")?.edition
        .registration,
    ).toEqual(edition.registration);
    expect(await backfillArchiveRelations("s7", true)).toMatchObject({
      stale: 0,
      created: 0,
      archiveReadReady: true,
    });
    const ready = await observe(() => readTournaments());
    expect(ready.value).toEqual(prior.value);
    expect(ready.sourceArchives).toBe(0);
    expect(await db().select().from(archiveRelationDocuments)).toEqual(
      documents,
    );
    expect(await db().select().from(editionState)).toEqual(source);
    await db()
      .delete(historicalArchiveSources)
      .where(eq(historicalArchiveSources.editionSlug, "s7"));
    expect((await observe(() => readTournament("s7"))).sourceArchives).toBe(1);
    expect(await backfillArchiveRelations("s7")).toMatchObject({
      archiveReadReady: false,
    });
    expect(await backfillArchiveRelations("s7", true)).toMatchObject({
      archiveReadReady: true,
      created: 0,
    });
    expect((await observe(() => readTournament("s7"))).sourceArchives).toBe(0);
  });
  it("isolates incomplete/stale seasons and rechecks publication on the next read", async () => {
    await seed("s8");
    await backfillArchiveRelations("s7", true);
    await backfillArchiveRelations("s8", true);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const expected = await readTournaments(true);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    const [original] = await db()
      .select()
      .from(archiveRelationDocuments)
      .where(
        and(
          eq(archiveRelationDocuments.editionSlug, "s7"),
          eq(archiveRelationDocuments.documentKey, "archive"),
        ),
      );
    const [incomplete] = await db()
      .insert(archiveRelationDocuments)
      .values({
        editionSlug: "s7",
        documentKey: "archive",
        kind: "archive",
        contentHash: original.contentHash,
        codecVersion: original.codecVersion,
      })
      .returning();
    await db()
      .update(archiveRelationHeads)
      .set({ documentId: incomplete.id })
      .where(
        and(
          eq(archiveRelationHeads.editionSlug, "s7"),
          eq(archiveRelationHeads.documentKey, "archive"),
        ),
      );
    const mixed = await observe(() => readTournaments(true));
    expect(mixed.value).toEqual(expected);
    expect(mixed.statements.length).toBeLessThanOrEqual(6);
    await expect(verifyArchiveRelations(db(), "s7")).rejects.toThrow();
    const [hidden] = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, "s7"));
    await db()
      .update(editionState)
      .set({ configuration: { ...hidden.configuration!, published: false } })
      .where(eq(editionState.slug, "s7"));
    expect((await readTournaments(true)).map((r) => r.edition.slug)).toEqual([
      "s8",
    ]);
    expect((await readTournaments()).map((r) => r.edition.slug).sort()).toEqual(
      ["s7", "s8"],
    );
    const [changed] = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, "s8"));
    await db()
      .update(editionState)
      .set({
        configuration: {
          ...changed.configuration!,
          archive: {
            ...changed.configuration!.archive!,
            teams: changed.configuration!.archive!.teams.map((team, i) =>
              i === 0 ? { ...team, name: "Synthetic changed source" } : team,
            ),
          },
        },
      })
      .where(eq(editionState.slug, "s8"));
    const edited = await observe(() => readTournament("s8", undefined, true));
    expect(edited.value!.edition.archive!.teams[0].name).toBe(
      "Synthetic changed source",
    );
    expect(edited.sourceArchives).toBe(1);
    expect(await backfillArchiveRelations("s8")).toMatchObject({
      archiveReadReady: false,
    });
    await backfillArchiveRelations("s8", true);
    const refreshed = await observe(() =>
      readTournament("s8", undefined, true),
    );
    expect(refreshed.value).toEqual(edited.value);
    expect(refreshed.sourceArchives).toBe(0);
  });
  it("is idempotent under concurrency and updates only changed documents while retaining prior versions", async () => {
    const results = await Promise.all([
      backfillArchiveRelations("s7", true),
      backfillArchiveRelations("s7", true),
    ]);
    expect(results.map((r) => r.created).sort()).toEqual([0, 3]);
    const [before] = await db().select().from(historicalStatistics);
    const prior = await db().select().from(archiveRelationHeads);
    await db().transaction(async (tx) => {
      await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, "s7"))
        .for("update");
      await tx
        .update(historicalStatistics)
        .set({
          draft: { ...before.draft, allowUnlistedMaps: true },
          version: 4,
        })
        .where(eq(historicalStatistics.editionSlug, "s7"));
      expect(await syncArchiveRelations(tx, "s7")).toMatchObject({
        created: 1,
      });
    });
    expect(await db().select().from(archiveRelationDocuments)).toHaveLength(4);
    const next = await db().select().from(archiveRelationHeads);
    for (const key of ["archive", "999177:published"])
      expect(next.find((h) => h.documentKey === key)!.documentId).toBe(
        prior.find((h) => h.documentKey === key)!.documentId,
      );
    expect(await verifyArchiveRelations(db(), "s7")).toMatchObject({
      documents: 3,
    });
    expect(await backfillArchiveRelations("s7", true, true)).toMatchObject({
      created: 3,
    });
    expect(await db().select().from(archiveRelationDocuments)).toHaveLength(7);
  });
  it("keeps edition metadata and immutable archives together across concurrent updates", async () => {
    await backfillArchiveRelations("s7", true);
    const before = await readTournament("s7", undefined, true);
    await db().transaction(
      async (reader) => {
        expect(await readTournament("s7", reader, true)).toEqual(before);
        await db().transaction(async (writer) => {
          const [source] = await writer
            .select()
            .from(editionState)
            .where(eq(editionState.slug, "s7"))
            .for("update");
          const configuration = structuredClone(source.configuration!);
          configuration.name = "Synthetic updated edition";
          configuration.archive!.teams[0].name = "Synthetic updated team";
          await writer
            .update(editionState)
            .set({
              configuration,
              configurationVersion: source.configurationVersion + 1,
            })
            .where(eq(editionState.slug, "s7"));
          await syncArchiveRelations(writer, "s7");
        });
        expect(await readTournament("s7", reader, true)).toEqual(before);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    const after = await observe(() => readTournament("s7", undefined, true));
    expect(after.value?.edition.name).toBe("Synthetic updated edition");
    expect(after.value?.edition.archive!.teams[0].name).toBe(
      "Synthetic updated team",
    );
    expect(after.sourceArchives).toBe(0);
  });
  it("invalidates legacy edits and removes withdrawn heads without deleting evidence", async () => {
    await backfillArchiveRelations("s7", true);
    await db()
      .update(historicalStatistics)
      .set({ published: null })
      .where(eq(historicalStatistics.editionSlug, "s7"));
    expect(await normalizedStatistics("s7", db())).toBeUndefined();
    expect((await publicArchiveStatistics("s7")).plays).toEqual([]);
    await expect(verifyArchiveRelations(db(), "s7")).rejects.toMatchObject({
      status: 409,
    });
    await backfillArchiveRelations("s7", true);
    expect(await db().select().from(archiveRelationHeads)).toHaveLength(2);
    expect(await db().select().from(archiveRelationDocuments)).toHaveLength(3);
    await db()
      .update(editionState)
      .set({
        configuration: sql`jsonb_set(configuration,'{published}','false')`,
      });
    expect(await readTournament("s7", undefined, true)).toBeUndefined();
    await expect(publicArchiveStatistics("s7")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("rolls back source writes, immutable history and typed documents together on an insert failure", async () => {
    await backfillArchiveRelations("s7", true);
    const raw = await db().select().from(historicalStatistics),
      history = await db().select().from(historicalStatisticsRevisions),
      heads = await db().select().from(archiveRelationHeads);
    const configurations = await db().select().from(editionState);
    const digests = await db().select().from(historicalArchiveSources);
    await db().execute(
      sql`CREATE FUNCTION public.synthetic_relation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic relation failure'; END; $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER synthetic_relation_failure BEFORE INSERT ON archive_rel_statistics_source_games_scores FOR EACH ROW EXECUTE FUNCTION public.synthetic_relation_failure()`,
    );
    try {
      await expect(
        db().transaction(async (tx) => {
          await tx
            .select()
            .from(editionState)
            .where(eq(editionState.slug, "s7"))
            .for("update");
          await tx
            .update(editionState)
            .set({
              configuration: sql`jsonb_set(configuration,'{archive,notes}','["Synthetic rolled back"]'::jsonb)`,
            })
            .where(eq(editionState.slug, "s7"));
          await tx
            .update(historicalStatistics)
            .set({ draft: { ...raw[0].draft, included: [1] }, version: 4 });
          await syncArchiveRelations(tx, "s7");
        }),
      ).rejects.toThrow();
    } finally {
      await db().execute(
        sql`DROP TRIGGER synthetic_relation_failure ON archive_rel_statistics_source_games_scores`,
      );
      await db().execute(
        sql`DROP FUNCTION public.synthetic_relation_failure()`,
      );
    }
    expect(await db().select().from(historicalStatistics)).toEqual(raw);
    expect(await db().select().from(historicalStatisticsRevisions)).toEqual(
      history,
    );
    expect(await db().select().from(archiveRelationHeads)).toEqual(heads);
    expect(await db().select().from(editionState)).toEqual(configurations);
    expect(await db().select().from(historicalArchiveSources)).toEqual(digests);
    expect(await db().select().from(archiveRelationDocuments)).toHaveLength(3);
  });
  it("protects normalized history and rejects cross-season pointers", async () => {
    await backfillArchiveRelations("s7", true);
    await seed("s8");
    await backfillArchiveRelations("s8", true);
    const docs = await db().select().from(archiveRelationDocuments);
    await expect(
      db()
        .update(archiveRelationDocuments)
        .set({ contentHash: "b".repeat(64) }),
    ).rejects.toThrow();
    await expect(
      db().delete(archiveRelStatisticsSourceGamesScores),
    ).rejects.toThrow();
    await expect(
      db()
        .update(archiveRelationHeads)
        .set({ documentId: docs.find((d) => d.editionSlug === "s8")!.id })
        .where(eq(archiveRelationHeads.editionSlug, "s7")),
    ).rejects.toThrow();
    expect(
      archiveContentHash((await readTournament("s7"))!.edition.archive),
    ).toBe(archiveContentHash(completeArchive()));
  });
});
