import { describe, it, expect } from "vitest";
import {
  desktopLaunchUrl,
  desktopRoomJoinUrl,
} from "../../src/lib/desktop-launch";
describe("desktop launch URL", () => {
  it("contains only the fixture ID and accepts no command or host payload", () => {
    const id = "00000000-0000-4000-8000-000000000010";
    expect(desktopLaunchUrl(id)).toBe(`oclr-irc://connect?fixture=${id}`);
    for (const value of [
      id + "&token=secret",
      "//evil.invalid",
      "!mp make x",
      "../../private",
      "",
    ])
      expect(desktopLaunchUrl(value)).toBeNull();
  });
});

describe("desktop room join URL", () => {
  it("only accepts positive safe numeric MP IDs", () => {
    expect(desktopRoomJoinUrl(122095632)).toBe(
      "oclr-irc://join?room=122095632",
    );
    expect(desktopRoomJoinUrl(Number.MAX_SAFE_INTEGER)).toContain(
      String(Number.MAX_SAFE_INTEGER),
    );
    for (const value of [
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      Infinity,
      NaN,
      null,
      undefined,
      "123",
      "123&command=!mp start",
      "#mp_123",
    ])
      expect(desktopRoomJoinUrl(value)).toBeNull();
  });
});
