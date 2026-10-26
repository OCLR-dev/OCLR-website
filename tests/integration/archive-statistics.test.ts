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
import { users, staffRoles, editionEvents } from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { fetchMatchSource } from "../../src/lib/osu-matches";
import {
  statisticsCommand,
  statisticsWorkspace,
  publicArchiveStatistics,
} from "../../src/lib/archive-statistics";
vi.mock("../../src/lib/osu-matches", () => ({ fetchMatchSource: vi.fn() }));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 391001, username: "Statistics Admin" };
const referee = { osuId: 391002, username: "Statistics Referee" };
const other = { osuId: 391003, username: "Other edition Admin" };
const imported = { action: "import", mpId: 999177, expectedVersion: 0 };
const reviewed = {
  action: "review",
  mpId: 999177,
  expectedVersion: 1,
  poolId: "final",
  included: [1, 2],
};
const publish = {
  action: "publish",
  fixtureId: "one",
  expectedVersions: { "999177": 2 },
  confirmed: true,
};
describe.skipIf(!url)("historical statistics transactions", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.mocked(fetchMatchSource)
      .mockReset()
      .mockResolvedValue(statisticsSource());
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await db().insert(users).values([admin, referee, other]);
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        name: "Synthetic S7 statistics",
        status: "completed",
        registration: null,
        published: true,
        archive: structuredClone(statisticsArchive),
      },
      { ...edition, slug: "s8" },
    ]);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: referee.osuId,
          role: "referee",
          editionSlug: "s7",
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
  it("requires a versioned review to exclude a zero-score occupant and publishes only retained scores", async () => {
    const source = statisticsSource();
    source.games[0].scores.push({
      ...structuredClone(source.games[0].scores[0]),
      osuId: 999999,
      total: 0,
      accuracy: 0,
      combo: 0,
      passed: false,
      hitCounts: { great: null, ok: null, meh: null, miss: 100 },
    });
    vi.mocked(fetchMatchSource).mockResolvedValue(source);
    await statisticsCommand(referee, "s7", imported);
    await expect(
      statisticsCommand(referee, "s7", reviewed),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      statisticsCommand(referee, "s7", {
        ...reviewed,
        excludedScores: [{ gameId: 1, osuId: 91001 }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await statisticsCommand(referee, "s7", {
      ...reviewed,
      excludedScores: [{ gameId: 1, osuId: 999999 }],
    });
    const workspace = await statisticsWorkspace(admin, "s7", "one");
    expect(workspace.reviews[0].games[0].game.scores).toHaveLength(5);
    expect(workspace.reviews[0].excludedScores).toEqual([
      { gameId: 1, osuId: 999999 },
    ]);
    expect((await publicArchiveStatistics("s7", "one")).plays).toEqual([]);
    await statisticsCommand(admin, "s7", publish);
    const publicData = await publicArchiveStatistics("s7", "one");
    expect(publicData.plays).toHaveLength(8);
    expect(publicData.matchDetails[0].details.games).toHaveLength(4);
    expect(publicData.matchDetails[0].details.rating?.gameCount).toBe(2);
    expect(publicData.matchDetails[0].details.rating?.issues).toEqual([]);
    expect(JSON.stringify(publicData.matchDetails)).not.toContain("999999");
    expect(publicData.plays.some((p) => p.osuId === 999999)).toBe(false);
  });
  it("reserves exceptional reviews for Admin and retains audited immutable source facts", async () => {
    const source = statisticsSource();
    source.games[0].scores[0].team = "red";
    source.games[0].scores.push({
      ...structuredClone(source.games[0].scores[0]),
      osuId: 91005,
      total: 3,
    });
    source.games[1].scores[2].total = 999;
    vi.mocked(fetchMatchSource).mockResolvedValue(source);
    await statisticsCommand(referee, "s7", imported);
    const exceptions = {
      ...reviewed,
      rosterTeamGames: [1],
      technicalAdjudication: true,
      excludedScores: [{ gameId: 1, osuId: 91005, reason: "non-participant" }],
    };
    await expect(
      statisticsCommand(referee, "s7", exceptions),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      statisticsCommand(admin, "s7", { ...exceptions, rosterTeamGames: [999] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      statisticsCommand(admin, "s7", {
        ...exceptions,
        excludedScores: [
          { gameId: 1, osuId: 91001, reason: "non-participant" },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await statisticsCommand(admin, "s7", exceptions);
    expect(
      (await statisticsWorkspace(admin, "s7", "one")).reviews[0].games[0].game
        .scores,
    ).toHaveLength(5);
    expect((await publicArchiveStatistics("s7", "one")).plays).toEqual([]);
    await statisticsCommand(admin, "s7", publish);
    const publicData = await publicArchiveStatistics("s7", "one");
    expect(publicData.plays).toHaveLength(8);
    expect(publicData.fixtures[0]).toMatchObject({
      technicalAdjudication: true,
      score: [2, 0],
    });
    expect(publicData.plays.some((p) => p.osuId === 91005)).toBe(false);
    const event = (await db().select().from(editionEvents)).find(
      (e) => e.kind === "statistics_review",
    );
    expect(event?.detail).toMatchObject({
      technicalAdjudication: true,
      rosterTeamGames: [1],
      excludedScores: exceptions.excludedScores,
    });
  });
  it("imports privately, publishes reviewed games atomically and preserves published data across draft edits", async () => {
    await statisticsCommand(referee, "s7", imported);
    expect((await publicArchiveStatistics("s7", "one")).plays).toEqual([]);
    await statisticsCommand(referee, "s7", reviewed);
    await statisticsCommand(admin, "s7", publish);
    const publicData = await publicArchiveStatistics("s7", "one");
    expect(publicData.plays).toHaveLength(8);
    expect(publicData.mpCovered).toBe(1);
    expect(JSON.stringify(publicData)).not.toContain("providerFields");
    await statisticsCommand(referee, "s7", {
      ...reviewed,
      expectedVersion: 3,
      included: [],
    });
    expect((await publicArchiveStatistics("s7", "one")).plays).toHaveLength(8);
    expect((await publicArchiveStatistics("s7", "one")).matchDetails).toEqual(
      publicData.matchDetails,
    );
    expect((await publicArchiveStatistics("s7")).matchDetails).toEqual([]);
    expect(
      (await publicArchiveStatistics("s7", "another-fixture")).matchDetails,
    ).toEqual([]);
    await statisticsCommand(admin, "s7", {
      action: "withdraw",
      fixtureId: "one",
      expectedVersions: { "999177": 4 },
      confirmed: true,
    });
    expect((await publicArchiveStatistics("s7", "one")).plays).toEqual([]);
    expect(await db().select().from(editionEvents)).toHaveLength(5);
  });
  it("rates the same retained games across all approved rooms without counting technical points", async () => {
    const archive = structuredClone(statisticsArchive);
    archive.matches[0].mpUrls.push(
      "https://osu.ppy.sh/community/matches/999178",
    );
    archive.matches[0].score = [2, 1];
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        name: "Synthetic multi-room",
        status: "completed",
        registration: null,
        published: true,
        archive,
      },
    ]);
    for (const index of [0, 1]) {
      const source = statisticsSource();
      source.match.id += index;
      source.games = source.games.filter((g) => g.id === index + 1);
      source.fingerprint = (index ? "b" : "a").repeat(64);
      vi.mocked(fetchMatchSource).mockResolvedValue(source);
      await statisticsCommand(admin, "s7", {
        ...imported,
        mpId: source.match.id,
      });
      await statisticsCommand(admin, "s7", {
        ...reviewed,
        mpId: source.match.id,
        included: [index + 1],
        technicalAdjudication: true,
      });
    }
    await statisticsCommand(admin, "s7", {
      ...publish,
      expectedVersions: { "999177": 2, "999178": 2 },
    });
    const events = (await db().select().from(editionEvents)).length;
    vi.mocked(fetchMatchSource).mockClear();
    const result = await publicArchiveStatistics("s7", "one");
    const detail = result.matchDetails[0].details;
    expect(detail.sources).toHaveLength(2);
    expect(detail.technicalAdjudication).toBe(true);
    expect(detail.rating).toMatchObject({
      gameCount: 2,
      scoreCount: 8,
      issues: [],
    });
    expect(detail.rating!.players.every((p) => p.appearances === 2)).toBe(true);
    expect(result.fixtures[0].score).toEqual([2, 1]);
    expect(fetchMatchSource).not.toHaveBeenCalled();
    expect(await db().select().from(editionEvents)).toHaveLength(events);
    await statisticsCommand(admin, "s7", {
      action: "withdraw",
      fixtureId: "one",
      expectedVersions: { "999177": 3, "999178": 3 },
      confirmed: true,
    });
    expect((await publicArchiveStatistics("s7", "one")).matchDetails).toEqual(
      [],
    );
  });
  it("enforces edition scope, source allowlists, review permissions and versions", async () => {
    await expect(
      statisticsCommand(other, "s7", imported),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      statisticsCommand(admin, "s7", { ...imported, mpId: 123 }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMatchSource).not.toHaveBeenCalled();
    await statisticsCommand(referee, "s7", imported);
    await expect(
      statisticsCommand(referee, "s7", publish),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      statisticsCommand(admin, "s7", { ...reviewed, expectedVersion: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      statisticsCommand(admin, "s7", { ...reviewed, included: [1, 1] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      statisticsCommand(admin, "s7", { ...reviewed, included: [3] }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("retains reviewed repeated maps, refuses incomplete sources and survives provider failure", async () => {
    await statisticsCommand(admin, "s7", imported);
    await statisticsCommand(admin, "s7", { ...reviewed, included: [1, 4] });
    await statisticsCommand(admin, "s7", publish);
    expect(
      (await publicArchiveStatistics("s7", "one")).matchDetails[0].details.games
        .filter((g) => g.included)
        .map((g) => g.gameId),
    ).toEqual([1, 4]);
    vi.mocked(fetchMatchSource).mockRejectedValue(
      new Error("Provider unavailable"),
    );
    await expect(
      statisticsCommand(admin, "s7", { ...imported, expectedVersion: 3 }),
    ).rejects.toThrow("Provider unavailable");
    expect(
      (await statisticsWorkspace(admin, "s7", "one")).reviews[0].games.filter(
        (g) => g.included,
      ),
    ).toHaveLength(2);
    const incomplete = statisticsSource();
    incomplete.complete = false;
    incomplete.fingerprint = "b".repeat(64);
    vi.mocked(fetchMatchSource).mockResolvedValue(incomplete);
    await statisticsCommand(admin, "s7", { ...imported, expectedVersion: 3 });
    await statisticsCommand(admin, "s7", { ...reviewed, expectedVersion: 4 });
    await expect(
      statisticsCommand(admin, "s7", {
        ...publish,
        expectedVersions: { "999177": 5 },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("serializes concurrent review writes and performs no audit mutation on an identical refresh", async () => {
    await statisticsCommand(admin, "s7", imported);
    const results = await Promise.allSettled([
      statisticsCommand(admin, "s7", reviewed),
      statisticsCommand(admin, "s7", reviewed),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const count = (await db().select().from(editionEvents)).length;
    await statisticsCommand(admin, "s7", { ...imported, expectedVersion: 2 });
    expect((await statisticsWorkspace(admin, "s7")).summaries[0].version).toBe(
      2,
    );
    expect(await db().select().from(editionEvents)).toHaveLength(count);
  });
  it("hides unpublished editions and stale archive releases", async () => {
    await statisticsCommand(admin, "s7", imported);
    await statisticsCommand(admin, "s7", reviewed);
    await statisticsCommand(admin, "s7", publish);
    const changed = structuredClone(statisticsArchive);
    changed.matches[0].score = [3, 0];
    await seedEditions(
      [
        {
          ...edition,
          slug: "s7",
          status: "completed",
          registration: null,
          published: true,
          archive: changed,
        },
      ],
      true,
    );
    expect((await publicArchiveStatistics("s7", "one")).plays).toHaveLength(0);
    expect(
      (await publicArchiveStatistics("s7", "one")).matchDetails,
    ).toHaveLength(0);
    // Re-seed the edition as private: no public projection, even with stored statistics.
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        status: "completed",
        registration: null,
        published: false,
        archive: statisticsArchive,
      },
    ]);
    await expect(publicArchiveStatistics("s7", "one")).rejects.toMatchObject({
      status: 404,
    });
  });
});
