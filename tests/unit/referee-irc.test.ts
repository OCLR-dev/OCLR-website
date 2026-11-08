import { describe, it, expect } from "vitest";
import { refereePolicySchema } from "../../src/lib/referee-model";
import {
  allowedIrcCommand,
  allowedMakeCommand,
  confirmsMap,
  confirmsIrcCommand,
  normalizedIrcUsername,
  safeIrcMessages,
  relaySchema,
} from "../../src/lib/referee-irc-model";
describe("IRC relay boundary", () => {
  it("leaves settings and referee queries to the desktop room synchronizer", () => {
    expect(allowedIrcCommand("!mp settings")).toBe(false);
    expect(allowedIrcCommand("!mp listrefs")).toBe(false);
  });
  it.each([1, 90, 3600, 3601, 9999, 10000])(
    "uses one countdown range for policy, queue and timer receipt: %s",
    (seconds) => {
      const valid = seconds <= 3600;
      const policy = {
        steps: [
          {
            kind: "pick",
            actor: "firstPick",
            categories: [],
            entryIds: [],
            avoidRepeatCategory: false,
            tiedAt: null,
          },
        ],
        commands: {
          roomSize: 4,
          noFail: true,
          categoryMods: {},
          banSeconds: seconds,
          pickSeconds: seconds,
          prepareSeconds: seconds,
          startSeconds: seconds,
        },
      };
      expect(refereePolicySchema.safeParse(policy).success).toBe(valid);
      for (const kind of ["timer", "start"] as const) {
        expect(allowedIrcCommand(`!mp ${kind} ${seconds}`)).toBe(valid);
      }
      expect(
        confirmsIrcCommand(`!mp timer ${seconds}`, "#mp_123", {
          sender: "BanchoBot",
          target: "#mp_123",
          text: `Countdown ends in ${seconds} seconds`,
        }),
      ).toBe(valid);
    },
  );
  it.each([
    ["!mp mods NF Freemod", "Disabled all mods, enabled FreeMod"],
    ["!mp mods NF DT Freemod", "Enabled DoubleTime, enabled FreeMod"],
    ["!mp mods NF Freemod", "Enabled NoFail, enabled FreeMod"],
  ])("confirms scoped FreeMod room acknowledgement for %s", (command, text) => {
    const evidence = { sender: "BanchoBot", target: "#mp_123", text };
    expect(confirmsIrcCommand(command, "#mp_123", evidence)).toBe(true);
    for (const patch of [
      { sender: "Player" },
      { target: "#mp_124" },
      { text: "Player says " + text },
    ])
      expect(
        confirmsIrcCommand(command, "#mp_123", { ...evidence, ...patch }),
      ).toBe(false);
  });
  it.each([
    ["!mp mods NF", "Disabled all mods, disabled FreeMod"],
    ["!mp mods NF DT Freemod", "Disabled all mods, enabled FreeMod"],
    ["!mp mods NF Freemod", "Disabled all mods, disabled FreeMod"],
    ["!mp mods Freemod", "Enabled NoFail, enabled FreeMod"],
    ["!mp mods NF HR Freemod", "Disabled all mods, enabled FreeMod"],
    ["!mp mods NF Freemod", "Enabled Unknown, enabled FreeMod"],
  ])("rejects mismatched room Mods for %s", (command, text) => {
    expect(
      confirmsIrcCommand(command, "#mp_123", {
        sender: "BanchoBot",
        target: "#mp_123",
        text,
      }),
    ).toBe(false);
  });
  it.each([
    "!mp map 123 0",
    "!mp timer 30",
    "!mp mods NF HD",
    "!mp invite Player_Name",
    "!mp set 2 3 8",
    "!mp start 5",
    "!mp aborttimer",
  ])("allows bounded command %s", (text) =>
    expect(allowedIrcCommand(text)).toBe(true),
  );
  it.each([
    "!mp make hello",
    "!mp password secret",
    "PASS secret",
    "!mp abort\n!mp start 1",
    "!mp invite bad\rname",
    "!mp timer -1",
    "!mp start 9999999",
  ])("rejects unsafe command %s", (text) =>
    expect(allowedIrcCommand(text)).toBe(false),
  );
  it("requires exact Bancho reply, room and map", () => {
    const evidence = {
      sender: "BanchoBot",
      target: "#mp_123",
      text: "Beatmap changed to: Test [Hard] (https://osu.ppy.sh/b/10001)",
    };
    expect(confirmsMap("!mp map 10001 0", "#mp_123", evidence)).toBe(true);
    expect(confirmsMap("!mp map 1000 0", "#mp_123", evidence)).toBe(false);
    expect(confirmsMap("!mp map 10001 0", "#mp_124", evidence)).toBe(false);
    expect(
      confirmsMap("!mp map 10001 0", "#mp_123", {
        ...evidence,
        sender: "Someone",
      }),
    ).toBe(false);
    expect(confirmsMap("!mp start 1", "#mp_123", evidence)).toBe(false);
  });
  it.each([
    "Beatmap changed to: Synthetic (https://osu.ppy.sh/b/75)",
    "Beatmap changed to Synthetic (https://osu.ppy.sh/beatmaps/75)",
    "Changed beatmap to https://osu.ppy.sh/b/75 Kenji Ninuma - DISCO PRINCE",
    "Changed beatmap to https://osu.ppy.sh/beatmaps/75 Synthetic",
  ])("confirms both known map reply formats: %s", (text) => {
    const evidence = { sender: "BanchoBot", target: "#mp_123", text };
    for (const command of ["!mp map 75", "!mp map 75 0"]) {
      expect(confirmsIrcCommand(command, "#mp_123", evidence)).toBe(true);
      for (const patch of [
        { sender: "Someone" },
        { target: "#mp_124" },
        { text: text.replace("/75", "/750") },
        { text: text.replace("osu.ppy.sh", "osu.ppy.sh.invalid") },
        { text: `Player says ${text}` },
        {
          text: text
            .replace("beatmap", "beatmaps")
            .replace("Beatmap", "Beatmaps"),
        },
      ])
        expect(
          confirmsIrcCommand(command, "#mp_123", { ...evidence, ...patch }),
        ).toBe(false);
    }
  });
  it("confirms only recognized exact interruption replies", () => {
    expect(
      confirmsIrcCommand("!mp abort", "#mp_123", {
        sender: "BanchoBot",
        target: "#mp_123",
        text: "Aborted the match",
      }),
    ).toBe(true);
    expect(
      confirmsIrcCommand("!mp aborttimer", "#mp_123", {
        sender: "BanchoBot",
        target: "#mp_123",
        text: "Countdown aborted",
      }),
    ).toBe(true);
    expect(
      confirmsIrcCommand("!mp start 5", "#mp_123", {
        sender: "BanchoBot",
        target: "#mp_123",
        text: "Started match",
      }),
    ).toBe(false);
  });
  it.each([
    ["!mp abort", "Aborted the match."],
    ["!mp abort", "aborted the match"],
    ["!mp aborttimer", "Countdown aborted."],
    ["!mp aborttimer", "countdown aborted"],
    ["!mp aborttimer", "Aborted the match start timer"],
    ["!mp aborttimer", "aborted the match start timer."],
  ])("matches the desktop client's recognized %s reply %s", (command, text) => {
    const evidence = { sender: "BanchoBot", target: "#mp_123", text };
    expect(confirmsIrcCommand(command, "#mp_123", evidence)).toBe(true);
    for (const patch of [
      { sender: "Aster" },
      { target: "#mp_124" },
      { text: `${text} Extra message` },
    ])
      expect(
        confirmsIrcCommand(command, "#mp_123", { ...evidence, ...patch }),
      ).toBe(false);
  });
  it("normalizes nick and excludes credential commands from projection", () => {
    expect(normalizedIrcUsername("Player Name")).toBe("player_name");
    expect(
      safeIrcMessages([
        {
          id: "a",
          sender: "ref",
          text: "!mp password secret",
          at: new Date().toISOString(),
        },
      ]),
    ).toEqual([]);
    expect(
      relaySchema.safeParse({
        action: "bind",
        roomId: 12,
        ircUsername: "x\nPASS secret",
      }).success,
    ).toBe(false);
  });
});

it("separates creation receivers from room commands and rejects injected room titles", () => {
  expect(
    relaySchema.safeParse({ action: "bind", roomId: 0, ircUsername: "Ref" })
      .success,
  ).toBe(true);
  expect(allowedMakeCommand("!mp make OCLR S11: (A) vs (B)")).toBe(true);
  for (const text of [
    "!mp make ",
    "!mp make test\nQUIT",
    "!mp make test\u202e",
    "!mp map 42",
    "!mp make " + "x".repeat(201),
  ])
    expect(allowedMakeCommand(text)).toBe(false);
});

it.each([
  ["!mp timer 30", "Countdown ends in 30 seconds"],
  ["!mp timer 90", "Countdown ends in 1 minute and 30 seconds"],
  ["!mp addref Ref_Name", "Added Ref Name to the match referees"],
])("confirms scoped exact reply for %s", (command, text) => {
  const evidence = { sender: "BanchoBot", target: "#mp_123", text };
  expect(confirmsIrcCommand(command, "#mp_123", evidence)).toBe(true);
  for (const patch of [
    { sender: "Fake" },
    { target: "#mp_124" },
    { text: "prefix " + text },
    {
      text: text
        .replace("30", "20")
        .replace("Ref Name", "Other")
        .replace("1 minute", "2 minutes"),
    },
  ])
    expect(
      confirmsIrcCommand(command, "#mp_123", { ...evidence, ...patch }),
    ).toBe(false);
});
it("does not confirm a completed timer or a queued start as timer acceptance", () => {
  for (const text of [
    "Countdown finished",
    "Queued the match to start in 30 seconds",
    "Countdown ends in 1 minute and 90 seconds",
  ])
    expect(
      confirmsIrcCommand("!mp timer 30", "#mp_123", {
        sender: "BanchoBot",
        target: "#mp_123",
        text,
      }),
    ).toBe(false);
});

it("accepts only bounded receipt reason codes", () => {
  const value = {
    action: "sync",
    connectionId: "00000000-0000-4000-8000-000000000010",
    sequence: 1,
    projection: { status: "connected", messages: [] },
    receipts: [
      {
        commandId: "00000000-0000-4000-8000-000000000011",
        status: "failed",
        reason: "pending_operation",
      },
    ],
  };
  expect(relaySchema.safeParse(value).success).toBe(true);
  value.receipts[0].reason = "private raw error";
  expect(relaySchema.safeParse(value).success).toBe(false);
});

it("confirms every requested room setting and never guesses capacity from an incomplete reply", () => {
  const evidence = {
    sender: "BanchoBot",
    target: "#mp_123",
    text: "Changed match settings to 16 slots, TeamVs, ScoreV2",
  };
  expect(confirmsIrcCommand("!mp set 2 3 16", "#mp_123", evidence)).toBe(true);
  for (const text of [
    "Changed match settings to TeamVs, ScoreV2",
    "Changed match settings to 8 slots, TeamVs, ScoreV2",
    "Changed match settings to 16 slots, HeadToHead, ScoreV2",
    "Changed match settings to 16 slots, TeamVs, Score",
    "prefix " + evidence.text,
  ])
    expect(
      confirmsIrcCommand("!mp set 2 3 16", "#mp_123", { ...evidence, text }),
    ).toBe(false);
  expect(confirmsIrcCommand("!mp set 2 3 16", "#mp_124", evidence)).toBe(false);
  expect(
    confirmsIrcCommand("!mp set 2 3 16", "#mp_123", {
      ...evidence,
      sender: "Player",
    }),
  ).toBe(false);
  expect(
    confirmsIrcCommand("!mp set 2 3", "#mp_123", {
      ...evidence,
      text: "Changed match settings to TeamVs, ScoreV2",
    }),
  ).toBe(true);
});
