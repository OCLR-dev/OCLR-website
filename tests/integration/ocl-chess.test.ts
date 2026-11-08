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
import {
  users,
  staffRoles,
  chessBoards,
  chessEvents,
} from "../../src/db/schema";
import { readChess, writeChess } from "../../src/lib/ocl-chess";
import { assertBusinessWrite } from "../../src/lib/auth/staff";
import { createSession } from "../../src/lib/auth/sessions";
import { withReadChannel } from "../../src/lib/read-channel";
import { GET, POST, PATCH } from "../../src/app/api/games/ocl-chess/route";
import { assertTestDatabase } from "../database";
import {
  moderateChessWrite,
  placeChessPixelWrite,
} from "../../src/lib/ocl-chess-write-contracts";
const browser = vi.hoisted(() => ({ headers: new Headers(), token: "" }));
vi.mock("next/headers.js", () => ({
  headers: async () => browser.headers,
  cookies: async () => ({
    get: () => (browser.token ? { value: browser.token } : undefined),
  }),
}));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 9900001, username: "Synthetic Canvas Admin" },
  player = { osuId: 9900002, username: "Synthetic Canvas Player" },
  developer = { osuId: 9900003, username: "Synthetic Canvas Developer" },
  multiRole = {
    osuId: 9900004,
    username: "Synthetic Canvas Developer Designer",
  };
const participants = [player, developer, multiRole];
const origin = "https://oclr.example.test";
const pixel = () => ({ requestId: randomUUID(), x: 5, y: 6, color: 3 });
function request(body: unknown, headers: HeadersInit = {}, method = "POST") {
  const values = new Headers(headers);
  if (!values.has("Origin")) values.set("Origin", origin);
  values.set("Content-Type", "application/json");
  browser.headers = values;
  return new Request(`${origin}/api/games/ocl-chess`, {
    method,
    headers: values,
    body: JSON.stringify(body),
  });
}
describe.skipIf(!url)("OCL Chess transactions", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    vi.stubEnv("APP_URL", origin);
  });
  beforeEach(async () => {
    browser.token = "";
    browser.headers = new Headers();
    await db().execute(sql`TRUNCATE users, chess_boards CASCADE`);
    await db()
      .insert(users)
      .values([admin, ...participants]);
    await db()
      .insert(staffRoles)
      .values([
        { userId: developer.osuId, role: "developer", grantedBy: admin.osuId },
        { userId: multiRole.osuId, role: "developer", grantedBy: admin.osuId },
        { userId: multiRole.osuId, role: "designer", grantedBy: admin.osuId },
      ]);
    await db()
      .insert(chessBoards)
      .values({ id: 1, pixels: "0".repeat(16384), enabled: true });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it.each(participants)(
    "deduplicates retries and enforces cooldown atomically ($username)",
    async (user) => {
      const command = pixel();
      await Promise.all([writeChess(user, command), writeChess(user, command)]);
      const saved = await readChess(null);
      expect(saved.revision).toBe(1);
      expect(saved.pixels[command.y * 128 + command.x]).toBe("3");
      expect(await db().select().from(chessEvents)).toHaveLength(1);
      await expect(writeChess(user, pixel())).rejects.toMatchObject({
        status: 429,
      });
    },
  );
  it.each(participants)(
    "confirms a saved request while paused without writing or extending cooldown ($username)",
    async (user) => {
      const command = pixel();
      const saved = await writeChess(user, command);
      await writeChess(
        admin,
        { action: "toggle", enabled: false, expectedRevision: 1 },
        true,
      );
      const events = await db().select().from(chessEvents);
      const confirmed = await writeChess(user, command);
      expect(confirmed).toMatchObject({
        enabled: false,
        revision: 2,
        pixels: saved.pixels,
        nextAt: saved.nextAt,
      });
      expect(await db().select().from(chessEvents)).toEqual(events);
      await expect(writeChess(user, pixel())).rejects.toMatchObject({
        status: 403,
      });
      expect(await db().select().from(chessEvents)).toEqual(events);
    },
  );
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
  it.each(participants)(
    "rejects non-admin moderation and stale revisions ($username)",
    async (user) => {
      const command = { action: "toggle", enabled: false, expectedRevision: 0 };
      await expect(writeChess(user, command, true)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        writeChess(
          user,
          {
            action: "clear",
            x: 5,
            y: 6,
            width: 1,
            height: 1,
            expectedRevision: 0,
          },
          true,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await writeChess(admin, command, true);
      await expect(writeChess(user, pixel())).rejects.toMatchObject({
        status: 403,
      });
      await expect(writeChess(admin, command, true)).rejects.toMatchObject({
        status: 409,
      });
    },
  );
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
  it("keeps Developer tournament business writes read-only", async () => {
    for (const user of [developer, multiRole]) {
      await expect(assertBusinessWrite(user)).rejects.toMatchObject({
        status: 403,
      });
      expect(await readChess(user)).toMatchObject({
        signedIn: true,
        admin: false,
      });
    }
  });
  it("rejects delegated read-channel and remote writes for every role", async () => {
    for (const user of [...participants, admin]) {
      await expect(
        withReadChannel(() => writeChess(user, pixel())),
      ).rejects.toMatchObject({ status: 403 });
    }
    vi.stubEnv("OCLR_DATA_SOURCE", "remote");
    try {
      for (const user of [...participants, admin]) {
        await expect(writeChess(user, pixel())).rejects.toMatchObject({
          status: 403,
        });
      }
      expect((await POST(request(pixel()))).status).toBe(503);
    } finally {
      vi.stubEnv("OCLR_DATA_SOURCE", "database");
    }
    expect((await readChess(null)).revision).toBe(0);
    expect(await db().select().from(chessEvents)).toHaveLength(0);
  });
  it("allows Developer browser placement while rejecting anonymous, bearer and cross-origin requests", async () => {
    expect((await POST(request(pixel()))).status).toBe(401);
    browser.token = (await createSession(developer.osuId)).token;
    expect(
      (await POST(request(pixel(), { Origin: "https://other.example.test" })))
        .status,
    ).toBe(403);
    expect(
      (
        await POST(
          request(pixel(), { Authorization: "Bearer synthetic-test-token" }),
        )
      ).status,
    ).toBe(403);
    expect((await readChess(null)).revision).toBe(0);
    const placement = pixel();
    const response = await POST(request(placement));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    const saved = placeChessPixelWrite.response.parse(body);
    expect(saved).toEqual(body);
    expect(saved).toMatchObject({ id: 1, revision: 1, signedIn: true, admin: false });
    const replay = await POST(request(placement));
    expect(replay.status).toBe(200);
    expect(placeChessPixelWrite.response.parse(await replay.json())).toMatchObject({
      revision: 1,
      nextAt: saved.nextAt,
    });
    expect((await POST(request({ ...placement, color: 7 }))).status).toBe(409);
    browser.token = "";
    browser.headers = new Headers();
    expect(await (await GET()).json()).toMatchObject({
      revision: 1,
      signedIn: false,
    });
    browser.token = (await createSession(developer.osuId)).token;
    expect(
      (
        await PATCH(
          request(
            { action: "toggle", enabled: false, expectedRevision: 1 },
            {},
            "PATCH",
          ),
        )
      ).status,
    ).toBe(403);
    expect((await readChess(null)).revision).toBe(1);
    browser.token = (await createSession(admin.osuId)).token;
    const clear = {
      action: "clear",
      x: placement.x,
      y: placement.y,
      width: 1,
      height: 1,
      expectedRevision: 1,
    };
    const moderated = await PATCH(request(clear, {}, "PATCH"));
    expect(moderated.status).toBe(200);
    const cleared = await moderated.json();
    expect(moderateChessWrite.response.parse(cleared)).toEqual(cleared);
    expect(cleared).toMatchObject({ revision: 2, admin: true });
    expect(cleared.pixels).toBe("0".repeat(16384));
    expect((await PATCH(request(clear, {}, "PATCH"))).status).toBe(409);
    expect(await db().select().from(chessEvents)).toHaveLength(2);
  });
});
