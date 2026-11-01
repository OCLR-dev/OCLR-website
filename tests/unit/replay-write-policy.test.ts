import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/lib/http";
import {
  editionState,
  mappoolEntries,
  mappoolEvents,
  mappoolReplays,
  mappools,
  staffRoles,
} from "../../src/db/schema";
import { parseReplay } from "../../src/lib/replay-parser";
import {
  readReplay,
  removeReplayFile,
  storeReplay,
} from "../../src/lib/replay-storage";
import {
  authorizeReplayUpload,
  deleteMappoolReplay,
  uploadMappoolReplay,
} from "../../src/lib/mappool-replays";
import type { ReplaySummary } from "../../src/lib/replay-model";

vi.mock("../../src/db", () => ({ db: () => database }));
vi.mock("../../src/lib/replay-parser", () => ({ parseReplay: vi.fn() }));
vi.mock("../../src/lib/replay-storage", () => ({
  readReplay: vi.fn(),
  removeReplayFile: vi.fn(),
  storeReplay: vi.fn(),
}));

const slug = "synthetic-replay-test";
const actor = { osuId: 692001, username: "Synthetic Tester" };
const entryId = "00000000-0000-4000-8000-000000000001";
const bytes = Buffer.from("synthetic replay bytes");
const summary: ReplaySummary = {
  format: "stable",
  version: 20200101,
  beatmapMd5: "a".repeat(32),
  playerName: "Synthetic Player",
  mode: "osu",
  mods: 0,
};
const state = {
  grants: [{ role: "tester", editionSlug: slug as string | null }],
  pool: {
    id: "synthetic-pool",
    editionSlug: slug,
    version: 7,
    selectionLockedAt: null as Date | null,
    showcaseAt: null as Date | null,
    lockedAt: null as Date | null,
  },
  entry: {
    id: entryId,
    beatmapId: 101,
    category: "NM",
    position: 1,
    metadata: { checksum: summary.beatmapMd5, mode: "osu" },
  },
  replays: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  archived: false,
  missing: false,
};
function rows(table: unknown): unknown[] {
  if (table === staffRoles) return state.grants;
  if (table === editionState)
    return [{ configuration: { archive: state.archived ? {} : undefined } }];
  if (table === mappoolEntries)
    return state.missing
      ? []
      : [
          {
            pool: { ...state.pool },
            entry: { ...state.entry, metadata: { ...state.entry.metadata } },
          },
        ];
  if (table === mappoolReplays) return state.replays;
  throw new Error("Unexpected replay-policy read");
}
type Query = {
  from: (table: unknown) => Query;
  innerJoin: (...args: unknown[]) => Query;
  where: (...args: unknown[]) => Query;
  for: (...args: unknown[]) => Promise<unknown[]>;
  then: Promise<unknown[]>["then"];
};
function selection(): Query {
  let table: unknown;
  const query: Query = {
    from(value) {
      table = value;
      return query;
    },
    innerJoin() {
      return query;
    },
    where() {
      return query;
    },
    for: async () => rows(table),
    then: (resolve, reject) =>
      Promise.resolve(rows(table)).then(resolve, reject),
  };
  return query;
}
// Exercise the real service and authorization flow with an in-memory DB adapter.
// PostgreSQL transaction/locking coverage remains in the integration suite.
const database = {
  select: selection,
  execute: async () => [],
  transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(database),
  insert: (table: unknown) => ({
    values(value: Record<string, unknown>) {
      const row = { ...value, createdAt: new Date() };
      if (table === mappoolReplays) state.replays.push(row);
      else if (table === mappoolEvents) state.audits.push(value);
      else throw new Error("Unexpected replay-policy insert");
      return Object.assign(Promise.resolve(row), {
        returning: async () => [row],
      });
    },
  }),
  update: (table: unknown) => ({
    set: (value: Record<string, unknown>) => ({
      where: async () => {
        if (table !== mappools)
          throw new Error("Unexpected replay-policy update");
        Object.assign(state.pool, value);
      },
    }),
  }),
  delete: (table: unknown) => ({
    where: async () => {
      if (table !== mappoolReplays)
        throw new Error("Unexpected replay-policy delete");
      state.replays = [];
    },
  }),
};
const upload = (expectedVersion = 7) =>
  uploadMappoolReplay(
    actor,
    slug,
    entryId,
    { expectedVersion, confirmed: true },
    "sample.osr",
    "",
    bytes,
  );
const remove = (id: string, expectedVersion = state.pool.version) =>
  deleteMappoolReplay(actor, slug, entryId, id, {
    expectedVersion,
    confirmed: true,
  });

beforeEach(() => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://synthetic@127.0.0.1:1/oclr_replay_policy_test",
  );
  vi.stubEnv("OCLR_DATA_SOURCE", "database");
  vi.stubEnv("ADMIN_OSU_IDS", "");
  state.grants = [{ role: "tester", editionSlug: slug }];
  Object.assign(state.pool, {
    version: 7,
    selectionLockedAt: null,
    showcaseAt: null,
    lockedAt: null,
  });
  state.entry.metadata = { checksum: summary.beatmapMd5, mode: "osu" };
  state.replays = [];
  state.audits = [];
  state.archived = false;
  state.missing = false;
  vi.resetAllMocks();
  vi.mocked(parseReplay).mockResolvedValue(summary);
  vi.mocked(readReplay).mockResolvedValue(bytes);
  vi.mocked(storeReplay).mockResolvedValue(undefined);
  vi.mocked(removeReplayFile).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("replay writes without a time window", () => {
  it.each([
    { selectionLockedAt: null, showcaseAt: null, lockedAt: null },
    { selectionLockedAt: null, showcaseAt: new Date(0), lockedAt: null },
    { selectionLockedAt: new Date(0), showcaseAt: new Date(0), lockedAt: null },
    {
      selectionLockedAt: new Date(0),
      showcaseAt: new Date("2099-01-01"),
      lockedAt: new Date(0),
    },
  ])(
    "allows authorized upload/delete with legacy pool state %j",
    async (legacy) => {
      Object.assign(state.pool, legacy);
      await expect(
        authorizeReplayUpload(actor, slug, entryId),
      ).resolves.toBeUndefined();
      const result = await upload();
      expect(result).toMatchObject({ duplicate: false, version: 8 });
      expect(storeReplay).toHaveBeenCalledWith(result.id, bytes);
      expect(state.audits.map((value) => value.action)).toEqual([
        "replay_upload",
      ]);
      await expect(remove(result.id)).resolves.toMatchObject({
        removed: true,
        version: 9,
      });
      expect(removeReplayFile).toHaveBeenCalledWith(result.id);
      expect(state.audits.map((value) => value.action)).toEqual([
        "replay_upload",
        "replay_delete",
      ]);
    },
  );
  it.each(["developer", "mappooler"])(
    "does not turn a %s read grant into replay-write permission",
    async (role) => {
      state.grants = [
        { role, editionSlug: role === "developer" ? null : slug },
      ];
      await expect(upload()).rejects.toMatchObject({ status: 403 });
      await expect(remove(entryId)).rejects.toMatchObject({ status: 403 });
      expect(storeReplay).not.toHaveBeenCalled();
      expect(state.audits).toHaveLength(0);
    },
  );
  it("retains edition scope and target lookup", async () => {
    state.grants = [{ role: "tester", editionSlug: "other-edition" }];
    await expect(upload()).rejects.toMatchObject({ status: 403 });
    state.grants = [{ role: "tester", editionSlug: slug }];
    state.missing = true;
    await expect(upload()).rejects.toMatchObject({ status: 404 });
  });
  it("rechecks a revoked grant after parsing and before writing", async () => {
    vi.mocked(parseReplay).mockImplementation(async () => {
      state.grants = [];
      return summary;
    });
    await expect(upload()).rejects.toMatchObject({ status: 403 });
    expect(storeReplay).not.toHaveBeenCalled();
  });
  it("keeps archived editions read-only for uploads and deletions", async () => {
    state.archived = true;
    await expect(upload()).rejects.toMatchObject({ status: 409 });
    await expect(remove(entryId)).rejects.toMatchObject({ status: 409 });
    expect(storeReplay).not.toHaveBeenCalled();
  });
  it("still validates replay contents and beatmap identity", async () => {
    vi.mocked(parseReplay).mockRejectedValueOnce(
      new HttpError(400, "Invalid replay"),
    );
    await expect(upload()).rejects.toMatchObject({ status: 400 });
    state.entry.metadata.checksum = "b".repeat(32);
    await expect(upload()).rejects.toMatchObject({ status: 409 });
    expect(storeReplay).not.toHaveBeenCalled();
  });
  it("retains version checks and idempotent upload/deletion receipts", async () => {
    await expect(upload(6)).rejects.toMatchObject({ status: 409 });
    const result = await upload();
    await expect(upload(7)).resolves.toMatchObject({
      duplicate: true,
      id: result.id,
      version: 8,
    });
    await expect(remove(result.id, 7)).rejects.toMatchObject({ status: 409 });
    await remove(result.id, 8);
    await expect(remove(result.id, 8)).resolves.toMatchObject({
      removed: false,
      version: 9,
    });
    expect(storeReplay).toHaveBeenCalledTimes(1);
    expect(state.audits).toHaveLength(2);
  });
});
