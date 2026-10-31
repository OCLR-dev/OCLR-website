import { describe, it, expect } from "vitest";
import { desktopLaunchUrl } from "../../src/lib/desktop-launch";
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
