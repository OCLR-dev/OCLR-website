import { randomUUID } from "node:crypto";
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
import { users, chessBoards, chessEvents } from "../../src/db/schema";
import { readChess, writeChess } from "../../src/lib/ocl-chess";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 9900001, username: "Synthetic Canvas Admin" },
  player = { osuId: 9900002, username: "Synthetic Canvas Player" };
const pixel = () => ({ requestId: randomUUID(), x: 5, y: 6, color: 3 });
describe.skipIf(!url)("OCL Chess transactions", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE users, chess_boards CASCADE`);
    await db().insert(users).values([admin, player]);
    await db()
      .insert(chessBoards)
      .values({ id: 1, pixels: "0".repeat(16384), enabled: true });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("deduplicates retries and enforces cooldown atomically", async () => {
    const command = pixel();
    await Promise.all([
      writeChess(player, command),
      writeChess(player, command),
    ]);
    expect((await readChess(null)).revision).toBe(1);
    expect(await db().select().from(chessEvents)).toHaveLength(1);
    await expect(writeChess(player, pixel())).rejects.toMatchObject({
      status: 429,
    });
  });
  it("confirms a saved request while paused without writing or extending cooldown", async () => {
    const command = pixel();
    const saved = await writeChess(player, command);
    await writeChess(
      admin,
      { action: "toggle", enabled: false, expectedRevision: 1 },
      true,
    );
    const events = await db().select().from(chessEvents);
    const confirmed = await writeChess(player, command);
    expect(confirmed).toMatchObject({
      enabled: false,
      revision: 2,
      pixels: saved.pixels,
      nextAt: saved.nextAt,
    });
    expect(await db().select().from(chessEvents)).toEqual(events);
    await expect(writeChess(player, pixel())).rejects.toMatchObject({
      status: 403,
    });
    expect(await db().select().from(chessEvents)).toEqual(events);
  });
  it("allows only one concurrent distinct command per account", async () => {
    const outcomes = await Promise.allSettled([
      writeChess(player, pixel()),
      writeChess(player, pixel()),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await readChess(null)).revision).toBe(1);
  });
  it("orders concurrent pixels and preserves the committed winner", async () => {
    const results = await Promise.all([
      writeChess(player, pixel()),
      writeChess(admin, { ...pixel(), color: 5 }),
    ]);
    const saved = await readChess(null);
    expect(saved.revision).toBe(2);
    expect(["3", "5"]).toContain(saved.pixels[6 * 128 + 5]);
    expect(Math.max(...results.map((r) => r.revision))).toBe(2);
  });
  it("rejects non-admin moderation and stale revisions", async () => {
    const command = { action: "toggle", enabled: false, expectedRevision: 0 };
    await expect(writeChess(player, command, true)).rejects.toMatchObject({
      status: 403,
    });
    await writeChess(admin, command, true);
    await expect(writeChess(player, pixel())).rejects.toMatchObject({
      status: 403,
    });
    await expect(writeChess(admin, command, true)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("clears only the specified rectangle and audits the change", async () => {
    await writeChess(player, pixel());
    await writeChess(
      admin,
      { action: "clear", x: 5, y: 6, width: 1, height: 1, expectedRevision: 1 },
      true,
    );
    expect((await readChess(null)).pixels).toBe("0".repeat(16384));
    expect(await db().select().from(chessEvents)).toHaveLength(2);
  });
});
