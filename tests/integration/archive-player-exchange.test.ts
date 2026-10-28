import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  staffRoles,
  editionEvents,
  editionRevisions,
  historicalStatistics,
} from "../../src/db/schema";
import { tournamentCommand, readTournament } from "../../src/lib/tournaments";
import {
  statisticsCommand,
  statisticsWorkspace,
  publicArchiveStatistics,
  preserveStatisticsForRosterExchange,
} from "../../src/lib/archive-statistics";
import { exchangeArchivePlayers } from "../../src/lib/historical-archive";
import { extendedRead } from "../../src/lib/extended-read";
import { fetchMatchSource } from "../../src/lib/osu-matches";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import {
  archiveExchange,
  exchangeArchive,
  exchangeSource,
  exchangeExclusions,
} from "../fixtures/archive-player-exchange";

vi.mock("../../src/lib/osu-matches", () => ({ fetchMatchSource: vi.fn() }));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 398001, username: "Exchange Admin" };
const referee = { osuId: 398002, username: "Exchange Referee" };
const other = { osuId: 398003, username: "Other Exchange Admin" };
const command = {
  action: "exchange-archive-players",
  expectedRevision: 0,
  confirmed: true,
  preserveStatistics: true,
  ...archiveExchange,
};

describe.skipIf(!url)("historical exchange transactions", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.mocked(fetchMatchSource).mockReset().mockResolvedValue(exchangeSource());
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await db().insert(users).values([admin, referee, other]);
    await seedEditions([
      {
        ...edition,
        slug: "s6",
        status: "completed",
        registration: null,
        published: true,
        archive: exchangeArchive(),
      },
      { ...edition, slug: "s8" },
    ]);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: referee.osuId,
          role: "referee",
          editionSlug: "s6",
          grantedBy: admin.osuId,
        },
        {
          userId: other.osuId,
          role: "admin",
          editionSlug: "s8",
          grantedBy: admin.osuId,
        },
      ]);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function publish() {
    await statisticsCommand(admin, "s6", {
      action: "import",
      mpId: 999177,
      expectedVersion: 0,
    });
    await statisticsCommand(admin, "s6", {
      action: "review",
      mpId: 999177,
      expectedVersion: 1,
      poolId: "final",
      included: [1, 2],
      excludedScores: exchangeExclusions,
    });
    await statisticsCommand(admin, "s6", {
      action: "publish",
      fixtureId: "one",
      expectedVersions: { "999177": 2 },
      confirmed: true,
    });
  }
  async function saved() {
    return {
      tournament: await readTournament("s6"),
      statistics: await db().select().from(historicalStatistics),
      revisions: await db().select().from(editionRevisions),
      events: await db().select().from(editionEvents),
    };
  }
  it("preserves published plays, source, exclusions and publication time; newly attributable games stay unselected", async () => {
    await publish();
    const before = await publicArchiveStatistics("s6", "one");
    const [row] = await db().select().from(historicalStatistics);
    expect(
      (await statisticsWorkspace(admin, "s6", "one")).reviews[0].games[2].issues
        .length,
    ).toBeGreaterThan(0);
    await tournamentCommand(admin, "s6", command);
    const after = await publicArchiveStatistics("s6", "one");
    expect(after.plays).toEqual(before.plays);
    expect(after.fixtures).toEqual(before.fixtures);
    expect(after.publishedAt).toBe(before.publishedAt);
    const [updated] = await db().select().from(historicalStatistics);
    expect(updated.draft).toEqual({
      ...row.draft,
      archiveKey: after.archiveKey,
    });
    expect(updated.published).toEqual({
      ...row.published!,
      archiveKey: after.archiveKey,
    });
    expect(updated.publishedAt).toEqual(row.publishedAt);
    expect(updated.version).toBe(row.version + 1);
    const workspace = await statisticsWorkspace(admin, "s6", "one");
    expect(workspace.reviews[0].games[2]).toMatchObject({
      included: false,
      issues: [],
    });
    expect(workspace.summaries[0]).toMatchObject({
      stale: false,
      changes: false,
    });
    const state = await readTournament("s6");
    expect(state!.revision).toBe(1);
    expect(state!.edition.published).toBe(true);
    expect(state!.edition.archive).toEqual(
      exchangeArchivePlayers(exchangeArchive(), archiveExchange),
    );
    const events = await db().select().from(editionEvents);
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining([
        "statistics_roster_revalidation",
        "tournament_exchange-archive-players",
      ]),
    );
    expect(await db().select().from(users)).toHaveLength(3);
    expect(
      await extendedRead(
        "publicArchiveStatistics",
        { edition: "s6" },
        new URLSearchParams({ fixtureId: "one" }),
        null,
      ),
    ).toEqual(after);
    expect(fetchMatchSource).toHaveBeenCalledTimes(1);
    const afterSaved = await saved();
    await expect(
      statisticsCommand(admin, "s6", {
        action: "publish",
        fixtureId: "one",
        expectedVersions: { "999177": row.version },
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      tournamentCommand(admin, "s6", { ...command, expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await saved()).toEqual(afterSaved);
  });
  it("never blesses an already stale private draft or publishes it", async () => {
    await publish();
    const [row] = await db().select().from(historicalStatistics);
    await db()
      .update(historicalStatistics)
      .set({ draft: { ...row.draft, archiveKey: "b".repeat(64) } });
    await tournamentCommand(admin, "s6", command);
    const [after] = await db().select().from(historicalStatistics);
    expect(after.draft).toEqual({ ...row.draft, archiveKey: "b".repeat(64) });
    expect(after.published).toEqual({
      ...row.published!,
      archiveKey: (await publicArchiveStatistics("s6")).archiveKey,
    });
    expect((await statisticsWorkspace(admin, "s6")).summaries[0].stale).toBe(
      true,
    );
    expect((await publicArchiveStatistics("s6")).plays).toHaveLength(8);
  });
  it("rolls back roster, statistics, revision and audit if an actual published participant would change teams", async () => {
    const source = exchangeSource();
    source.games[0].scores[0].osuId = 91991;
    source.games[0].scores = source.games[0].scores.filter(
      (s) => s.osuId !== 91991 || s.total !== 0,
    );
    vi.mocked(fetchMatchSource).mockResolvedValue(source);
    await statisticsCommand(admin, "s6", {
      action: "import",
      mpId: 999177,
      expectedVersion: 0,
    });
    await statisticsCommand(admin, "s6", {
      action: "review",
      mpId: 999177,
      expectedVersion: 1,
      poolId: "final",
      included: [1, 2],
      excludedScores: exchangeExclusions.filter(
        (e) => e.gameId !== 1 || e.osuId !== 91991,
      ),
    });
    await statisticsCommand(admin, "s6", {
      action: "publish",
      fixtureId: "one",
      expectedVersions: { "999177": 2 },
      confirmed: true,
    });
    const before = await saved();
    await expect(tournamentCommand(admin, "s6", command)).rejects.toMatchObject(
      { status: 409 },
    );
    expect(await saved()).toEqual(before);
    expect((await publicArchiveStatistics("s6")).plays).toHaveLength(8);
  });
  it("preserves every published MP part of a multi-source fixture atomically", async () => {
    const archive = exchangeArchive();
    archive.matches[0].mpUrls.push(
      "https://osu.ppy.sh/community/matches/999178",
    );
    await seedEditions([
      {
        ...edition,
        slug: "s6",
        status: "completed",
        registration: null,
        published: true,
        archive,
      },
    ]);
    const firstSource = exchangeSource();
    const secondSource = exchangeSource();
    secondSource.match.id = 999178;
    secondSource.fingerprint = "c".repeat(64);
    secondSource.games.forEach((g) => {
      g.id += 100;
    });
    vi.mocked(fetchMatchSource).mockImplementation(async (id) =>
      id === 999177 ? firstSource : secondSource,
    );
    for (const [mpId, gameId] of [
      [999177, 1],
      [999178, 102],
    ]) {
      await statisticsCommand(admin, "s6", {
        action: "import",
        mpId,
        expectedVersion: 0,
      });
      await statisticsCommand(admin, "s6", {
        action: "review",
        mpId,
        expectedVersion: 1,
        poolId: "final",
        included: [gameId],
        excludedScores: [91991, 91992].map((osuId) => ({ gameId, osuId })),
      });
    }
    await statisticsCommand(admin, "s6", {
      action: "publish",
      fixtureId: "one",
      expectedVersions: { "999177": 2, "999178": 2 },
      confirmed: true,
    });
    const before = await publicArchiveStatistics("s6");
    const rows = await db().select().from(historicalStatistics);
    await tournamentCommand(admin, "s6", command);
    const after = await publicArchiveStatistics("s6");
    expect(after.plays).toEqual(before.plays);
    expect(after.mpCovered).toBe(2);
    for (const saved of await db().select().from(historicalStatistics)) {
      const original = rows.find((r) => r.mpId === saved.mpId)!;
      expect(saved.published).toEqual({
        ...original.published!,
        archiveKey: after.archiveKey,
      });
      expect(saved.publishedAt).toEqual(original.publishedAt);
      expect(saved.version).toBe(original.version + 1);
    }
  });
  it("does not revive an already stale published snapshot", async () => {
    await publish();
    const [row] = await db().select().from(historicalStatistics);
    await db()
      .update(historicalStatistics)
      .set({ published: { ...row.published!, archiveKey: "b".repeat(64) } });
    expect((await publicArchiveStatistics("s6")).plays).toEqual([]);
    await tournamentCommand(admin, "s6", command);
    const [after] = await db().select().from(historicalStatistics);
    expect(after.published).toEqual({
      ...row.published!,
      archiveKey: "b".repeat(64),
    });
    expect((await publicArchiveStatistics("s6")).plays).toEqual([]);
  });
  it("enforces scoped Admin authority, explicit preservation and strict input", async () => {
    const before = await saved();
    for (const actor of [referee, other])
      await expect(
        tournamentCommand(actor, "s6", command),
      ).rejects.toMatchObject({ status: 403 });
    for (const change of [
      { preserveStatistics: false },
      { confirmed: false },
      { tier: 4 },
    ])
      await expect(
        tournamentCommand(admin, "s6", { ...command, ...change }),
      ).rejects.toMatchObject({ status: 400 });
    for (const change of [
      { firstTeamId: "beta" },
      { firstOsuId: 91001 },
      { secondOsuId: 91991 },
      { expectedRevision: 99 },
    ])
      await expect(
        tournamentCommand(admin, "s6", { ...command, ...change }),
      ).rejects.toMatchObject({ status: 409 });
    expect(await saved()).toEqual(before);
  });
  it("serializes concurrent exchanges and does not create a second exchange or release", async () => {
    const results = await Promise.allSettled([
      tournamentCommand(admin, "s6", command),
      tournamentCommand(admin, "s6", command),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await readTournament("s6"))!.revision).toBe(1);
    expect(await db().select().from(historicalStatistics)).toEqual([]);
    expect(
      (await db().select().from(editionEvents)).filter(
        (e) => e.kind === "tournament_exchange-archive-players",
      ),
    ).toHaveLength(1);
  });
  it("rejects unrelated archive edits in the preservation helper", async () => {
    const before = exchangeArchive();
    const after = exchangeArchivePlayers(before, archiveExchange);
    after.matches[0].score = [1, 1];
    await expect(
      db().transaction((tx) =>
        preserveStatisticsForRosterExchange(
          tx,
          admin,
          before,
          after,
          archiveExchange,
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readTournament("s6"))!.revision).toBe(0);
  });
});
