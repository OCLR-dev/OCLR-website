import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  archiveReadVersions,
  archiveReadScores,
  archiveReadPeople,
  editionState,
  historicalStatistics,
  users,
} from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import {
  publicArchiveStatistics,
  statisticsWorkspace,
} from "../../src/lib/archive-statistics-reads";
import { statisticsCommand } from "../../src/lib/archive-statistics";
import {
  backfillArchiveReads,
  relationalArchive,
  relationalPublicPlays,
} from "../../src/lib/archive-read";
import {
  readTournament,
  readTournaments,
} from "../../src/lib/tournament-reads";
import { publicPlayer } from "../../src/lib/players";
import { playerParticipationHistory } from "../../src/lib/player-history";
import { playerCompetitionRecord } from "../../src/lib/player-competition";
import { playerMapPerformance } from "../../src/lib/player-map-performance";

const url = process.env.TEST_DATABASE_URL;
const savedArchive = {
  ...statisticsArchive,
  formatVersion: 2 as const,
  notes: ["Private source appendix"],
  sourceFacts: [
    {
      category: "review" as const,
      label: "Private evidence",
      text: "Staff-only source evidence",
      source: "Synthetic review",
    },
  ],
};
const admin = { osuId: 391001, username: "Synthetic archive administrator" };
describe.skipIf(!url)("versioned historical relational reads", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    await db().insert(users).values(admin);
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        status: "completed",
        registration: null,
        archive: savedArchive,
      },
    ]);
    const snapshot = {
      archiveKey: statisticsArchiveKey(statisticsArchive),
      source: statisticsSource(),
      poolId: "final",
      included: [1, 2],
    };
    await db()
      .insert(historicalStatistics)
      .values({
        editionSlug: "s7",
        mpId: 999177,
        fixtureId: "one",
        version: 3,
        draft: snapshot,
        published: snapshot,
        publishedAt: new Date(0),
      });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function outputs() {
    return {
      tournament: await readTournament("s7"),
      public: await readTournament("s7", undefined, true),
      list: await readTournaments(true),
      statistics: await publicArchiveStatistics("s7", "one"),
      workspace: await statisticsWorkspace(admin, "s7", "one"),
      player: await publicPlayer(91003),
      history: await playerParticipationHistory(91003),
      record: await playerCompetitionRecord(await publicPlayer(91003)),
      performance: await playerMapPerformance(await publicPlayer(91003)),
    };
  }
  it("preserves native/remote-facing read models and every analysis while replacing storage reads", async () => {
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const before = await outputs();
    expect(before.public!.edition.archive!.sourceFacts).toBeUndefined();
    expect(before.public!.edition.archive!.notes).toEqual([]);
    expect(before.tournament!.edition.archive!.sourceFacts).toEqual(
      savedArchive.sourceFacts,
    );
    const sourceBefore = await db().select().from(historicalStatistics);
    expect(await backfillArchiveReads("s7")).toMatchObject({
      created: false,
      rows: { snapshots: 2, games: 8, scores: 32, plays: 8 },
    });
    expect(await db().select().from(archiveReadVersions)).toHaveLength(0);
    const concurrent = await Promise.all([
      backfillArchiveReads("s7", true),
      backfillArchiveReads("s7", true),
    ]);
    expect(concurrent.filter((r) => r.created)).toHaveLength(1);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    expect(await outputs()).toEqual(before);
    expect(await db().select().from(historicalStatistics)).toEqual(
      sourceBefore,
    );
    expect(await db().select().from(users)).toHaveLength(1);
    expect(await db().select().from(archiveReadPeople)).toHaveLength(
      statisticsArchive.players.length + statisticsArchive.staff.length,
    );
    expect(await db().select().from(archiveReadScores)).toHaveLength(32);
    const [state] = await db().select().from(editionState);
    expect(await relationalArchive(state, db())).toEqual(savedArchive);
    expect(
      await relationalPublicPlays("s7", sourceBefore, db(), {
        osuId: 91003,
        stage: "Final",
        teamId: "alpha",
        beatmapId: 10001,
      }),
    ).toEqual(
      before.statistics.plays.filter(
        (p) =>
          p.osuId === 91003 &&
          p.stage === "Final" &&
          p.teamId === "alpha" &&
          p.beatmapId === 10001,
      ),
    );
  });
  it("falls back for changed sources/policies and immediately honors withdrawal and edition privacy", async () => {
    await backfillArchiveReads("s7", true);
    const [row] = await db().select().from(historicalStatistics);
    await db()
      .update(historicalStatistics)
      .set({ version: 4, draft: { ...row.draft, included: [] } });
    const changed = await db().select().from(historicalStatistics);
    expect(await relationalPublicPlays("s7", changed, db())).toBeUndefined();
    expect((await publicArchiveStatistics("s7")).plays).toHaveLength(8);
    await statisticsCommand(admin, "s7", {
      action: "withdraw",
      fixtureId: "one",
      expectedVersions: { "999177": 4 },
      confirmed: true,
    });
    expect((await publicArchiveStatistics("s7")).plays).toEqual([]);
    await backfillArchiveReads("s7", true);
    const [state] = await db().select().from(editionState);
    await db()
      .update(editionState)
      .set({ configuration: { ...state.configuration!, published: false } });
    expect(await readTournament("s7", undefined, true)).toBeUndefined();
    expect(
      await relationalPublicPlays(
        "s7",
        await db().select().from(historicalStatistics),
        db(),
      ),
    ).toBeUndefined();
  });
  it("never serves changed archive payloads or partial failed generations", async () => {
    await backfillArchiveReads("s7", true);
    const [state] = await db().select().from(editionState);
    const changed = {
      ...state.configuration!,
      archive: { ...statisticsArchive, notes: ["Changed evidence"] },
    };
    await db().update(editionState).set({ configuration: changed });
    const [current] = await db().select().from(editionState);
    expect(await relationalArchive(current, db())).toBeUndefined();
    expect((await readTournament("s7"))!.edition.archive!.notes).toEqual([
      "Changed evidence",
    ]);
    await db()
      .update(historicalStatistics)
      .set({ draft: sql`jsonb_set(draft,'{included}','[999999]'::jsonb)` });
    // Invalid selected game cannot manufacture a release; all raw evidence stays saved.
    await backfillArchiveReads("s7", true);
    const [row] = await db().select().from(historicalStatistics);
    expect(row.draft.included).toEqual([999999]);
    expect((await publicArchiveStatistics("s7")).plays).toHaveLength(8);
    expect(await db().select().from(archiveReadVersions)).toHaveLength(2);
  });
  it("rolls back failed generations and supports explicit rebuild without deleting old versions", async () => {
    await backfillArchiveReads("s7", true);
    const before = await publicArchiveStatistics("s7");
    const source = await db().select().from(historicalStatistics);
    await db().execute(
      sql`CREATE FUNCTION public.synthetic_archive_write_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic derived write failure'; END; $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER synthetic_archive_write_failure BEFORE INSERT ON archive_read_plays FOR EACH ROW EXECUTE FUNCTION public.synthetic_archive_write_failure()`,
    );
    try {
      await expect(backfillArchiveReads("s7", true, true)).rejects.toThrow();
      expect(await db().select().from(archiveReadVersions)).toHaveLength(1);
      expect(await db().select().from(historicalStatistics)).toEqual(source);
    } finally {
      await db().execute(
        sql`DROP TRIGGER synthetic_archive_write_failure ON archive_read_plays`,
      );
      await db().execute(
        sql`DROP FUNCTION public.synthetic_archive_write_failure()`,
      );
    }
    expect(await backfillArchiveReads("s7", true, true)).toMatchObject({
      created: true,
    });
    expect(await db().select().from(archiveReadVersions)).toHaveLength(2);
    expect(await publicArchiveStatistics("s7")).toEqual(before);
  });
  it("withholds an entire multi-MP fixture until every source is released, then matches JSONB analysis", async () => {
    const archive = structuredClone(savedArchive);
    archive.matches[0].mpUrls.push(
      "https://osu.ppy.sh/community/matches/999178",
    );
    const [state] = await db().select().from(editionState);
    await db()
      .update(editionState)
      .set({ configuration: { ...state.configuration!, archive } });
    for (const [mpId, gameId] of [
      [999177, 1],
      [999178, 2],
    ]) {
      const source = statisticsSource();
      source.match.id = mpId;
      source.fingerprint = (mpId === 999177 ? "a" : "b").repeat(64);
      source.games = source.games.filter((g) => g.id === gameId);
      const snapshot = {
        archiveKey: statisticsArchiveKey(archive),
        source,
        poolId: "final",
        included: [gameId],
      };
      await db()
        .insert(historicalStatistics)
        .values({
          editionSlug: "s7",
          mpId,
          fixtureId: "one",
          version: 3,
          draft: snapshot,
          published: snapshot,
          publishedAt: new Date(0),
        })
        .onConflictDoUpdate({
          target: [historicalStatistics.editionSlug, historicalStatistics.mpId],
          set: { draft: snapshot, published: snapshot },
        });
    }
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const before = await outputs();
    expect(before.statistics.mpCovered).toBe(2);
    expect(before.statistics.plays).toHaveLength(8);
    await backfillArchiveReads("s7", true);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    expect(await outputs()).toEqual(before);
    // Simulate a legacy partial release; neither the old generation nor a new
    // backfill may expose only one MP's scores as a complete fixture.
    await db()
      .update(historicalStatistics)
      .set({ published: null, publishedAt: null, version: 4 })
      .where(eq(historicalStatistics.mpId, 999178));
    expect((await publicArchiveStatistics("s7")).plays).toEqual([]);
    await backfillArchiveReads("s7", true);
    expect((await publicArchiveStatistics("s7")).plays).toEqual([]);
    await statisticsCommand(admin, "s7", {
      action: "publish",
      fixtureId: "one",
      expectedVersions: { "999177": 3, "999178": 4 },
      confirmed: true,
    });
    expect((await publicArchiveStatistics("s7")).plays).toEqual(
      before.statistics.plays,
    );
    await backfillArchiveReads("s7", true);
    expect((await publicArchiveStatistics("s7")).plays).toEqual(
      before.statistics.plays,
    );
  });
  it("invalidates EZ-adjusted facts without changing raw source and retains every analysis", async () => {
    const [row] = await db().select().from(historicalStatistics);
    const snapshot = structuredClone(row.draft);
    snapshot.source.games[0].scores[0].mods = ["EZ"];
    await db()
      .update(historicalStatistics)
      .set({ draft: snapshot, published: snapshot });
    await backfillArchiveReads("s7", true);
    const before = await publicArchiveStatistics("s7");
    const sourceBefore = await db().select().from(historicalStatistics);
    const [state] = await db().select().from(editionState);
    await db()
      .update(editionState)
      .set({
        configuration: { ...state.configuration!, ezScoreMultiplier: 1.2345 },
      });
    expect(
      await relationalPublicPlays("s7", sourceBefore, db()),
    ).toBeUndefined();
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const expected = await outputs();
    const play = expected.statistics.plays.find(
      (p) => p.gameId === 1 && p.osuId === 91001,
    )!;
    expect(play.score).not.toBe(
      before.plays.find((p) => p.gameId === 1 && p.osuId === 91001)!.score,
    );
    expect(play.rawScore).toBe(
      before.plays.find((p) => p.gameId === 1 && p.osuId === 91001)!.rawScore,
    );
    await backfillArchiveReads("s7", true);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    expect(await outputs()).toEqual(expected);
    expect(await db().select().from(historicalStatistics)).toEqual(
      sourceBefore,
    );
  });
});
