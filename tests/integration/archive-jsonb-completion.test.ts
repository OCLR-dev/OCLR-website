import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import {
  archiveReadVersions,
  archiveReadPlays,
  archiveRelationDocuments,
  editionState,
  historicalStatistics,
  historicalStatisticsRevisions,
  historicalArchiveSources,
  users,
} from "../../src/db/schema";
import { readHistoricalStatistics } from "../../src/lib/archive-relations";
import {
  backfillArchiveReads,
  verifyArchiveReads,
} from "../../src/lib/archive-read";
import {
  publicArchiveStatistics,
  statisticsWorkspace,
} from "../../src/lib/archive-statistics-reads";
import { statisticsCommand } from "../../src/lib/archive-statistics";
import { publicPlayer } from "../../src/lib/players";
import { playerMapPerformance } from "../../src/lib/player-map-performance";
import { readTournament } from "../../src/lib/tournament-reads";
import { tournamentCommand } from "../../src/lib/tournaments";
import { leaderboardSource } from "../../src/lib/player-leaderboard-cache";
import { archiveContentHash } from "../../src/lib/archive-read-model";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import { observe, sourceJson } from "../archive-query-observer";
import { archiveQueryFixture } from "../fixtures/archive-query";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";

const url = process.env.TEST_DATABASE_URL;
const admin = {
  osuId: 396001,
  username: "Synthetic JSONB migration administrator",
};
async function seed(slug = "s7") {
  const f = archiveQueryFixture();
  f.archive.editionSlug = slug;
  f.archive.formatVersion = 2;
  f.archive.sourceFacts = [
    {
      category: "review",
      label: "Synthetic private evidence",
      text: "Not a public source appendix",
      source: "Synthetic",
    },
  ];
  await seedEditions([
    {
      ...edition,
      slug,
      status: "completed",
      registration: null,
      archive: f.archive,
    },
  ]);
  const key = statisticsArchiveKey(f.archive);
  await db()
    .insert(historicalStatistics)
    .values(
      f.rows.map((r) => ({
        ...r,
        editionSlug: slug,
        draft: { ...r.draft, archiveKey: key },
        published: {
          ...r.published,
          archiveKey: key,
          technicalAdjudication: true,
        },
      })),
    );
}
describe.skipIf(!url)("remaining historical JSONB paths (#929)", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    await db().insert(users).values(admin);
    await seed();
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("keeps every season's complete public/detail/analysis results with no legacy JSONB on ready reads", async () => {
    for (let n = 1; n <= 10; n++) if (n !== 7) await seed(`s${n}`);
    const source = await db().select().from(historicalStatistics),
      history = await db().select().from(historicalStatisticsRevisions),
      states = await db().select().from(editionState);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const expected = [];
    for (let n = 1; n <= 10; n++)
      expected.push({
        all: await publicArchiveStatistics(`s${n}`),
        detail: await publicArchiveStatistics(`s${n}`, "one"),
      });
    const performance = await playerMapPerformance(await publicPlayer(91003));
    const workspace = await statisticsWorkspace(admin, "s7", "one");
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    for (let n = 1; n <= 10; n++) await backfillArchiveReads(`s${n}`, true);
    for (let n = 1; n <= 10; n++) {
      const all = await observe(() => publicArchiveStatistics(`s${n}`));
      const detail = await observe(() =>
        publicArchiveStatistics(`s${n}`, "one"),
      );
      expect(all.value).toEqual(expected[n - 1].all);
      expect(detail.value).toEqual(expected[n - 1].detail);
      for (const read of [all, detail]) {
        expect(read.sourceArchives).toBe(0);
        expect(read.legacyPayloads).toBe(0);
        expect(sourceJson(read.statements)).toEqual([]);
      }
      expect((await verifyArchiveReads(db(), `s${n}`)).publicReadReady).toBe(
        true,
      );
    }
    const analysis = await observe(async () =>
      playerMapPerformance(await publicPlayer(91003)),
    );
    expect(analysis.value).toEqual(performance);
    expect(analysis.sourceArchives).toBe(0);
    expect(analysis.legacyPayloads).toBe(0);
    const staff = await observe(() => statisticsWorkspace(admin, "s7", "one"));
    expect(staff.value).toEqual(workspace);
    expect(staff.sourceArchives).toBe(0);
    expect(staff.legacyPayloads).toBe(0);
    expect(sourceJson(staff.statements)).toEqual([]);
    expect(await db().select().from(historicalStatistics)).toEqual(source);
    expect(await db().select().from(historicalStatisticsRevisions)).toEqual(
      history,
    );
    expect(await db().select().from(editionState)).toEqual(states);
  });
  it("reviews, withdraws and republishes transactionally through typed source documents while retaining literal legacy published JSONB", async () => {
    await backfillArchiveReads("s7", true);
    const [before] = await db()
      .select()
      .from(historicalStatistics)
      .where(eq(historicalStatistics.mpId, 999177));
    const review = await observe(() =>
      statisticsCommand(admin, "s7", {
        action: "review",
        mpId: 999177,
        expectedVersion: 3,
        poolId: "final",
        included: [1, 2],
      }),
    );
    expect(review.sourceArchives).toBe(0);
    expect(review.legacyPayloads).toBe(0);
    expect(sourceJson(review.statements)).toEqual([]);
    const [after] = await db()
      .select()
      .from(historicalStatistics)
      .where(eq(historicalStatistics.mpId, 999177));
    expect(after.published).toEqual(before.published);
    expect(after.published?.technicalAdjudication).toBe(true);
    expect(after.version).toBe(4);
    await statisticsCommand(admin, "s7", {
      action: "withdraw",
      fixtureId: "one",
      expectedVersions: { "999177": 4 },
      confirmed: true,
    });
    expect(
      (await publicArchiveStatistics("s7")).plays.every(
        (p) => p.fixtureId !== "one",
      ),
    ).toBe(true);
    await statisticsCommand(admin, "s7", {
      action: "publish",
      fixtureId: "one",
      expectedVersions: { "999177": 5 },
      confirmed: true,
    });
    const current = await observe(() => publicArchiveStatistics("s7"));
    expect(current.value.plays.some((p) => p.fixtureId === "one")).toBe(true);
    expect(sourceJson(current.statements)).toEqual([]);
    const meta = await observe(() =>
      tournamentCommand(admin, "s7", {
        action: "schedule",
        expectedRevision: 0,
        confirmed: true,
        schedule: [{ label: "Synthetic updated schedule", at: null }],
      }),
    );
    expect(meta.sourceArchives).toBe(0);
    expect((await readTournament("s7"))!.edition.schedule[0].label).toBe(
      "Synthetic updated schedule",
    );
    expect(
      (await db().select().from(historicalStatisticsRevisions)).length,
    ).toBeGreaterThan(2);
  });
  it("upgrades old cache generations without rewriting retained payloads, and repairs incomplete summaries or facts safely", async () => {
    const expected = await publicArchiveStatistics("s7");
    const first = await backfillArchiveReads("s7", true);
    const generationId = "generationId" in first ? first.generationId : null;
    if (!generationId) throw new Error("Expected a saved cache generation");
    const [version] = await db()
      .select()
      .from(archiveReadVersions)
      .where(eq(archiveReadVersions.id, generationId));
    const payloads = (await db().select().from(archiveReadPlays)).map(
      (p) => p.payload,
    );
    await db()
      .update(archiveReadVersions)
      .set({
        publicStatistics: null,
        header: { evidence: "Synthetic legacy payload is not the read model" },
      })
      .where(eq(archiveReadVersions.id, version.id));
    const independent = await observe(() => publicArchiveStatistics("s7"));
    expect(independent.value).toEqual(expected);
    expect(independent.legacyPayloads).toBe(0);
    expect(
      independent.statements.some((s) =>
        s.includes("archive_rel_statistics_source_games"),
      ),
    ).toBe(false);
    await db()
      .update(archiveReadVersions)
      .set({
        publicStatistics: version.publicStatistics,
        header: version.header,
      })
      .where(eq(archiveReadVersions.id, version.id));
    await db()
      .update(archiveReadVersions)
      .set({ publicSummaryDocumentId: null })
      .where(eq(archiveReadVersions.id, version.id));
    expect(await publicArchiveStatistics("s7")).toEqual(expected);
    expect(await backfillArchiveReads("s7", true)).toMatchObject({
      created: false,
      generationId: version.id,
      publicReadReady: true,
    });
    const [original] = await db()
      .select()
      .from(archiveRelationDocuments)
      .where(eq(archiveRelationDocuments.id, version.publicSummaryDocumentId!));
    const [incomplete] = await db()
      .insert(archiveRelationDocuments)
      .values({
        editionSlug: "s7",
        documentKey: original.documentKey,
        kind: "summary",
        contentHash: original.contentHash,
        codecVersion: original.codecVersion,
      })
      .returning();
    await db()
      .update(archiveReadVersions)
      .set({ publicSummaryDocumentId: incomplete.id })
      .where(eq(archiveReadVersions.id, version.id));
    expect(await publicArchiveStatistics("s7")).toEqual(expected);
    expect(await backfillArchiveReads("s7", true)).toMatchObject({
      created: false,
      generationId: version.id,
      publicReadReady: true,
    });
    expect((await verifyArchiveReads(db(), "s7")).publicReadReady).toBe(true);
    expect(
      (await db().select().from(archiveReadPlays)).map((p) => p.payload),
    ).toEqual(payloads);
    await db()
      .update(archiveReadVersions)
      .set({ publicPlayCount: payloads.length + 1 })
      .where(eq(archiveReadVersions.id, version.id));
    expect(await backfillArchiveReads("s7", false)).toMatchObject({
      publicReadReady: false,
    });
    await expect(verifyArchiveReads(db(), "s7")).rejects.toThrow();
    expect(await publicArchiveStatistics("s7")).toEqual(expected);
    expect(await backfillArchiveReads("s7", true)).toMatchObject({
      created: false,
      generationId: version.id,
      publicReadReady: true,
    });
    await db()
      .delete(archiveReadPlays)
      .where(
        and(
          eq(archiveReadPlays.generationId, version.id),
          eq(archiveReadPlays.position, 0),
        ),
      );
    expect(await publicArchiveStatistics("s7")).toEqual(expected);
    expect(await backfillArchiveReads("s7", false)).toMatchObject({
      publicReadReady: false,
    });
    await expect(verifyArchiveReads(db(), "s7")).rejects.toThrow();
    const repaired = await backfillArchiveReads("s7", true);
    expect(repaired).toMatchObject({
      created: true,
      publicReadReady: true,
    });
    expect(await backfillArchiveReads("s7", true)).toEqual({
      ...repaired,
      created: false,
    });
    expect(await publicArchiveStatistics("s7")).toEqual(expected);
  });
  it("uses the identical legacy configuration checksum for MRA and invalidates unversioned non-archive edits", async () => {
    await backfillArchiveReads("s7", true);
    const before = await leaderboardSource(db());
    const [identity] = await db()
      .select({
        saved: historicalArchiveSources.configurationHash,
        legacy: sql<string>`encode(sha256(convert_to(${editionState.configuration}::text,'UTF8')),'hex')`,
        archive: historicalArchiveSources.sourceHash,
      })
      .from(editionState)
      .innerJoin(
        historicalArchiveSources,
        eq(historicalArchiveSources.editionSlug, editionState.slug),
      );
    expect(identity.saved).toBe(identity.legacy);
    await db()
      .update(editionState)
      .set({
        configuration: sql`jsonb_set(configuration,'{summary}','"Synthetic unversioned metadata edit"'::jsonb)`,
      });
    const after = await leaderboardSource(db());
    expect(after.sourceHash).not.toBe(before.sourceHash);
    const [next] = await db().select().from(historicalArchiveSources);
    expect(next.sourceHash).toBe(identity.archive);
    expect(next.configurationHash).not.toBe(identity.saved);
    await db()
      .update(historicalArchiveSources)
      .set({ configurationHash: null });
    expect((await leaderboardSource(db())).sourceHash).toBeNull();
    expect(
      archiveContentHash(await readHistoricalStatistics("s7", db())),
    ).toBeTruthy();
  });
});
