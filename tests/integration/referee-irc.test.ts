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
  let bpSync = false;
  const actor = { ...referee, sessionId: randomUUID() };
  const sync = (receipts: unknown[] = [], messages: unknown[] = []) =>
    refereeIrcRelay(actor, fixtureId, {
      action: "sync",
      connectionId,
      sequence: ++seq,
      ...(bpSync ? { bpSync: true as const } : {}),
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
    bpSync = false;
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
  async function saveSelection() {
    const w = await refereeWorkspace(referee, "test-cup", fixtureId);
    return refereeCommand(referee, "test-cup", fixtureId, {
      action: "record_selection",
      entryId: w.projection.activeSelections.length
        ? w.maps.find((m) => m.beatmapId === 10002)!.id
        : w.maps.find((m) => m.beatmapId === 10001)!.id,
      expectedRevision: w.session!.revision,
      dependencyFingerprint: w.dependencyFingerprint,
      requestKey: randomUUID(),
    });
  }
  async function autoPick() {
    bpSync = true;
    await sync();
    await saveSelection();
    const picked = await saveSelection();
    const request = {
      action: "sync_selection",
      eventId: picked.receipt.eventId,
    };
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, request);
    return { picked, request };
  }
  it("queues one ordered notice/map/Mods plan per saved Pick and never records BP twice", async () => {
    const { picked, request } = await autoPick();
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, request);
    let state = await refereeIrcView(referee, "test-cup", fixtureId);
    expect(state.commands.map((c) => c.text)).toEqual([
      expect.stringMatching(/^\[OCLR BP #/),
      "!mp map 10002 0",
      "!mp mods NF",
    ]);
    const notice = (await sync()).command!;
    const map = (await sync([{ commandId: notice.id, status: "notified" }]))
      .command!;
    expect(map.text).toBe("!mp map 10002 0");
    const text = "Beatmap changed to https://osu.ppy.sh/b/10002";
    const mods = (
      await sync(
        [
          {
            commandId: map.id,
            status: "confirmed",
            evidence: { sender: "BanchoBot", target: "#mp_123", text },
          },
        ],
        [
          {
            id: "fresh-map",
            sender: "BanchoBot",
            text,
            at: new Date().toISOString(),
          },
        ],
      )
    ).command!;
    expect(mods.text).toBe("!mp mods NF");
    const modText = "Enabled NoFail, disabled FreeMod";
    expect(
      (
        await sync(
          [
            {
              commandId: mods.id,
              status: "confirmed",
              evidence: {
                sender: "BanchoBot",
                target: "#mp_123",
                text: modText,
              },
            },
          ],
          [
            {
              id: "fresh-mods",
              sender: "BanchoBot",
              text: modText,
              at: new Date().toISOString(),
            },
          ],
        )
      ).command,
    ).toBeNull();
    state = await refereeIrcView(referee, "test-cup", fixtureId);
    expect(state.commands.map((c) => c.status)).toEqual([
      "notified",
      "confirmed",
      "confirmed",
    ]);
    expect(state.workspace.events).toEqual(picked.workspace.events);
  });
  it("announces a Ban without switching maps; accepts the next plan while an announcement is in flight", async () => {
    bpSync = true;
    await sync();
    const ban = await saveSelection();
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
      action: "sync_selection",
      eventId: ban.receipt.eventId,
    });
    const notice = (await sync()).command!;
    expect(notice.text).toMatch(/ BAN NM1 /);
    const picked = await saveSelection();
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
      action: "sync_selection",
      eventId: picked.receipt.eventId,
    });
    expect(
      (await refereeIrcView(referee, "test-cup", fixtureId)).commands,
    ).toHaveLength(4);
  });
  it("stops Mods after failed map execution and does not roll back BP", async () => {
    await autoPick();
    const notice = (await sync()).command!;
    const map = (await sync([{ commandId: notice.id, status: "notified" }]))
      .command!;
    expect(
      (
        await sync([
          { commandId: map.id, status: "failed", reason: "local_rejected" },
        ])
      ).command,
    ).toBeNull();
    const state = await refereeIrcView(referee, "test-cup", fixtureId);
    expect(state.commands.map((c) => c.status)).toEqual([
      "notified",
      "failed",
      "failed",
    ]);
    expect(state.workspace.projection.activeSelections).toHaveLength(2);
  });
  it("does not dispatch a withdrawn Pick and announces its correction separately", async () => {
    const { picked } = await autoPick();
    const undone = await refereeCommand(referee, "test-cup", fixtureId, {
      action: "void_last",
      expectedRevision: picked.workspace.session!.revision,
      dependencyFingerprint: picked.workspace.dependencyFingerprint,
      requestKey: randomUUID(),
    });
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
      action: "sync_selection",
      eventId: undone.receipt.eventId,
    });
    for (let i = 0; i < 3; i++) expect((await sync()).command).toBeNull();
    expect((await sync()).command!.text).toContain("WITHDRAW PICK NM2");
  });
  it("requires current-client capability, rejects forged notices and does not treat a notice receipt as a map receipt", async () => {
    const ban = await saveSelection();
    await expect(
      refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
        action: "sync_selection",
        eventId: ban.receipt.eventId,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
        action: "queue",
        text: "[OCLR BP #1] BAN NM1 | Fake | https://osu.ppy.sh/b/10001",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
      action: "queue",
      text: "!mp map 10001 0",
      requestKey: randomUUID(),
    });
    const map = (await sync()).command!;
    await sync([{ commandId: map.id, status: "notified" }]);
    expect(
      (await refereeIrcView(referee, "test-cup", fixtureId)).commands[0].status,
    ).toBe("sending");
  });
  it("keeps click-recorded BP independent from a later plain map confirmation", async () => {
    const record = async (bid: number) => {
      const w = await refereeWorkspace(referee, "test-cup", fixtureId);
      await refereeCommand(referee, "test-cup", fixtureId, {
        action: "record_selection",
        entryId: w.maps.find((map) => map.beatmapId === bid)!.id,
        requestKey: randomUUID(),
        expectedRevision: w.session!.revision,
        dependencyFingerprint: w.dependencyFingerprint,
      });
    };
    await record(10001);
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
      action: "queue",
      requestKey: randomUUID(),
      text: "!mp map 10001 0",
    });
    const dispatched = await sync();
    await record(10002);
    const before = await refereeWorkspace(referee, "test-cup", fixtureId);
    const text = "Beatmap changed to https://osu.ppy.sh/b/10001";
    const evidence = { sender: "BanchoBot", target: "#mp_123", text };
    const receipt = {
      commandId: dispatched.command!.id,
      status: "confirmed",
      evidence,
    };
    const messages = [
      {
        id: "independent-reply",
        sender: "BanchoBot",
        text,
        at: new Date().toISOString(),
      },
    ];
    await sync([receipt], messages);
    await sync([receipt], messages);
    const after = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(after.projection.activeSelections).toHaveLength(2);
    expect(after.events).toEqual(before.events);
    expect(after.session!.revision).toBe(before.session!.revision);
    expect(
      (await refereeIrcView(referee, "test-cup", fixtureId)).commands[0].status,
    ).toBe("confirmed");
  });
  it("does not undo a saved BP record when its independent IRC command fails", async () => {
    const w = await refereeWorkspace(referee, "test-cup", fixtureId);
    const request = {
      action: "record_selection",
      entryId: w.maps.find((map) => map.beatmapId === 10001)!.id,
      requestKey: randomUUID(),
      expectedRevision: w.session!.revision,
      dependencyFingerprint: w.dependencyFingerprint,
    };
    await refereeCommand(referee, "test-cup", fixtureId, request);
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
      action: "queue",
      requestKey: randomUUID(),
      text: "!mp map 10001 0",
    });
    const dispatched = await sync();
    await sync([{ commandId: dispatched.command!.id, status: "failed" }]);
    await refereeCommand(referee, "test-cup", fixtureId, request);
    expect(
      (await refereeWorkspace(referee, "test-cup", fixtureId)).projection
        .activeSelections,
    ).toHaveLength(1);
  });
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
      settings: w.defaultSettings,
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
  it("queues make only for a creation receiver, dispatches once and moves to the observed room", async () => {
    const bound = await refereeIrcRelay(actor, fixtureId, {
      action: "bind",
      roomId: 0,
      ircUsername: actor.username,
    });
    connectionId = bound.connectionId;
    seq = 0;
    bpSync = false;
    await sync();
    await expect(
      refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
        action: "queue",
        requestKey: randomUUID(),
        text: "!mp map 42",
      }),
    ).rejects.toThrow();
    const request = {
      action: "queue",
      requestKey: randomUUID(),
      text: "!mp make Synthetic match",
    };
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, request);
    await refereeIrcBrowserCommand(referee, "test-cup", fixtureId, request);
    const first = await sync();
    expect(first.command?.target).toBe("BanchoBot");
    expect((await sync()).command).toBeNull();
    await expect(
      refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
        ...request,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow();
    await refereeIrcRelay(actor, fixtureId, {
      action: "sync",
      connectionId,
      sequence: ++seq,
      ...(bpSync ? { bpSync: true as const } : {}),
      roomId: 123,
      projection: { status: "connected", messages: [] },
      receipts: [{ commandId: first.command!.id, status: "unknown" }],
    });
    const view = await refereeIrcView(referee, "test-cup", fixtureId);
    expect(view.connection?.roomId).toBe(123);
    await expect(
      refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
        ...request,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow();
  });
  it("confirms a timer then dispatches addref, and records safe local rejection reasons", async () => {
    const queue = (text: string) =>
      refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
        action: "queue",
        requestKey: randomUUID(),
        text,
      });
    await sync();
    await queue("!mp timer 30");
    const timer = (await sync()).command!;
    const text = "Countdown ends in 30 seconds";
    const message = {
      id: randomUUID(),
      sender: "BanchoBot",
      text,
      at: new Date().toISOString(),
    };
    await sync(
      [
        { commandId: timer.id, status: "sent" },
        {
          commandId: timer.id,
          status: "confirmed",
          evidence: { sender: "BanchoBot", target: timer.target, text },
        },
      ],
      [message],
    );
    expect(
      (await refereeIrcView(referee, "test-cup", fixtureId)).commands.at(-1)
        ?.status,
    ).toBe("confirmed");
    await queue("!mp addref SyntheticRef");
    const addref = (await sync()).command!;
    await sync([
      { commandId: addref.id, status: "failed", reason: "pending_operation" },
    ]);
    const row = (
      await refereeIrcView(referee, "test-cup", fixtureId)
    ).commands.at(-1)!;
    expect(row.status).toBe("failed");
    expect(row.recordError).toBe("relay:pending_operation");
    expect((await sync()).command).toBeNull();
  });
});
