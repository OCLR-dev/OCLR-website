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
import { createHash, randomUUID } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import {
  realpath,
  mkdtemp,
  mkdir,
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
  mappoolBeatmapCache,
  mappoolReplays,
  mappoolEvents,
} from "../../src/db/schema";
import {
  replayList,
  uploadMappoolReplay,
  deleteMappoolReplay,
  downloadMappoolReplay,
  loadMappoolReplayPlaybackAsset,
  setPreferredMappoolReplay,
} from "../../src/lib/mappool-replays";
import { publicMappoolReplays } from "../../src/lib/public-mappool-replays";
import { GET as publicReplayAsset } from "../../src/app/api/tournaments/[edition]/mappools/[poolId]/entries/[entryId]/replay/[replayId]/[asset]/route";
import { cleanupReplayFiles } from "../../src/lib/replay-storage";
import {
  changeMappoolBeatmapCache,
  mappoolBeatmapCacheStatus,
} from "../../src/lib/mappool-beatmap-cache";
import { downloadBeatmapMirror } from "../../src/lib/beatmap-cache-mirror";
import { requireUser } from "../../src/lib/auth/user";
import { POST as postBeatmapCache } from "../../src/app/api/admin/tournaments/[edition]/mappools/entries/[entryId]/beatmap-cache/route";
import { mappoolCommand } from "../../src/lib/mappools";
import { mappoolWorkspace, publicMappools } from "../../src/lib/mappool-reads";
import { statisticsArchive } from "../fixtures/archive-statistics";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { syntheticReplay, replayChecksum } from "../fixtures/replay";
import { fetchBeatmap } from "../../src/lib/osu-beatmaps";
import {
  GET as getReplays,
  POST as postReplay,
} from "../../src/app/api/admin/tournaments/[edition]/mappools/entries/[entryId]/replays/route";
import { GET as playbackAsset } from "../../src/app/api/admin/tournaments/[edition]/mappools/entries/[entryId]/replays/[replayId]/playback/[asset]/route";
import {
  DELETE as removeReplay,
  PATCH as patchPreference,
} from "../../src/app/api/admin/tournaments/[edition]/mappools/entries/[entryId]/replays/[replayId]/route";
import {
  deleteReplayWrite,
  uploadReplayWrite,
} from "../../src/lib/replay-write-contract";
import { createSession, readSessionContext } from "../../src/lib/auth/sessions";
import { createDeveloperToken } from "../../src/lib/developer-api";
import { readApiRoute } from "../../src/lib/read-api";
import { reviveReadValue } from "../../src/lib/read-value";
import contracts from "../../src/lib/extended-read-contracts.json" with { type: "json" };
import { explicitReadContracts } from "../../src/lib/explicit-read-contracts";
vi.mock("../../src/lib/osu-beatmaps", async (original) => ({
  ...(await original<typeof import("../../src/lib/osu-beatmaps")>()),
  fetchBeatmap: vi.fn(),
}));
const url = process.env.TEST_DATABASE_URL;
const origin = "https://oclr.example.test";
const admin = { osuId: 185001, username: "Synthetic Admin" },
  mapper = { osuId: 185002, username: "Synthetic Mapper" },
  tester = { osuId: 185003, username: "Synthetic Tester" },
  developer = { osuId: 185004, username: "Synthetic Developer" },
  outsider = { osuId: 185005, username: "Synthetic Outsider" };
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: vi.fn(async () => tester),
}));
vi.mock("../../src/lib/beatmap-cache-mirror", async (original) => ({
  ...(await original<typeof import("../../src/lib/beatmap-cache-mirror")>()),
  downloadBeatmapMirror: vi.fn(),
}));
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
    vi.stubEnv("APP_URL", origin);
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
    await rm(join(root, "beatmaps"), { recursive: true, force: true });
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
  it("sets, replaces, and clears one preferred replay with versioned staff authorization", async () => {
    const first = await upload();
    const second = await upload(tester, syntheticReplay({ player: "Second" }));
    const path = `${origin}/api/admin/tournaments/${edition.slug}/mappools/entries/${entryId}/replays`;
    const params = { edition: edition.slug, entryId };
    const prefer = (
      replayId: string,
      expectedVersion: number,
      preferred = true,
    ) =>
      patchPreference(
        new Request(`${path}/${replayId}`, {
          method: "PATCH",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed: true, expectedVersion, preferred }),
        }),
        { params: Promise.resolve({ ...params, replayId }) },
      );
    vi.mocked(requireUser).mockResolvedValueOnce(mapper);
    expect((await prefer(first.id, second.version)).status).toBe(403);
    expect((await prefer(randomUUID(), second.version)).status).toBe(404);
    const [a, b] = await Promise.all([
      prefer(first.id, second.version),
      prefer(second.id, second.version),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const preferred = a.ok ? first.id : second.id;
    const other = a.ok ? second.id : first.id;
    const receipt = {
      preferredReplayId: preferred,
      version: second.version + 1,
    };
    expect(await (a.ok ? a : b).json()).toEqual(receipt);
    expect(await (await prefer(preferred, second.version)).json()).toEqual(
      receipt,
    );
    expect(await (await prefer(other, receipt.version)).json()).toEqual({
      preferredReplayId: other,
      version: receipt.version + 1,
    });
    const list = await getReplays(new Request(path), {
      params: Promise.resolve(params),
    });
    expect(list.status).toBe(200);
    const items: { id: string; preferred: boolean }[] = await list.json();
    expect(
      items.filter((item) => item.preferred).map((item) => item.id),
    ).toEqual([other]);
    expect(
      await (await prefer(other, receipt.version + 1, false)).json(),
    ).toEqual({
      preferredReplayId: null,
      version: receipt.version + 2,
    });
    const events = await db()
      .select()
      .from(mappoolEvents)
      .where(eq(mappoolEvents.poolId, poolId));
    expect(
      events.filter((event) => event.action === "replay_preference"),
    ).toHaveLength(3);
  });
  it("serves playback assets only for the authorized replay and entry", async () => {
    const { id: replayId } = await upload();
    const beatmap = Buffer.from("synthetic osz");
    const skin = Buffer.from("synthetic osk");
    await mkdir(join(root, "beatmaps"), { recursive: true });
    await mkdir(join(root, "replay-skins"), { recursive: true });
    await writeFile(
      join(root, "beatmaps", `${entryId}-${replayChecksum}.osz`),
      beatmap,
    );
    await writeFile(join(root, "replay-skins", "default.osk"), skin);
    const asset = "skin.osk";
    const url = new Request(
      `${origin}/api/admin/tournaments/${edition.slug}/mappools/entries/${entryId}/replays/${replayId}/playback/${asset}`,
    );
    const response = await playbackAsset(url, {
      params: Promise.resolve({
        edition: edition.slug,
        entryId,
        replayId,
        asset,
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(skin);
    const read = (actor = mapper, slug = edition.slug, target = entryId) =>
      loadMappoolReplayPlaybackAsset(
        actor,
        slug,
        target,
        replayId,
        "beatmap.osz",
      );
    expect(Buffer.from(await read())).toEqual(beatmap);
    await expect(
      read(mapper, edition.slug, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(read(mapper, "other-test-cup")).rejects.toMatchObject({
      status: 403,
    });
    await expect(read(outsider)).rejects.toMatchObject({ status: 403 });
    await db().delete(staffRoles).where(eq(staffRoles.userId, mapper.osuId));
    await expect(read()).rejects.toMatchObject({ status: 403 });
  });

  it("serves anonymous playback only for an explicitly public preferred replay in a published pool", async () => {
    const difficulty =
      "osu file format v14\r\n[General]\r\nAudioFilename: song.wav\r\n[Metadata]\r\nBeatmapID:123\r\n";
    const checksum = createHash("md5").update(difficulty).digest("hex");
    const archive = Buffer.from(
      zipSync({
        "map.osu": strToU8(difficulty),
        "song.wav": strToU8("synthetic audio"),
      }),
    );
    await db()
      .update(mappoolEntries)
      .set({ metadata: { ...metadata, checksum } })
      .where(eq(mappoolEntries.id, entryId));
    const replay = syntheticReplay({ md5: checksum });
    const { id: replayId } = await upload(tester, replay);
    const second = await upload(
      tester,
      syntheticReplay({ md5: checksum, player: "Another player" }),
    );
    await changeMappoolBeatmapCache(
      mapper,
      edition.slug,
      entryId,
      async () => ({
        action: "upload",
        file: new File([new Uint8Array(archive)], "synthetic.osz"),
        ...(await command()),
      }),
      new AbortController().signal,
    );
    const skin = Buffer.from("synthetic osk");
    await mkdir(join(root, "replay-skins"), { recursive: true });
    await writeFile(join(root, "replay-skins", "default.osk"), skin);
    const read = (asset: string, id = replayId, selectedPool = poolId) =>
      publicReplayAsset(new Request(`${origin}/replay/${asset}`), {
        params: Promise.resolve({
          edition: edition.slug,
          poolId: selectedPool,
          entryId,
          replayId: id,
          asset,
        }),
      });
    const edit = async (
      actor: typeof tester,
      id: string,
      publicPlayback?: boolean,
    ) =>
      setPreferredMappoolReplay(actor, edition.slug, entryId, id, {
        ...(await command()),
        preferred: true,
        publicPlayback,
      });
    await edit(tester, replayId);
    await expect(edit(tester, replayId, true)).rejects.toMatchObject({
      status: 403,
    });
    expect(await publicMappoolReplays(edition.slug)).toEqual({});
    await edit(admin, replayId, true);
    expect((await read("replay.osr")).status).toBe(404);
    await mappoolCommand(mapper, edition.slug, {
      action: "pool_publish",
      published: true,
      poolId,
      ...(await command()),
    });
    expect(await publicMappoolReplays(edition.slug, poolId)).toEqual({
      [entryId]: { replayId, beatmapMd5: checksum },
    });
    for (const [asset, bytes] of [
      ["replay.osr", replay],
      ["beatmap.osz", archive],
      ["skin.osk", skin],
    ] as const) {
      const response = await read(asset);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="${asset}"`,
      );
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      expect((await read(asset, second.id)).status).toBe(404);
      expect((await read(asset, replayId, randomUUID())).status).toBe(404);
    }
    await edit(admin, replayId, false);
    expect((await read("replay.osr")).status).toBe(404);
    await edit(admin, replayId, true);
    await edit(tester, second.id);
    await edit(tester, replayId);
    expect(await publicMappoolReplays(edition.slug)).toEqual({});
    expect((await read("replay.osr")).status).toBe(404);
  });

  it("caches one verified OSZ, preserves it on failure or conflict, and serves it only to authorized replay readers", async () => {
    const difficulty =
      "osu file format v14\r\n[General]\r\nAudioFilename: song.wav\r\n[Metadata]\r\nBeatmapID:123\r\n";
    const checksum = createHash("md5").update(difficulty).digest("hex");
    const archive = Buffer.from(
      zipSync({
        "map.osu": strToU8(difficulty),
        "other.osu": strToU8(difficulty.replace("123", "124")),
        "song.wav": strToU8("synthetic audio"),
      }),
    );
    await db()
      .update(mappoolEntries)
      .set({
        metadata: { ...metadata, checksum },
        downloadMirror: "https://catboy.best/d/1",
      })
      .where(eq(mappoolEntries.id, entryId));
    const { id: replayId } = await upload(
      tester,
      syntheticReplay({ md5: checksum }),
    );
    const read = () =>
      loadMappoolReplayPlaybackAsset(
        tester,
        edition.slug,
        entryId,
        replayId,
        "beatmap.osz",
      );
    const signal = new AbortController().signal;
    const status = () =>
      mappoolBeatmapCacheStatus(mapper, edition.slug, entryId);
    const sync = async () => ({
      action: "sync" as const,
      mirror: "saved" as const,
      ...(await command()),
    });
    await expect(
      mappoolBeatmapCacheStatus(tester, edition.slug, entryId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      mappoolBeatmapCacheStatus(mapper, "other-test-cup", entryId),
    ).rejects.toMatchObject({ status: 403 });
    expect((await mappoolWorkspace(mapper, edition.slug)).entries).toMatchObject([
      { id: entryId, beatmapCached: false },
    ]);
    expect((await status()).mirrors[0]).toMatchObject({ id: "saved" });
    vi.mocked(downloadBeatmapMirror).mockResolvedValueOnce(archive);
    const saved = await changeMappoolBeatmapCache(
      mapper,
      edition.slug,
      entryId,
      sync,
      signal,
    );
    expect((await mappoolWorkspace(mapper, edition.slug)).entries).toMatchObject([
      { id: entryId, beatmapCached: true },
    ]);
    expect((await mappoolWorkspace(tester, edition.slug)).entries[0]).not.toHaveProperty(
      "beatmapCached",
    );
    expect(saved.package).toMatchObject({
      size: archive.length,
      source: "mirror",
    });
    expect(Buffer.from(await read())).toEqual(archive);
    const [record] = await db().select().from(mappoolBeatmapCache);
    expect(await readdir(join(root, "beatmaps"))).toEqual([
      `${record.fileKey}.osz`,
    ]);

    vi.mocked(downloadBeatmapMirror).mockResolvedValueOnce(
      Buffer.from("not a ZIP"),
    );
    await expect(
      changeMappoolBeatmapCache(mapper, edition.slug, entryId, sync, signal),
    ).rejects.toMatchObject({ status: 422 });
    const stale = await sync();
    vi.mocked(downloadBeatmapMirror).mockImplementationOnce(async () => {
      await mappoolCommand(mapper, edition.slug, {
        action: "entry_refresh",
        poolId,
        entryId,
        ...(await command()),
      });
      return archive;
    });
    vi.mocked(fetchBeatmap).mockResolvedValueOnce({
      beatmapId: 123,
      metadata: { ...metadata, checksum },
      fetchedAt: new Date().toISOString(),
      fingerprint: "a".repeat(64),
    });
    await expect(
      changeMappoolBeatmapCache(
        mapper,
        edition.slug,
        entryId,
        async () => stale,
        signal,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(Buffer.from(await read())).toEqual(archive);
    expect(await readdir(join(root, "beatmaps"))).toEqual([
      `${record.fileKey}.osz`,
    ]);

    const form = new FormData();
    form.set("action", "upload");
    form.set("confirmed", "true");
    form.set("expectedVersion", String(await version()));
    form.set("file", new File([Uint8Array.from(archive)], "synthetic.osz"));
    vi.mocked(requireUser).mockResolvedValueOnce(mapper);
    const response = await postBeatmapCache(
      new Request(`${origin}/beatmap-cache`, {
        method: "POST",
        headers: { origin },
        body: form,
      }),
      { params: Promise.resolve({ edition: edition.slug, entryId }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).package.source).toBe("upload");
    expect(await readdir(join(root, "beatmaps"))).not.toContain(
      `${record.fileKey}.osz`,
    );
    const asset = await playbackAsset(
      new Request(`${origin}/playback/beatmap.osz`),
      {
        params: Promise.resolve({
          edition: edition.slug,
          entryId,
          replayId,
          asset: "beatmap.osz",
        }),
      },
    );
    expect(asset.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await asset.arrayBuffer())).toEqual(archive);
    await db().delete(staffRoles).where(eq(staffRoles.userId, tester.osuId));
    await expect(read()).rejects.toMatchObject({ status: 403 });
    await changeMappoolBeatmapCache(
      mapper,
      edition.slug,
      entryId,
      async () => ({
        action: "remove",
        ...(await command()),
      }),
      signal,
    );
    expect((await status()).package).toBeNull();
    expect((await mappoolWorkspace(mapper, edition.slug)).entries).toMatchObject([
      { id: entryId, beatmapCached: false },
    ]);
    expect(await readdir(join(root, "beatmaps"))).toEqual([]);
    const events = await db().select().from(mappoolEvents);
    expect(events.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "beatmap_cache_sync",
        "beatmap_cache_upload",
        "beatmap_cache_remove",
      ]),
    );
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
    expect(
      (await mappoolWorkspace(tester, edition.slug)).entries,
    ).toMatchObject([{ id: entryId, replayCount: 2 }]);
    await expect(
      mappoolWorkspace(outsider, edition.slug),
    ).rejects.toMatchObject({ status: 403 });
    const replayItems = await replayList(developer, edition.slug, entryId);
    expect(replayItems).toHaveLength(2);
    const readPath = `${origin}/api/v1/staff/tournaments/${edition.slug}/mappool-entries/${entryId}/replays`;
    expect((await readApiRoute(new Request(readPath))).status).toBe(401);
    const session = await readSessionContext(
      (await createSession(developer.osuId)).token,
    );
    const { token } = await createDeveloperToken(session!, {
      origin: "http://127.0.0.1:3001",
      scopes: ["tournaments:private:read"],
    });
    const response = await readApiRoute(
      new Request(readPath, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toEqual(JSON.parse(JSON.stringify(replayItems)));
    const revived = reviveReadValue(data, {
      ...contracts.resources.replayList,
      $defs: contracts.$defs,
    });
    expect(explicitReadContracts.replayList.parse(revived)).toEqual(
      replayItems,
    );
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
    const route =
      origin +
      uploadReplayWrite.path
        .replace("{edition}", edition.slug)
        .replace("{entryId}", entryId);
    const params = { edition: edition.slug, entryId };
    const post = (body: BodyInit, headers: Record<string, string> = {}) =>
      postReplay(
        new Request(route, {
          method: uploadReplayWrite.method,
          headers: { Origin: origin, ...headers },
          body,
        }),
        { params: Promise.resolve(params) },
      );
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(bytes)]), "示范 replay.osr");
    form.set("description", "Synthetic description");
    form.set("expectedVersion", String(input.expectedVersion));
    form.set("confirmed", "true");
    const retry = await post(form);
    expect(retry.status).toBe(200);
    expect(uploadReplayWrite.response.parse(await retry.json())).toEqual({
      duplicate: true,
      id: results[0].id,
      version: results[0].version,
    });
    form.append("description", "");
    expect((await post(form)).status).toBe(400);
    expect(
      (
        await post(new Uint8Array(uploadReplayWrite.maxBodyBytes + 1), {
          "Content-Type": "multipart/form-data; boundary=synthetic",
        })
      ).status,
    ).toBe(413);

    const deletion = await command();
    const replayId = results[0].id;
    for (const removed of [true, false]) {
      const response = await removeReplay(
        new Request(`${route}/${replayId}`, {
          method: deleteReplayWrite.method,
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify(deletion),
        }),
        { params: Promise.resolve({ ...params, replayId }) },
      );
      expect(response.status).toBe(200);
      expect(deleteReplayWrite.response.parse(await response.json())).toEqual({
        removed,
        version: deletion.expectedVersion + 1,
      });
    }
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
  it("reads score analysis for older attachments without rewriting them or hiding unavailable files", async () => {
    const { id } = await upload(
      tester,
      syntheticReplay({
        judgements: [95, 5, 0, 0, 0, 0],
        score: 987654,
        maxCombo: 1_234,
        fullCombo: true,
      }),
    );
    const performance = {
      score: 987654,
      maxCombo: 1_234,
      grade: "S",
      accuracy: 580 / 600,
      fullCombo: true,
    };
    expect((await replayList(tester, edition.slug, entryId))[0]).toMatchObject({
      id,
      summary: { performance },
    });
    await db()
      .update(mappoolReplays)
      .set({
        summary: sql`${mappoolReplays.summary} #- '{performance,maxCombo}'`,
      })
      .where(eq(mappoolReplays.id, id));
    expect((await replayList(tester, edition.slug, entryId))[0]).toMatchObject({
      id,
      summary: { performance },
    });
    const [savedWithoutCombo] = await db()
      .select({ summary: mappoolReplays.summary })
      .from(mappoolReplays)
      .where(eq(mappoolReplays.id, id));
    expect(savedWithoutCombo.summary.performance).not.toHaveProperty(
      "maxCombo",
    );
    await db()
      .update(mappoolReplays)
      .set({ summary: sql`${mappoolReplays.summary} - 'performance'` })
      .where(eq(mappoolReplays.id, id));
    expect((await replayList(tester, edition.slug, entryId))[0]).toMatchObject({
      id,
      summary: { performance },
    });
    const [saved] = await db()
      .select({ summary: mappoolReplays.summary })
      .from(mappoolReplays)
      .where(eq(mappoolReplays.id, id));
    expect(saved.summary).not.toHaveProperty("performance");
    await rename(
      join(root, "replays", `${id}.osr`),
      join(root, "unavailable.osr"),
    );
    const [unavailable] = await replayList(tester, edition.slug, entryId);
    expect(unavailable.id).toBe(id);
    expect(unavailable.summary).not.toHaveProperty("performance");
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
