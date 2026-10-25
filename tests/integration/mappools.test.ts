let fixtureEditions: unknown[];
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
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
import { db, closeDb } from "../../src/db";
import {
  editionState,
  users,
  staffRoles,
  mappools,
  mappoolEntries,
  mappoolEvents,
  tournamentRounds,
} from "../../src/db/schema";
import {
  previewBeatmap,
  previewMappoolBatch,
  mappoolCommand,
  mappoolWorkspace,
  publicMappools,
} from "../../src/lib/mappools";
import { fetchBeatmap, fetchBeatmaps } from "../../src/lib/osu-beatmaps";
import { osuApi } from "../../src/lib/osu-api";
import { syntheticScoringRules } from "../fixtures/match";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
import { HttpError } from "../../src/lib/http";
import { edition } from "../fixtures/edition";
vi.mock("../../src/lib/osu-beatmaps", async (original) => ({
  ...(await original<typeof import("../../src/lib/osu-beatmaps")>()),
  fetchBeatmap: vi.fn(),
  fetchBeatmaps: vi.fn(),
}));
const metadata = {
  setId: 1,
  artist: "Synthetic Artist",
  title: "Synthetic Song",
  difficulty: "Synthetic Difficulty",
  mapper: "Synthetic Mapper",
  stars: 4.5,
  bpm: 180,
  duration: 123,
};
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 190001, username: "Synthetic Admin" };
const mapper = { osuId: 190002, username: "Synthetic Mappooler" };
const referee = { osuId: 190003, username: "Synthetic Referee" };
const player = { osuId: 190004, username: "Synthetic Player" };
const confirm = { confirmed: true };
const auditEvents = () =>
  db()
    .select()
    .from(mappoolEvents)
    .orderBy(mappoolEvents.createdAt, mappoolEvents.id);
describe.skipIf(!url)("edition mappool integrity and publication", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    fixtureEditions = [
      edition,
      { ...edition, slug: "other-test-cup" },
      { ...edition, slug: "private-test-cup", published: false },
    ];
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.mocked(fetchBeatmap)
      .mockReset()
      .mockImplementation(async (id) => ({
        beatmapId: id,
        metadata,
        fetchedAt: "2026-01-01T00:00:00.000Z",
        fingerprint: "a".repeat(64),
      }));
    vi.mocked(fetchBeatmaps)
      .mockReset()
      .mockImplementation(
        async (ids) =>
          new Map(
            await Promise.all(
              [...new Set(ids)].map(
                async (id) => [id, await fetchBeatmap(id)] as const,
              ),
            ),
          ),
      );
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions(fixtureEditions);
    await db().insert(users).values([admin, mapper, referee, player]);
    await db()
      .insert(editionState)
      .values({ slug: edition.slug })
      .onConflictDoNothing();
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: mapper.osuId,
          role: "mappooler",
          editionSlug: edition.slug,
          grantedBy: admin.osuId,
        },
        {
          userId: referee.osuId,
          role: "referee",
          editionSlug: edition.slug,
          grantedBy: admin.osuId,
        },
      ]);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function create(
    stage = "group",
    slug = edition.slug,
    roundName = "Synthetic Round",
  ) {
    let data = await mappoolCommand(admin, slug, {
      ...confirm,
      action: "round_create",
      stage,
      name: roundName,
      position: 1,
    });
    data = await mappoolCommand(admin, slug, {
      ...confirm,
      action: "pool_create",
      roundId: data.rounds.find(
        (r) => r.name === roundName && r.stage === stage,
      )!.id,
      name: "Synthetic Pool",
    });
    return data.pools.find(
      (p) =>
        p.roundId ===
        data.rounds.find((r) => r.name === roundName && r.stage === stage)!.id,
    )!;
  }
  const add = (
    poolId: string,
    expectedVersion: number,
    position = 1,
    category = "NM",
    beatmap = "123",
  ) => ({
    ...confirm,
    action: "entry_save",
    poolId,
    expectedVersion,
    entryId: null,
    category,
    position,
    beatmap,
  });
  it("protects preview lookups by role and edition without writing an audit event", async () => {
    for (const actor of [referee, player])
      await expect(
        previewBeatmap(actor, edition.slug, { beatmap: "123" }),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      previewBeatmap(mapper, "other-test-cup", { beatmap: "123" }),
    ).rejects.toMatchObject({ status: 403 });
    for (const input of [
      { beatmap: "https://evil.example/123" },
      { beatmap: "123", actorId: admin.osuId },
      { beatmap: "" },
    ])
      await expect(
        previewBeatmap(mapper, edition.slug, input),
      ).rejects.toMatchObject({ status: 400 });
    expect(fetchBeatmap).not.toHaveBeenCalled();
    expect(
      await previewBeatmap(mapper, edition.slug, {
        beatmap: "https://osu.ppy.sh/beatmapsets/42#osu/123",
      }),
    ).toMatchObject({ beatmapId: 123, metadata });
    expect(
      await previewBeatmap(admin, edition.slug, { beatmap: "123" }),
    ).toMatchObject({ beatmapId: 123 });
    expect(await db().select().from(mappoolEvents)).toEqual([]);
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, mapper.osuId));
    await expect(
      previewBeatmap(mapper, edition.slug, { beatmap: "123" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("verifies metadata on Save and refuses a changed preview or browser-supplied metadata", async () => {
    const pool = await create();
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...add(pool.id, 0),
        metadata: { title: "Forged" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...add(pool.id, 0),
        expectedMetadataFingerprint: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await mappoolWorkspace(mapper, edition.slug)).entries).toEqual([]);
    const preview = await previewBeatmap(mapper, edition.slug, {
      beatmap: "123",
    });
    let data = await mappoolCommand(mapper, edition.slug, {
      ...add(pool.id, 0),
      expectedMetadataFingerprint: preview.fingerprint,
    });
    expect(data.entries[0]).toMatchObject({
      metadata: preview.metadata,
      metadataFetchedAt: new Date(preview.fetchedAt),
    });
    vi.mocked(fetchBeatmap).mockResolvedValue({
      ...preview,
      metadata: { ...metadata, title: "Changed upstream" },
      fetchedAt: "2026-01-02T00:00:00.000Z",
      fingerprint: "c".repeat(64),
    });
    data = await mappoolCommand(mapper, edition.slug, {
      ...add(pool.id, 1),
      entryId: data.entries[0].id,
    });
    expect(data.entries[0].metadata.title).toBe("Changed upstream");
    expect(
      (await auditEvents()).filter((e) => e.action === "entry_save"),
    ).toHaveLength(2);
  });
  it("automatically records actor, target, versions and map changes without a reason", async () => {
    const pool = await create();
    let data = await mappoolCommand(mapper, edition.slug, add(pool.id, 0));
    const entry = data.entries[0];
    data = await mappoolCommand(mapper, edition.slug, {
      ...add(pool.id, 1, 1, "NM", "456"),
      entryId: entry.id,
    });
    const event = (await auditEvents()).find(
      (e) =>
        e.action === "entry_save" &&
        (e.after.pool as { version: number } | undefined)?.version === 2,
    )!;
    expect(event).toMatchObject({
      actorId: mapper.osuId,
      editionSlug: edition.slug,
      poolId: pool.id,
      reason: null,
    });
    expect(event.createdAt).toBeInstanceOf(Date);
    expect(event.before).toMatchObject({
      pool: { version: 1 },
      entries: [{ id: entry.id, beatmapId: 123 }],
    });
    expect(event.after).toMatchObject({
      pool: { version: 2 },
      entries: [{ id: entry.id, beatmapId: 456 }],
    });
    const count = (await auditEvents()).length;
    for (const forged of [
      { actorId: admin.osuId },
      { createdAt: new Date().toISOString() },
      { reason: "Client-supplied generic audit explanation" },
    ])
      await expect(
        mappoolCommand(mapper, edition.slug, {
          ...add(pool.id, 2, 2),
          ...forged,
        }),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      mappoolCommand(mapper, edition.slug, add(pool.id, 0, 2)),
    ).rejects.toMatchObject({ status: 409 });
    expect(await auditEvents()).toHaveLength(count);
  });
  it("rolls back the mutation when its transactional audit write fails and retains historical notes", async () => {
    const pool = await create();
    await db()
      .insert(mappoolEvents)
      .values({
        editionSlug: edition.slug,
        poolId: pool.id,
        actorId: admin.osuId,
        action: "historical_review",
        reason: "Historical organizer explanation",
        after: { id: pool.id },
      });
    const before = await mappoolWorkspace(mapper, edition.slug);
    const beforeEvents = await auditEvents();
    await db().execute(
      sql`CREATE FUNCTION oclr_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic unavailable audit sink'; END $$`,
    );
    try {
      await db().execute(
        sql`CREATE TRIGGER oclr_test_fail_audit BEFORE INSERT ON mappool_events FOR EACH ROW EXECUTE FUNCTION oclr_test_fail_audit()`,
      );
      await expect(
        mappoolCommand(mapper, edition.slug, add(pool.id, 0)),
      ).rejects.toThrow();
      const after = await mappoolWorkspace(mapper, edition.slug);
      expect(after.pools).toEqual(before.pools);
      expect(after.entries).toEqual(before.entries);
      expect(await auditEvents()).toEqual(beforeEvents);
      expect(
        (await auditEvents()).some(
          (e) => e.reason === "Historical organizer explanation",
        ),
      ).toBe(true);
    } finally {
      await db().execute(sql`DROP FUNCTION oclr_test_fail_audit() CASCADE`);
    }
  });
  it("allows scoped Mappoolers and Admins while denying Referees, players and cross-edition access", async () => {
    expect((await mappoolWorkspace(mapper, edition.slug)).pools).toEqual([]);
    for (const user of [referee, player]) {
      await expect(mappoolWorkspace(user, edition.slug)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        mappoolCommand(user, edition.slug, {}),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      mappoolWorkspace(mapper, "other-test-cup"),
    ).rejects.toMatchObject({ status: 403 });
    await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "round_create",
      stage: "group",
      name: "Synthetic Round",
      position: 1,
    });
  });
  it("isolates group/knockout rounds and editions, rejecting cross-edition references", async () => {
    const group = await create();
    const knockout = await create("knockout");
    const other = await create("group", "other-test-cup");
    const data = await mappoolWorkspace(mapper, edition.slug);
    expect(data.rounds.map((r) => r.stage)).toEqual(["group", "knockout"]);
    expect(data.pools.map((p) => p.id).sort()).toEqual(
      [group.id, knockout.id].sort(),
    );
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...confirm,
        action: "pool_create",
        roundId: other.roundId,
        name: "Wrong scope",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      mappoolCommand(mapper, edition.slug, add(other.id, 0)),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchBeatmap).not.toHaveBeenCalled();
  });
  it("rejects duplicate slots in both commands and database constraints and commits one concurrent version", async () => {
    const pool = await create();
    const results = await Promise.allSettled([
      mappoolCommand(mapper, edition.slug, add(pool.id, 0)),
      mappoolCommand(mapper, edition.slug, add(pool.id, 0, 2)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const [entry] = await db().select().from(mappoolEntries);
    await expect(
      mappoolCommand(mapper, edition.slug, add(pool.id, 1, entry.position)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      db().insert(mappoolEntries).values({
        poolId: pool.id,
        category: entry.category,
        position: entry.position,
        beatmapId: 456,
        metadata,
      }),
    ).rejects.toThrow();
    expect(
      (await mappoolWorkspace(mapper, edition.slug)).pools[0].version,
    ).toBe(1);
  });
  it("supports explicit FM policies, replacement, ordering, removal and audited publication revisions", async () => {
    const pool = await create();
    await expect(
      mappoolCommand(mapper, edition.slug, add(pool.id, 0, 1, "FM")),
    ).rejects.toMatchObject({ status: 409 });
    let data = await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "pool_settings",
      poolId: pool.id,
      expectedVersion: 0,
      name: pool.name,
      fmMode: "force_mod",
      fmRestrictions: "Synthetic test policy only",
    });
    data = await mappoolCommand(
      mapper,
      edition.slug,
      add(pool.id, data.pools[0].version, 1, "FM"),
    );
    data = await mappoolCommand(
      mapper,
      edition.slug,
      add(pool.id, data.pools[0].version, 1),
    );
    data = await mappoolCommand(
      mapper,
      edition.slug,
      add(pool.id, data.pools[0].version, 2),
    );
    let nm = data.entries.filter((e) => e.category === "NM");
    const order = nm.map((e) => e.id).reverse();
    data = await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "reorder",
      poolId: pool.id,
      expectedVersion: data.pools[0].version,
      category: "NM",
      entryIds: order,
    });
    nm = data.entries.filter((e) => e.category === "NM");
    expect(nm.map((e) => e.id)).toEqual(order);
    data = await mappoolCommand(mapper, edition.slug, {
      ...add(pool.id, data.pools[0].version),
      entryId: nm[0].id,
      beatmap: "https://osu.ppy.sh/beatmapsets/1#osu/456",
    });
    expect(data.entries.find((e) => e.id === nm[0].id)?.beatmapId).toBe(456);
    data = await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "pool_publish",
      poolId: pool.id,
      expectedVersion: data.pools[0].version,
      published: true,
    });
    const [published] = await publicMappools(edition.slug, pool.id);
    expect(published.fmMode).toBe("force_mod");
    expect(published.fmRestrictions).toBe("Synthetic test policy only");
    data = await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "entry_remove",
      poolId: pool.id,
      expectedVersion: data.pools[0].version,
      entryId: nm[0].id,
    });
    expect(
      (await publicMappools(edition.slug, pool.id))[0].entries.some(
        (e) => e.id === nm[0].id,
      ),
    ).toBe(false);
    expect(data.pools[0].publishedAt).not.toBeNull();
    data = await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "pool_publish",
      poolId: pool.id,
      expectedVersion: data.pools[0].version,
      published: false,
    });
    expect(await publicMappools(edition.slug, pool.id)).toEqual([]);
    const fm = data.entries.find((e) => e.category === "FM")!;
    data = await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "entry_remove",
      poolId: pool.id,
      expectedVersion: data.pools[0].version,
      entryId: fm.id,
    });
    await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "pool_settings",
      poolId: pool.id,
      expectedVersion: data.pools[0].version,
      name: pool.name,
      fmMode: null,
      fmRestrictions: "",
    });
    const events = await db()
      .select()
      .from(mappoolEvents)
      .where(eq(mappoolEvents.poolId, pool.id));
    expect(
      events.some((e) => e.action === "pool_publish" && e.before && e.after),
    ).toBe(true);
    expect(
      events.every(
        (e) => e.actorId === admin.osuId || e.actorId === mapper.osuId,
      ),
    ).toBe(true);
  });
  it("never returns draft pools or unpublished editions, including guessed direct IDs", async () => {
    const pool = await create();
    await mappoolCommand(mapper, edition.slug, add(pool.id, 0));
    expect(await publicMappools(edition.slug)).toEqual([]);
    expect(await publicMappools(edition.slug, pool.id)).toEqual([]);
    expect(await publicMappools("other-test-cup", pool.id)).toEqual([]);
    const privatePool = await create("group", "private-test-cup");
    await mappoolCommand(admin, "private-test-cup", add(privatePool.id, 0));
    await mappoolCommand(admin, "private-test-cup", {
      ...confirm,
      action: "pool_publish",
      poolId: privatePool.id,
      expectedVersion: 1,
      published: true,
    });
    expect(await publicMappools("private-test-cup", privatePool.id)).toEqual(
      [],
    );
    expect(await publicMappools(edition.slug, "not-a-uuid")).toEqual([]);
  });
  it("retains existing metadata and versions when official API refresh or replacement fails", async () => {
    const pool = await create();
    const data = await mappoolCommand(mapper, edition.slug, add(pool.id, 0));
    const entry = data.entries[0];
    await db()
      .update(mappoolEntries)
      .set({ metadataFetchedAt: new Date(0) })
      .where(eq(mappoolEntries.id, entry.id));
    vi.mocked(fetchBeatmap).mockRejectedValue(
      new HttpError(404, "Synthetic deleted map"),
    );
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...confirm,
        action: "entry_refresh",
        poolId: pool.id,
        expectedVersion: 1,
        entryId: entry.id,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...add(pool.id, 1),
        entryId: entry.id,
        beatmap: "789",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await mappoolWorkspace(mapper, edition.slug)).entries[0],
    ).toMatchObject({ beatmapId: 123, metadata });
    expect(
      (await mappoolWorkspace(mapper, edition.slug)).pools[0].version,
    ).toBe(1);
  });
  it("protects completed-fixture pools and their round labels even after unpublishing", async () => {
    const pool = await create();
    const data = await mappoolCommand(mapper, edition.slug, add(pool.id, 0));
    await db()
      .update(mappools)
      .set({ lockedAt: new Date() })
      .where(eq(mappools.id, pool.id));
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...confirm,
        action: "entry_remove",
        poolId: pool.id,
        expectedVersion: 1,
        entryId: data.entries[0].id,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const [round] = await db()
      .select()
      .from(tournamentRounds)
      .where(eq(tournamentRounds.id, pool.roundId));
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...confirm,
        action: "round_edit",
        roundId: round.id,
        expectedVersion: round.version,
        name: "Changed",
        position: 2,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("previews mixed formats, conflicts and duplicate entries without changing saved maps", async () => {
    const pool = await create();
    const preview = await previewMappoolBatch(mapper, edition.slug, {
      poolId: pool.id,
      expectedVersion: 0,
      text: "NM1 123\nHD1 https://osu.ppy.sh/beatmaps/456\nDT1 https://osu.ppy.sh/beatmapsets/42#osu/123\nNM1 789\nNM2 123\nTB https://osu.ppy.sh/beatmapsets/42",
    });
    expect(preview.rows.slice(0, 3).every((r) => r.snapshot && !r.error)).toBe(
      true,
    );
    expect(preview.rows[2].warning).toContain("reused");
    expect(preview.rows.slice(3).every((r) => r.error)).toBe(true);
    expect((await mappoolWorkspace(mapper, edition.slug)).entries).toHaveLength(
      0,
    );
    // Replay roles can read the workspace but must not spend batch lookups.
    const tester = { osuId: 190005, username: "Synthetic Tester" };
    await db().insert(users).values(tester);
    await db().insert(staffRoles).values({
      userId: tester.osuId,
      role: "tester",
      editionSlug: edition.slug,
      grantedBy: admin.osuId,
    });
    vi.mocked(fetchBeatmaps).mockClear();
    for (const actor of [referee, player, tester])
      await expect(
        previewMappoolBatch(actor, edition.slug, {
          poolId: pool.id,
          expectedVersion: 0,
          text: "NM1 123",
        }),
      ).rejects.toMatchObject({ status: 403 });
    expect(fetchBeatmaps).not.toHaveBeenCalled();
  });
  async function batch(
    poolId: string,
    expectedVersion = 0,
    text = "NM1 123\nHD1 456",
  ) {
    const p = await previewMappoolBatch(mapper, edition.slug, {
      poolId,
      expectedVersion,
      text,
    });
    return {
      ...confirm,
      action: "batch_import",
      text,
      category: "NM",
      poolId,
      expectedVersion,
      rows: p.rows.map((r) => ({
        category: r.category,
        position: r.position,
        beatmap: String(r.beatmapId),
        expectedMetadataFingerprint: r.snapshot?.fingerprint,
      })),
    };
  }
  it("saves one atomic batch revision and audit, rejects stale/colliding/forged requests", async () => {
    const pool = await create();
    const payload = await batch(pool.id);
    const outcomes = await Promise.allSettled([
      mappoolCommand(mapper, edition.slug, payload),
      mappoolCommand(admin, edition.slug, payload),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect((await mappoolWorkspace(mapper, edition.slug)).entries).toHaveLength(
      2,
    );
    expect(
      (await auditEvents()).filter((e) => e.action === "batch_import"),
    ).toHaveLength(1);
    await expect(
      mappoolCommand(mapper, edition.slug, { ...payload, expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...payload,
        expectedVersion: 1,
        rows: [
          {
            ...payload.rows[0],
            position: 2,
            expectedMetadataFingerprint: "b".repeat(64),
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 409 });
    const p = await previewMappoolBatch(mapper, edition.slug, {
      poolId: pool.id,
      expectedVersion: 1,
      text: "NM1 789",
    });
    expect(p.rows[0].error).toContain("exists");
  });
  it("resolves plain imports on the server, rejects forged slots before lookup and protects stale previews", async () => {
    const pool = await create();
    const first = await batch(
      pool.id,
      0,
      "123\nhttps://osu.ppy.sh/beatmaps/456\nhttps://osu.ppy.sh/beatmapsets/42#osu/789",
    );
    expect(first.rows.map((r) => r.position)).toEqual([1, 2, 3]);
    await mappoolCommand(mapper, edition.slug, first);
    const next = await batch(pool.id, 1, "42\n43\n44");
    expect(next.rows.map((r) => r.position)).toEqual([4, 5, 6]);
    vi.mocked(fetchBeatmaps).mockClear();
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...next,
        rows: next.rows.map((r, i) => ({ ...r, position: i + 7 })),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetchBeatmaps).not.toHaveBeenCalled();
    await mappoolCommand(mapper, edition.slug, next);
    await expect(
      mappoolCommand(mapper, edition.slug, next),
    ).rejects.toMatchObject({ status: 409 });
    const bad = await previewMappoolBatch(mapper, edition.slug, {
      poolId: pool.id,
      expectedVersion: 2,
      category: "NM",
      text: "123\nhttps://osu.ppy.sh/beatmaps/123",
    });
    expect(bad.rows.every((r) => r.error && !r.snapshot)).toBe(true);
    expect((await mappoolWorkspace(mapper, edition.slug)).entries).toHaveLength(
      6,
    );
  });
  it("inserts into occupied slots atomically, normalizes only the destination and preserves metadata", async () => {
    const pool = await create();
    await db()
      .insert(mappoolEntries)
      .values([
        ...[1, 2, 3, 4, 5].map((i) => ({
          poolId: pool.id,
          category: "NM" as const,
          position: i * 2,
          beatmapId: i,
          metadata,
        })),
        {
          poolId: pool.id,
          category: "HD" as const,
          position: 7,
          beatmapId: 99,
          metadata,
        },
      ]);
    const original = (await mappoolWorkspace(mapper, edition.slug)).entries;
    const nm = original.filter((e) => e.category === "NM");
    const payload = {
      ...confirm,
      action: "batch_move",
      poolId: pool.id,
      expectedVersion: 0,
      category: "NM",
      position: 2,
      entryIds: [nm[4].id],
    };
    const outcomes = await Promise.allSettled([
      mappoolCommand(mapper, edition.slug, payload),
      mappoolCommand(admin, edition.slug, { ...payload, position: 1 }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const winner = outcomes.find(
      (r) => r.status === "fulfilled",
    )! as PromiseFulfilledResult<Awaited<ReturnType<typeof mappoolCommand>>>;
    let data = winner.value;
    expect(data.entries.find((e) => e.category === "HD")).toEqual(
      original.find((e) => e.category === "HD"),
    );
    expect(
      data.entries.filter((e) => e.category === "NM").map((e) => e.position),
    ).toEqual([1, 2, 3, 4, 5]);
    const resultIds = data.entries
      .filter((e) => e.category === "NM")
      .map((e) => e.id);
    expect(resultIds).toEqual(
      outcomes[0].status === "fulfilled"
        ? [nm[0].id, nm[4].id, nm[1].id, nm[2].id, nm[3].id]
        : [nm[4].id, ...nm.slice(0, 4).map((e) => e.id)],
    );
    for (const entry of data.entries)
      expect(entry.metadata).toEqual(
        original.find((e) => e.id === entry.id)!.metadata,
      );
    const events = (await auditEvents()).filter(
      (e) => e.action === "batch_move",
    );
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(
      outcomes[0].status === "fulfilled" ? mapper.osuId : admin.osuId,
    );
    data = await mappoolCommand(mapper, edition.slug, {
      ...payload,
      expectedVersion: 1,
      category: "HD",
      position: 1,
      entryIds: [nm[4].id],
    });
    expect(
      data.entries.filter((e) => e.category === "HD").map((e) => e.beatmapId),
    ).toEqual([5, 99]);
    expect(
      data.entries.filter((e) => e.category === "HD").map((e) => e.position),
    ).toEqual([1, 2]);
    await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "pool_publish",
      poolId: pool.id,
      expectedVersion: 2,
      published: true,
    });
    expect(
      (await publicMappools(edition.slug, pool.id))[0].entries
        .filter((e) => e.category === "HD")
        .map((e) => e.beatmapId),
    ).toEqual([5, 99]);
    await mappoolCommand(mapper, edition.slug, {
      ...payload,
      expectedVersion: 3,
    });
    expect(
      (await publicMappools(edition.slug, pool.id))[0].publishedAt,
    ).not.toBeNull();
  });
  it("rolls back an occupied insertion when its audit fails and rejects locked/cross-edition reorder", async () => {
    const pool = await create();
    await mappoolCommand(
      mapper,
      edition.slug,
      await batch(pool.id, 0, "NM1 123\nNM2 456"),
    );
    const original = (await mappoolWorkspace(mapper, edition.slug)).entries;
    const payload = {
      ...confirm,
      action: "batch_move",
      poolId: pool.id,
      expectedVersion: 1,
      category: "NM",
      position: 1,
      entryIds: [original[1].id],
    };
    await db().execute(
      sql`CREATE FUNCTION oclr_test_fail_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic reorder audit failure'; END $$`,
    );
    try {
      await db().execute(
        sql`CREATE TRIGGER oclr_test_fail_move BEFORE INSERT ON mappool_events FOR EACH ROW EXECUTE FUNCTION oclr_test_fail_move()`,
      );
      await expect(
        mappoolCommand(mapper, edition.slug, payload),
      ).rejects.toThrow();
      const current = await mappoolWorkspace(mapper, edition.slug);
      expect(current.entries).toEqual(original);
      expect(current.pools[0].version).toBe(1);
    } finally {
      await db().execute(sql`DROP FUNCTION oclr_test_fail_move() CASCADE`);
    }
    const reorder = {
      ...confirm,
      action: "reorder",
      poolId: pool.id,
      expectedVersion: 1,
      category: "NM",
      entryIds: original.map((e) => e.id).reverse(),
    };
    for (const actor of [referee, player])
      await expect(
        mappoolCommand(actor, edition.slug, reorder),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      mappoolCommand(admin, "other-test-cup", reorder),
    ).rejects.toMatchObject({ status: 404 });
    await db()
      .update(mappools)
      .set({ lockedAt: new Date() })
      .where(eq(mappools.id, pool.id));
    await expect(
      mappoolCommand(mapper, edition.slug, reorder),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await auditEvents()).filter(
        (e) => e.action === "batch_move" || e.action === "reorder",
      ),
    ).toHaveLength(0);
  });
  it("rolls back every row and its audit on lookup, collision or audit failure", async () => {
    const pool = await create();
    const payload = await batch(pool.id);
    vi.mocked(fetchBeatmaps).mockResolvedValueOnce(
      new Map([[123, new HttpError(502, "Synthetic outage")]]),
    );
    await expect(
      mappoolCommand(mapper, edition.slug, payload),
    ).rejects.toMatchObject({ status: 502 });
    await db().execute(
      sql`CREATE FUNCTION oclr_test_fail_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic batch audit failure'; END $$`,
    );
    try {
      await db().execute(
        sql`CREATE TRIGGER oclr_test_fail_batch BEFORE INSERT ON mappool_events FOR EACH ROW EXECUTE FUNCTION oclr_test_fail_batch()`,
      );
      await expect(
        mappoolCommand(mapper, edition.slug, payload),
      ).rejects.toThrow();
      expect((await mappoolWorkspace(mapper, edition.slug)).entries).toEqual(
        [],
      );
      expect(
        (await auditEvents()).filter((e) => e.action === "batch_import"),
      ).toHaveLength(0);
    } finally {
      await db().execute(sql`DROP FUNCTION oclr_test_fail_batch() CASCADE`);
    }
  });
  it("moves, renumbers, refreshes and removes selected maps atomically while protecting published pools", async () => {
    const pool = await create();
    let data = await mappoolCommand(mapper, edition.slug, await batch(pool.id));
    const ids = data.entries.map((e) => e.id);
    const command = (action: string, extra: object = {}) =>
      mappoolCommand(mapper, edition.slug, {
        ...confirm,
        action,
        poolId: pool.id,
        expectedVersion: data.pools[0].version,
        entryIds: ids,
        ...extra,
      });
    data = await command("batch_move", { category: "DT", position: 1 });
    expect(data.entries.map((e) => e.position)).toEqual([1, 2]);
    expect(data.entries.every((e) => e.category === "DT")).toBe(true);
    await db()
      .update(mappoolEntries)
      .set({ metadataFetchedAt: new Date() })
      .where(eq(mappoolEntries.poolId, pool.id));
    await expect(command("batch_refresh")).rejects.toMatchObject({
      status: 429,
    });
    await db()
      .update(mappoolEntries)
      .set({ metadataFetchedAt: new Date(0) })
      .where(eq(mappoolEntries.poolId, pool.id));
    data = await command("batch_refresh");
    expect(data.pools[0].version).toBe(3);
    data = await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "pool_publish",
      poolId: pool.id,
      expectedVersion: 3,
      published: true,
    });
    await expect(command("batch_remove")).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await publicMappools(edition.slug, pool.id))[0].entries,
    ).toHaveLength(2);
    data = await mappoolCommand(mapper, edition.slug, {
      ...confirm,
      action: "pool_publish",
      poolId: pool.id,
      expectedVersion: data.pools[0].version,
      published: false,
    });
    data = await command("batch_remove");
    expect(data.entries).toEqual([]);
  });
  it("persists explicit attributes, preserves them on refresh failure and leaves FM/TB unconfigured", async () => {
    vi.mocked(fetchBeatmap).mockImplementation(async (id) => ({
      beatmapId: id,
      metadata: { ...metadata, mode: "osu", ar: 9, od: 8, cs: 4, hp: null },
      fetchedAt: new Date().toISOString(),
      fingerprint: "d".repeat(64),
    }));
    vi.mocked(osuApi)
      .mockReset()
      .mockResolvedValue({
        attributes: { star_rating: 6.75, max_combo: 1234, approach_rate: 10.3 },
      });
    const pool = await create();
    const preview = await previewBeatmap(mapper, edition.slug, {
      beatmap: "123",
      difficultyConfiguration: "DT",
    });
    let data = await mappoolCommand(mapper, edition.slug, {
      ...add(pool.id, 0),
      difficultyConfiguration: "DT",
      expectedMetadataFingerprint: preview.fingerprint,
    });
    expect(data.entries[0].metadata).toEqual(preview.metadata);
    expect(data.entries[0].metadata).toMatchObject({
      stars: 4.5,
      bpm: 180,
      attributes: { configuration: "DT", stars: 6.75 },
    });
    const entry = data.entries[0];
    data = await mappoolCommand(
      mapper,
      edition.slug,
      add(pool.id, 1, 1, "TB", "456"),
    );
    expect(
      data.entries.find((e) => e.category === "TB")?.metadata.attributes,
    ).toBeUndefined();
    await db()
      .update(mappoolEntries)
      .set({ metadataFetchedAt: new Date(0) })
      .where(eq(mappoolEntries.id, entry.id));
    vi.mocked(fetchBeatmap).mockResolvedValue({
      beatmapId: 123,
      metadata: { ...metadata, mode: "osu", title: "Changed provider map" },
      fetchedAt: new Date().toISOString(),
      fingerprint: "e".repeat(64),
    });
    vi.mocked(osuApi).mockRejectedValue(
      new HttpError(502, "Synthetic attributes outage"),
    );
    await expect(
      mappoolCommand(mapper, edition.slug, {
        ...confirm,
        action: "entry_refresh",
        poolId: pool.id,
        expectedVersion: 2,
        entryId: entry.id,
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(
      (await mappoolWorkspace(mapper, edition.slug)).entries.find(
        (e) => e.id === entry.id,
      )?.metadata,
    ).toEqual(entry.metadata);
    expect(
      (await mappoolWorkspace(mapper, edition.slug)).pools[0].version,
    ).toBe(2);
  });
  it("rejects maps from another ruleset only when the round explicitly configures one", async () => {
    const pool = await create();
    await db()
      .update(tournamentRounds)
      .set({ scoringRules: syntheticScoringRules })
      .where(eq(tournamentRounds.id, pool.roundId));
    vi.mocked(fetchBeatmap).mockResolvedValue({
      beatmapId: 123,
      metadata: { ...metadata, mode: "taiko" },
      fetchedAt: new Date().toISOString(),
      fingerprint: "a".repeat(64),
    });
    expect(
      (
        await previewMappoolBatch(mapper, edition.slug, {
          poolId: pool.id,
          expectedVersion: 0,
          text: "NM1 123",
        })
      ).rows[0].error,
    ).toContain("ruleset");
    await expect(
      mappoolCommand(mapper, edition.slug, add(pool.id, 0)),
    ).rejects.toMatchObject({ status: 400 });
    expect((await mappoolWorkspace(mapper, edition.slug)).entries).toEqual([]);
  });
});
