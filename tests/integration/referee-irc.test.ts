import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { fixtureReferees, refereeIrcCommands } from "../../src/db/schema";
import {
  seedRefereeFixture,
  refereeTestAdmin as admin,
  refereeTestUser as referee,
} from "../fixtures/referee";
import { assertTestDatabase } from "../database";
import { refereeCommand, refereeWorkspace } from "../../src/lib/referee";
import {
  refereeIrcRelay,
  refereeIrcBrowserCommand,
  refereeIrcView,
} from "../../src/lib/referee-irc";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("IRC relay persistence and confirmation", () => {
  let fixtureId: string, connectionId: string, seq: number;
  const actor = { ...referee, sessionId: randomUUID() };
  const sync = (receipts: unknown[] = [], messages: unknown[] = []) =>
    refereeIrcRelay(actor, fixtureId, {
      action: "sync",
      connectionId,
      sequence: ++seq,
      projection: { status: "connected", messages },
      receipts,
    });
  beforeAll(() => {
    assertTestDatabase(url);
    if (new URL(url!).port === "55436") throw Error("Preview prohibited");
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const setup = await seedRefereeFixture();
    fixtureId = setup.fixtureId;
    const w = await refereeWorkspace(referee, "test-cup", fixtureId);
    await refereeCommand(referee, "test-cup", fixtureId, {
      action: "set_order",
      firstBanTeamId: w.teams[0].id,
      firstPickTeamId: w.teams[1].id,
      expectedRevision: w.session!.revision,
      dependencyFingerprint: w.dependencyFingerprint,
      requestKey: randomUUID(),
    });
    const bind = await refereeIrcRelay(actor, fixtureId, {
      action: "bind",
      roomId: 123,
      ircUsername: referee.username.replace(/ /g, "_"),
    });
    connectionId = bind.connectionId;
    seq = 0;
    await sync();
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function queue() {
    const w = await refereeWorkspace(referee, "test-cup", fixtureId);
    const map = w.maps.find((m) => m.beatmapId === 10001)!;
    const action = {
      action: "queue",
      requestKey: randomUUID(),
      text: "!mp map 10001 0",
      selection: {
        entryId: map.id,
        expectedRevision: w.session!.revision,
        dependencyFingerprint: w.dependencyFingerprint,
      },
    };
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, action);
    return action;
  }
  it.each([
    "Beatmap changed to Test (https://osu.ppy.sh/b/10001)",
    "Changed beatmap to https://osu.ppy.sh/b/10001 Synthetic",
  ])(
    "leases once and records only new exact Bancho evidence, with idempotent receipts: %s",
    async (text) => {
      const request = await queue();
      await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, request);
      const dispatched = await sync();
      expect(dispatched.command?.target).toBe("#mp_123");
      expect((await sync()).command).toBeNull();
      const id = dispatched.command!.id;
      await sync([{ commandId: id, status: "sent" }]);
      expect(
        (await refereeWorkspace(referee, "test-cup", fixtureId)).projection
          .activeSelections,
      ).toHaveLength(0);
      const evidence = {
        sender: "BanchoBot",
        target: "#mp_123",
        text,
      };
      await sync([{ commandId: id, status: "confirmed", evidence }]);
      expect(
        (await refereeWorkspace(referee, "test-cup", fixtureId)).projection
          .activeSelections,
      ).toHaveLength(0);
      const message = {
        id: "new-bancho-reply",
        sender: evidence.sender,
        text: evidence.text,
        at: new Date().toISOString(),
      };
      await sync([{ commandId: id, status: "confirmed", evidence }], [message]);
      await sync([{ commandId: id, status: "confirmed", evidence }], [message]);
      expect(
        (await refereeWorkspace(referee, "test-cup", fixtureId)).projection
          .activeSelections,
      ).toHaveLength(1);
      expect(
        (await refereeIrcView(referee, "test-cup", fixtureId)).commands[0]
          .status,
      ).toBe("confirmed");
    },
  );
  it.each([
    "Beatmap changed to Test (https://osu.ppy.sh/b/10001)",
    "Changed beatmap to https://osu.ppy.sh/b/10001 Synthetic",
  ])(
    "does not reuse prior reply, cross-session or withdrawn assignment: %s",
    async (text) => {
      const evidence = {
        sender: "BanchoBot",
        target: "#mp_123",
        text,
      };
      const message = {
        id: "old",
        sender: evidence.sender,
        text: evidence.text,
        at: new Date().toISOString(),
      };
      await sync([], [message]);
      await queue();
      const dispatched = await sync([], [message]);
      await sync(
        [{ commandId: dispatched.command!.id, status: "confirmed", evidence }],
        [message],
      );
      expect(
        (await refereeWorkspace(referee, "test-cup", fixtureId)).projection
          .activeSelections,
      ).toHaveLength(0);
      await expect(
        refereeIrcRelay({ ...actor, sessionId: randomUUID() }, fixtureId, {
          action: "disconnect",
          connectionId,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await db()
        .delete(fixtureReferees)
        .where(eq(fixtureReferees.fixtureId, fixtureId));
      await expect(sync()).rejects.toMatchObject({ status: 403 });
    },
  );
  it("revokes room binding and never redelivers unknown commands", async () => {
    await queue();
    const dispatched = await sync();
    await sync([{ commandId: dispatched.command!.id, status: "unknown" }]);
    expect((await sync()).command).toBeNull();
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
      action: "disconnect",
    });
    await expect(sync()).rejects.toMatchObject({ status: 403 });
  });
  it("does not deliver a second instruction while desktop waits for the first receipt", async () => {
    const first = {
      action: "queue",
      requestKey: randomUUID(),
      text: "!mp timer 30",
    };
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, first);
    const dispatched = await sync();
    await sync([{ commandId: dispatched.command!.id, status: "sent" }]);
    await expect(
      refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
        action: "queue",
        requestKey: randomUUID(),
        text: "!mp start 5",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await sync([{ commandId: dispatched.command!.id, status: "unknown" }]);
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
      action: "queue",
      requestKey: randomUUID(),
      text: "!mp start 5",
    });
    expect((await sync()).command?.text).toBe("!mp start 5");
  });
  it("rejects identity mismatch and Admin without an assignment", async () => {
    await expect(
      refereeIrcRelay(actor, fixtureId, {
        action: "bind",
        roomId: 123,
        ircUsername: "SomeoneElse",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      refereeIrcRelay({ ...admin, sessionId: randomUUID() }, fixtureId, {
        action: "bind",
        roomId: 123,
        ircUsername: admin.username,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("preserves a confirmed command as record_failed when referee state changed in flight", async () => {
    await queue();
    const dispatched = await sync();
    const w = await refereeWorkspace(referee, "test-cup", fixtureId);
    await refereeCommand(referee, "test-cup", fixtureId, {
      action: "save_settings",
      settings: { ...w.session!.settings, roomName: "Changed room" },
      expectedRevision: w.session!.revision,
      dependencyFingerprint: w.dependencyFingerprint,
      requestKey: randomUUID(),
    });
    const evidence = {
      sender: "BanchoBot",
      target: "#mp_123",
      text: "Beatmap changed to: Test (https://osu.ppy.sh/b/10001)",
    };
    await sync(
      [{ commandId: dispatched.command!.id, status: "confirmed", evidence }],
      [
        {
          id: "fresh",
          sender: evidence.sender,
          text: evidence.text,
          at: new Date().toISOString(),
        },
      ],
    );
    const state = await refereeIrcView(referee, "test-cup", fixtureId);
    expect(state.commands[0].status).toBe("record_failed");
    expect(state.workspace.projection.activeSelections).toHaveLength(0);
    expect((await sync()).command).toBeNull();
  });
  it("expires unclaimed commands without sending and prevents stale BP mutations", async () => {
    await queue();
    await db()
      .update(refereeIrcCommands)
      .set({ createdAt: new Date(Date.now() - 60_000) });
    expect((await sync()).command).toBeNull();
    expect(
      (await refereeIrcView(referee, "test-cup", fixtureId)).commands[0].status,
    ).toBe("failed");
  });
});
