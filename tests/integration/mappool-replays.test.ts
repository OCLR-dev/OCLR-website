import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  realpath,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  editionState,
  users,
  staffRoles,
  mappools,
  mappoolEntries,
  mappoolReplays,
  mappoolEvents,
} from "../../src/db/schema";
import {
  replayList,
  uploadMappoolReplay,
  deleteMappoolReplay,
  downloadMappoolReplay,
} from "../../src/lib/mappool-replays";
import { cleanupReplayFiles } from "../../src/lib/replay-storage";
import {
  mappoolCommand,
  mappoolWorkspace,
  publicMappools,
} from "../../src/lib/mappools";
import { statisticsArchive } from "../fixtures/archive-statistics";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { syntheticReplay, replayChecksum } from "../fixtures/replay";
import { fetchBeatmap } from "../../src/lib/osu-beatmaps";
vi.mock("../../src/lib/osu-beatmaps", async (original) => ({
  ...(await original<typeof import("../../src/lib/osu-beatmaps")>()),
  fetchBeatmap: vi.fn(),
}));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 185001, username: "Synthetic Admin" },
  mapper = { osuId: 185002, username: "Synthetic Mapper" },
  tester = { osuId: 185003, username: "Synthetic Tester" },
  developer = { osuId: 185004, username: "Synthetic Developer" },
  outsider = { osuId: 185005, username: "Synthetic Outsider" };
const metadata = {
  setId: 1,
  title: "Synthetic map",
  artist: "Synthetic artist",
  difficulty: "Synthetic difficulty",
  mapper: "Synthetic mapper",
  stars: 4,
  bpm: 180,
  duration: 120,
  mode: "osu" as const,
  checksum: replayChecksum,
};
let root: string, poolId: string, entryId: string;
const version = async () =>
  (await db().select().from(mappools).where(eq(mappools.id, poolId)))[0]
    .version;
const command = async () => ({
  confirmed: true as const,
  expectedVersion: await version(),
});
const upload = async (
  actor = tester,
  bytes = syntheticReplay(),
  input?: object,
) =>
  uploadMappoolReplay(
    actor,
    edition.slug,
    entryId,
    input ?? (await command()),
    "示范 replay.osr",
    "Synthetic description",
    bytes,
  );
describe.skipIf(!url)("private replay attachment lifecycle", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    root = await realpath(await mkdtemp(join(tmpdir(), "oclr-185-media-")));
    vi.stubEnv("OCLR_MEDIA_DIR", root);
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([edition, { ...edition, slug: "other-test-cup" }]);
    await db()
      .insert(users)
      .values([admin, mapper, tester, developer, outsider]);
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
          userId: tester.osuId,
          role: "tester",
          editionSlug: edition.slug,
          grantedBy: admin.osuId,
        },
        {
          userId: developer.osuId,
          role: "developer",
          editionSlug: null,
          grantedBy: admin.osuId,
        },
      ]);
    await rm(join(root, "replays"), { recursive: true, force: true });
    vi.mocked(fetchBeatmap)
      .mockReset()
      .mockImplementation(async (beatmapId) => ({
        beatmapId,
        metadata,
        fetchedAt: new Date(0).toISOString(),
        fingerprint: "a".repeat(64),
      }));
    let data = await mappoolCommand(mapper, edition.slug, {
      action: "round_create",
      stage: "group",
      name: "Synthetic Round",
      position: 1,
      confirmed: true,
    });
    data = await mappoolCommand(mapper, edition.slug, {
      action: "pool_create",
      roundId: data.rounds[0].id,
      name: "Synthetic Pool",
      confirmed: true,
    });
    poolId = data.pools[0].id;
    data = await mappoolCommand(mapper, edition.slug, {
      action: "entry_save",
      poolId,
      entryId: null,
      beatmap: "123",
      category: "NM",
      position: 1,
      ...(await command()),
    });
    entryId = data.entries[0].id;
  });
  afterAll(async () => {
    await closeDb();
    await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  it("allows uploads and deletions without a window and after legacy deadlines", async () => {
    const initial = await upload();
    expect(
      (
        await deleteMappoolReplay(
          tester,
          edition.slug,
          entryId,
          initial.id,
          await command(),
        )
      ).removed,
    ).toBe(true);
    await db()
      .update(mappools)
      .set({ selectionLockedAt: new Date(), showcaseAt: new Date(0) })
      .where(eq(mappools.id, poolId));
    const result = await upload();
    expect(
      (await downloadMappoolReplay(tester, edition.slug, entryId, result.id))
        .bytes,
    ).toEqual(syntheticReplay());
    expect((await replayList(tester, edition.slug, entryId))[0]).toMatchObject({
      verification: "matched",
      uploaderId: tester.osuId,
      summary: { playerName: "Synthetic Replay Player" },
    });
    for (const action of [
      { action: "entry_remove", entryId },
      {
        action: "entry_save",
        entryId,
        beatmap: "456",
        category: "NM",
        position: 1,
      },
    ])
      await expect(
        mappoolCommand(mapper, edition.slug, {
          ...action,
          poolId,
          ...(await command()),
        }),
      ).rejects.toMatchObject({ status: 409 });
    await mappoolCommand(mapper, edition.slug, {
      action: "pool_publish",
      published: true,
      poolId,
      ...(await command()),
    });
    expect(JSON.stringify(await publicMappools(edition.slug))).not.toMatch(
      /replay|uploader|sha256|showcase|selectionLocked/i,
    );
    await db()
      .update(mappools)
      .set({ lockedAt: new Date() })
      .where(eq(mappools.id, poolId));
    await upload(tester, syntheticReplay({ player: "Another literal player" }));
    expect(
      (
        await deleteMappoolReplay(
          tester,
          edition.slug,
          entryId,
          result.id,
          await command(),
        )
      ).removed,
    ).toBe(true);
  });
  it("rejects the retired window-setting command without creating another selection lock", async () => {
    await expect(
      mappoolCommand(mapper, edition.slug, {
        action: "replay_window",
        poolId,
        showcaseAt: new Date(Date.now() + 3600000).toISOString(),
        lockSelection: true,
        ...(await command()),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await db().select().from(mappools).where(eq(mappools.id, poolId)))[0],
    ).toMatchObject({ selectionLockedAt: null, showcaseAt: null, version: 1 });
  });
  it("separates scoped Tester writes from Developer reads, rejects cross-edition IDs and applies revocation", async () => {
    const r = await upload(admin);
    await db().insert(staffRoles).values({
      userId: outsider.osuId,
      role: "replayer",
      editionSlug: edition.slug,
      grantedBy: admin.osuId,
    });
    await upload(outsider, syntheticReplay({ player: "Replayer file" }));
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, outsider.osuId));
    expect(await mappoolWorkspace(tester, edition.slug)).toHaveProperty(
      "entries",
    );
    expect(await replayList(developer, edition.slug, entryId)).toHaveLength(2);
    expect(
      (await downloadMappoolReplay(developer, edition.slug, entryId, r.id))
        .bytes,
    ).toEqual(syntheticReplay());
    for (const actor of [developer, outsider, mapper]) {
      await expect(upload(actor)).rejects.toMatchObject({ status: 403 });
      await expect(
        deleteMappoolReplay(
          actor,
          edition.slug,
          entryId,
          r.id,
          await command(),
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      downloadMappoolReplay(admin, "other-test-cup", entryId, r.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      downloadMappoolReplay(tester, "other-test-cup", entryId, r.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      downloadMappoolReplay(admin, edition.slug, randomUUID(), r.id),
    ).rejects.toMatchObject({ status: 404 });
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, tester.osuId));
    await expect(
      replayList(tester, edition.slug, entryId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(upload()).rejects.toMatchObject({ status: 403 });
  });
  it("deduplicates concurrent retries and audits every actual change once", async () => {
    const input = await command(),
      bytes = syntheticReplay();
    const results = await Promise.all([
      upload(tester, bytes, input),
      upload(admin, bytes, input),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(await replayList(tester, edition.slug, entryId)).toHaveLength(1);
    const events = await db()
      .select()
      .from(mappoolEvents)
      .where(eq(mappoolEvents.action, "replay_upload"));
    expect(events).toHaveLength(1);
    expect([tester.osuId, admin.osuId]).toContain(events[0].actorId);
    expect((await upload(tester, bytes, input)).duplicate).toBe(true);
    const deletion = await command();
    await deleteMappoolReplay(
      tester,
      edition.slug,
      entryId,
      results[0].id,
      deletion,
    );
    await deleteMappoolReplay(
      tester,
      edition.slug,
      entryId,
      results[0].id,
      deletion,
    );
    expect(await readdir(join(root, "replays"))).toEqual([]);
    expect(await replayList(tester, edition.slug, entryId)).toEqual([]);
    expect(
      await db()
        .select()
        .from(mappoolEvents)
        .where(eq(mappoolEvents.action, "replay_delete")),
    ).toHaveLength(1);
  });
  it("rejects mismatches, stale concurrent edits, excess count and bad filenames without writes", async () => {
    await expect(
      upload(tester, syntheticReplay({ md5: "c".repeat(32) })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      upload(tester, syntheticReplay({ mode: 1 })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      uploadMappoolReplay(
        tester,
        edition.slug,
        entryId,
        await command(),
        "../bad.osr",
        "",
        syntheticReplay(),
      ),
    ).rejects.toMatchObject({ status: 400 });
    const input = await command();
    const outcomes = await Promise.allSettled([
      upload(tester, syntheticReplay({ player: "One" }), input),
      upload(tester, syntheticReplay({ player: "Two" }), input),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    for (let i = 1; i < 10; i++)
      await upload(tester, syntheticReplay({ player: `Player ${i}` }));
    await expect(
      upload(tester, syntheticReplay({ player: "Over limit" })),
    ).rejects.toMatchObject({ status: 409 });
    expect(await replayList(tester, edition.slug, entryId)).toHaveLength(10);
  });
  it("labels absent official checksums unverified, never treats replay name as account data", async () => {
    await db()
      .update(mappoolEntries)
      .set({ metadata: { ...metadata, checksum: null } })
      .where(eq(mappoolEntries.id, entryId));
    await upload(tester, syntheticReplay({ player: admin.username }));
    expect((await replayList(tester, edition.slug, entryId))[0]).toMatchObject({
      verification: "unverified",
      uploaderId: tester.osuId,
    });
    expect(
      (await db().select().from(users).where(eq(users.osuId, tester.osuId)))[0]
        .username,
    ).toBe(tester.username);
  });
  it("rolls back metadata/audit failures, detects missing files, retains files across releases and restores backups", async () => {
    const bytes = syntheticReplay();
    await db().execute(
      sql`CREATE FUNCTION oclr_test_fail_replay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$`,
    );
    try {
      await db().execute(
        sql`CREATE TRIGGER oclr_test_fail_replay BEFORE INSERT ON mappool_events FOR EACH ROW EXECUTE FUNCTION oclr_test_fail_replay()`,
      );
      await expect(upload()).rejects.toThrow();
      expect(await db().select().from(mappoolReplays)).toHaveLength(0);
      expect(await readdir(join(root, "replays"))).toEqual([]);
    } finally {
      await db().execute(sql`DROP FUNCTION oclr_test_fail_replay() CASCADE`);
    }
    vi.stubEnv("OCLR_MEDIA_DIR", "/does-not-exist/oclr-media");
    await expect(upload()).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("OCLR_MEDIA_DIR", root);
    const r = await upload();
    const file = join(root, "replays", `${r.id}.osr`),
      backup = await readFile(file);
    await rename(file, file + ".backup");
    await expect(
      downloadMappoolReplay(tester, edition.slug, entryId, r.id),
    ).rejects.toMatchObject({ status: 503 });
    await writeFile(file, backup, { mode: 0o600 });
    expect(
      (await downloadMappoolReplay(tester, edition.slug, entryId, r.id)).bytes,
    ).toEqual(bytes);
    const orphan = randomUUID();
    await writeFile(join(root, "replays", orphan + ".osr"), bytes);
    await utimes(
      join(root, "replays", orphan + ".osr"),
      new Date(0),
      new Date(0),
    );
    await utimes(file, new Date(0), new Date(0));
    expect(await cleanupReplayFiles(new Set([r.id]))).toBe(1);
    expect(await readFile(file)).toEqual(bytes);
  });
  it("blocks silent reassociation after slot moves, replacement or removal and protects archived writes", async () => {
    await upload();
    for (const action of [
      { action: "entry_remove", entryId },
      { action: "batch_remove", entryIds: [entryId] },
      {
        action: "entry_save",
        entryId,
        beatmap: "456",
        category: "NM",
        position: 1,
      },
    ])
      await expect(
        mappoolCommand(mapper, edition.slug, {
          ...action,
          poolId,
          ...(await command()),
        }),
      ).rejects.toMatchObject({ status: 409 });
    await mappoolCommand(mapper, edition.slug, {
      action: "batch_move",
      entryIds: [entryId],
      category: "HD",
      position: 1,
      poolId,
      ...(await command()),
    });
    expect(await replayList(tester, edition.slug, entryId)).toHaveLength(1);
    const [state] = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, edition.slug));
    await db()
      .update(editionState)
      .set({
        configuration: {
          ...state.configuration!,
          archive: statisticsArchive,
        },
      })
      .where(eq(editionState.slug, edition.slug));
    await expect(upload()).rejects.toMatchObject({ status: 409 });
  });
});
