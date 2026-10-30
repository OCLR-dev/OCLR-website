import { describe, it, expect } from "vitest";
import {
  allowedIrcCommand,
  confirmsMap,
  confirmsIrcCommand,
  normalizedIrcUsername,
  safeIrcMessages,
  relaySchema,
} from "../../src/lib/referee-irc-model";
describe("IRC relay boundary", () => {
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
