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
import {
  fixtureReferees,
  refereeIrcCommands,
  refereeIrcConnections,
} from "../../src/db/schema";
import {
  seedRefereeFixture,
  refereeTestAdmin as admin,
  refereeTestUser as referee,
} from "../fixtures/referee";
import { assertTestDatabase } from "../database";
import { refereeCommand } from "../../src/lib/referee";
import { refereeWorkspace } from "../../src/lib/referee-workspace";
import {
  refereeIrcRelay,
  refereeIrcBrowserCommand,
  refereeIrcView,
} from "../../src/lib/referee-irc";
import { POST as ircRoute } from "../../src/app/api/admin/tournaments/[edition]/matches/[fixtureId]/referee/irc/route";
import { changeRefereeIrcBrowserWrite } from "../../src/lib/referee-irc-browser-contract";
import { extendedSchemas } from "../../src/lib/extended-read-resources";
const origin = "https://oclr.example.test";
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => referee,
}));
function post(fixtureId: string, input: unknown, bearer = false) {
  return ircRoute(
    new Request(
      origin +
        changeRefereeIrcBrowserWrite.path
          .replace("{edition}", "test-cup")
          .replace("{fixtureId}", fixtureId),
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          ...(bearer ? { authorization: "Bearer synthetic-only" } : {}),
        },
        body: JSON.stringify(input),
      },
    ),
    { params: Promise.resolve({ edition: "test-cup", fixtureId }) },
  );
}
async function parseIrcResponse(response: Response) {
  expect(response.status).toBe(200);
  const data = await response.json();
  const fields = changeRefereeIrcBrowserWrite.response.properties;
  expect({
    connection: fields.connection.parse(data.connection),
    messages: fields.messages.parse(data.messages),
    commands: fields.commands.parse(data.commands),
    workspace: extendedSchemas.refereeWorkspace.parse(data.workspace),
  }).toEqual(data);
  return data;
}
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
    vi.stubEnv("APP_URL", origin);
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
  it("keeps idle browser and desktop polling passive while projecting room messages", async () => {
    const messages = [
      {
        id: "1",
        sender: "Player",
        text: "ready",
        at: new Date().toISOString(),
      },
    ];
    for (let i = 0; i < 5; i++) {
      expect((await sync([], messages)).command).toBeNull();
      const current = await refereeIrcView(referee, "test-cup", fixtureId);
      expect(current.commands).toEqual([]);
      expect(current.messages).toHaveLength(1);
      expect(current.messages[0].text).toBe("ready");
    }
    expect(await db().select().from(refereeIrcCommands)).toEqual([]);
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
  it("projects expired unclaimed commands on read without writing or waiting for another desktop poll", async () => {
    const request = await queue();
    await db()
      .update(refereeIrcCommands)
      .set({ createdAt: new Date(Date.now() - 31000) })
      .where(eq(refereeIrcCommands.requestKey, request.requestKey));
    const view = await refereeIrcView(referee, "test-cup", fixtureId);
    expect(view.commands.at(-1)?.status).toBe("failed");
    const [stored] = await db()
      .select()
      .from(refereeIrcCommands)
      .where(eq(refereeIrcCommands.requestKey, request.requestKey));
    expect(stored.status).toBe("queued");
    expect((await sync()).command).toBeNull();
  });
  it.each(["sending", "sent"])(
    "does not revive an overdue %s command or record legacy BP from a late exact receipt",
    async (status) => {
      await queue();
      const dispatched = (await sync()).command!;
      await db()
        .update(refereeIrcCommands)
        .set({ status, dispatchedAt: new Date(Date.now() - 46000) })
        .where(eq(refereeIrcCommands.id, dispatched.id));
      const before = await refereeWorkspace(referee, "test-cup", fixtureId);
      expect(
        (await refereeIrcView(referee, "test-cup", fixtureId)).commands.at(-1)
          ?.status,
      ).toBe("unknown");
      const evidence = {
        sender: "BanchoBot",
        target: "#mp_123",
        text: "Beatmap changed to: https://osu.ppy.sh/b/10001 Synthetic map",
      };
      await sync(
        [{ commandId: dispatched.id, status: "confirmed", evidence }],
        [
          {
            id: randomUUID(),
            sender: evidence.sender,
            text: evidence.text,
            at: new Date().toISOString(),
          },
        ],
      );
      expect(
        (await refereeIrcView(referee, "test-cup", fixtureId)).commands.at(-1)
          ?.status,
      ).toBe("unknown");
      const after = await refereeWorkspace(referee, "test-cup", fixtureId);
      expect(after.events).toEqual(before.events);
      expect(after.projection.score).toEqual(before.projection.score);
    },
  );
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
    const replay = await parseIrcResponse(await post(fixtureId, request));
    expect(replay.commands).toHaveLength(3);
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
  it("confirms complete room settings once, rejects incomplete proof and permits a new intent after unknown", async () => {
    const queueSettings = () =>
      refereeIrcBrowserCommand(referee, "test-cup", fixtureId, {
        action: "queue",
        requestKey: randomUUID(),
        text: "!mp set 2 3 16",
      });
    await queueSettings();
    const first = (await sync()).command!;
    const evidence = {
      sender: "BanchoBot",
      target: "#mp_123",
      text: "Changed match settings to TeamVs, ScoreV2",
    };
    const message = {
      id: "settings-incomplete",
      sender: "BanchoBot",
      text: evidence.text,
      at: new Date().toISOString(),
    };
    await sync(
      [{ commandId: first.id, status: "confirmed", evidence }],
      [message],
    );
    expect(
      (await refereeIrcView(referee, "test-cup", fixtureId)).commands.at(-1)
        ?.status,
    ).toBe("sending");
    await sync([{ commandId: first.id, status: "unknown" }]);
    await queueSettings();
    const next = (await sync()).command!;
    expect(next.id).not.toBe(first.id);
    evidence.text = "Changed match settings to 16 slots, TeamVs, ScoreV2";
    message.id = "settings-complete";
    message.text = evidence.text;
    await sync(
      [{ commandId: next.id, status: "confirmed", evidence }],
      [message],
    );
    await sync(
      [{ commandId: next.id, status: "confirmed", evidence }],
      [message],
    );
    const view = await refereeIrcView(referee, "test-cup", fixtureId);
    expect(view.commands.find((c) => c.id === first.id)?.status).toBe(
      "unknown",
    );
    expect(view.commands.find((c) => c.id === next.id)?.status).toBe(
      "confirmed",
    );
    expect((await sync()).command).toBeNull();
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
  it("holds the shared IRC lock and rolls back relay and BP writes together", async () => {
    await queue();
    const dispatched = (await sync()).command!;
    await sync([{ commandId: dispatched.id, status: "sent" }]);
    const before = await refereeWorkspace(referee, "test-cup", fixtureId);
    const evidence = {
      sender: "BanchoBot",
      target: "#mp_123",
      text: "Beatmap changed to Test (https://osu.ppy.sh/b/10001)",
    };
    const confirmation = {
      action: "sync",
      connectionId,
      sequence: ++seq,
      projection: {
        status: "connected",
        messages: [
          {
            id: randomUUID(),
            sender: evidence.sender,
            text: evidence.text,
            at: new Date().toISOString(),
          },
        ],
      },
      receipts: [{ commandId: dispatched.id, status: "confirmed", evidence }],
    };
    const confirm = () => refereeIrcRelay(actor, fixtureId, confirmation);
    const readCommand = async () =>
      (await db()
        .select()
        .from(refereeIrcCommands)
        .where(eq(refereeIrcCommands.id, dispatched.id)))[0];
    await db().execute(sql`
      CREATE FUNCTION test_reject_irc_bp_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'referee_record_selection' THEN
          RAISE EXCEPTION 'Synthetic IRC BP audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER test_reject_irc_bp_audit BEFORE INSERT ON result_audit_events
      FOR EACH ROW EXECUTE FUNCTION test_reject_irc_bp_audit();
    `);
    try {
      await expect(confirm()).rejects.toThrow();
      expect(await readCommand()).toMatchObject({
        status: "sent",
        confirmedAt: null,
      });
      const [connection] = await db()
        .select({ sequence: refereeIrcConnections.sequence })
        .from(refereeIrcConnections)
        .where(eq(refereeIrcConnections.id, connectionId));
      expect(connection.sequence).toBe(confirmation.sequence - 1);
      const rolledBack = await refereeWorkspace(referee, "test-cup", fixtureId);
      expect(rolledBack.session?.revision).toBe(before.session?.revision);
      expect(rolledBack.events).toEqual(before.events);
    } finally {
      await db().execute(sql`
        DROP TRIGGER test_reject_irc_bp_audit ON result_audit_events;
        DROP FUNCTION test_reject_irc_bp_audit();
      `);
    }

    let pending!: ReturnType<typeof confirm>;
    await db().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
      pending = confirm();
      void pending.catch(() => {});
      await vi.waitFor(async () => {
        const {
          rows: [lock],
        } = await tx.execute<{ waiting: boolean }>(sql`
          SELECT EXISTS (
            SELECT 1 FROM pg_locks
            WHERE locktype = 'advisory' AND NOT granted
              AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
              AND classid = 0 AND objid = 17301 AND objsubid = 1
          ) AS waiting
        `);
        expect(lock.waiting).toBe(true);
      }, { timeout: 5_000 });
    });
    expect((await pending).sequence).toBe(confirmation.sequence);
    expect(await readCommand()).toMatchObject({ status: "confirmed" });
    await confirm();
    const saved = await refereeWorkspace(referee, "test-cup", fixtureId);
    expect(saved.session?.revision).toBe(before.session!.revision + 1);
    expect(saved.projection.activeSelections).toHaveLength(1);
  });

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
    const disconnected = await parseIrcResponse(
      await post(fixtureId, { action: "disconnect" }),
    );
    expect(disconnected.connection).toMatchObject({
      status: "revoked",
      connected: false,
    });
    await expect(sync()).rejects.toMatchObject({ status: 403 });
  });
  it("does not deliver a second instruction while desktop waits for the first receipt", async () => {
    const first = {
      action: "queue",
      requestKey: randomUUID(),
      text: "!mp timer 30",
    };
    expect((await post(fixtureId, first, true)).status).toBe(403);
    const queued = await parseIrcResponse(await post(fixtureId, first));
    const replay = await parseIrcResponse(await post(fixtureId, first));
    expect(replay.commands).toEqual(queued.commands);
    expect(queued.commands).toHaveLength(1);
    expect(queued.commands[0]).toMatchObject({
      requestKey: first.requestKey,
      status: "queued",
    });
    expect(
      (await post(fixtureId, { ...first, text: "!mp timer 40" })).status,
    ).toBe(409);
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
