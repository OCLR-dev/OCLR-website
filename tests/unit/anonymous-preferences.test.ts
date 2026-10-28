import { describe, expect, it } from "vitest";
import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
describe("anonymous automatic cookie allowlist", () => {
  for (const [name, value] of [
    ["oclr-locale", "en"],
    ["oclr-locale", "zh-Hans"],
    ["oclr-locale", "zh-Hant"],
    ["oclr-system-theme", "light"],
    ["oclr-system-theme", "dark"],
  ])
    it(`allows ${name}=${value}`, () =>
      expect(isAutomaticPreferenceCookie({ name, value })).toBe(true));
  for (const [name, value] of [
    ["oclr_session", "synthetic"],
    ["__Host-oclr_session", "synthetic"],
    ["tracking", "synthetic"],
    ["oclr-theme", "dark"],
    ["oclr-appearance", "default"],
    ["oclr-system-theme", "unknown"],
    ["oclr-locale", "unknown"],
  ])
    it(`rejects ${name}=${value}`, () =>
      expect(isAutomaticPreferenceCookie({ name, value })).toBe(false));
});
