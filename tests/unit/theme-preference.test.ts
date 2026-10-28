import { describe, expect, it } from "vitest";
import {
  readThemePreference,
  resolveTheme,
  systemThemeCookie,
  themeCookie,
  themeScript,
} from "../../src/lib/preferences";

function runThemeScript({
  cookie = "",
  dark = false,
  matchMedia = true,
  protocol = "https:",
  serverTheme = "light",
}: {
  cookie?: string;
  dark?: boolean;
  matchMedia?: boolean;
  protocol?: string;
  serverTheme?: string;
}) {
  const written: string[] = [];
  const document = {
    documentElement: { dataset: { theme: serverTheme } },
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      written.push(value);
    },
  };
  new Function("document", "matchMedia", "location", themeScript)(
    document,
    matchMedia ? () => ({ matches: dark }) : undefined,
    { protocol },
  );
  return { theme: document.documentElement.dataset.theme, written };
}

describe("light/dark preference", () => {
  it("keeps saved manual choices and follows the system otherwise", () => {
    expect(themeCookie).toBe("oclr-theme");
    expect(systemThemeCookie).toBe("oclr-system-theme");
    expect(readThemePreference("light")).toBe("light");
    expect(readThemePreference("dark")).toBe("dark");
    for (const value of [undefined, "", "system", "auto", "DARK", "<script>"])
      expect(readThemePreference(value)).toBe("system");
  });
  it("resolves the effective theme without turning detection into a choice", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
    for (const hint of [undefined, "", "invalid"])
      expect(resolveTheme("system", hint)).toBe("light");
  });
  it("applies the system brightness before paint when no manual choice exists", () => {
    const result = runThemeScript({ dark: true });
    expect(result.theme).toBe("dark");
    expect(result.written).toEqual([
      "oclr-system-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    ]);
    expect(runThemeScript({ dark: false, serverTheme: "dark" }).theme).toBe(
      "light",
    );
  });
  it("lets a manual choice win while still recording the system hint", () => {
    const result = runThemeScript({
      cookie: "oclr-locale=en; oclr-theme=light",
      dark: true,
      protocol: "http:",
    });
    expect(result.theme).toBe("light");
    expect(result.written).toEqual([
      "oclr-system-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax",
    ]);
    expect(
      runThemeScript({ cookie: "oclr-theme=dark; oclr-system-theme=light" })
        .theme,
    ).toBe("dark");
  });
  it("ignores invalid values and avoids rewriting a current hint", () => {
    expect(
      runThemeScript({
        cookie: "oclr-theme=system; oclr-system-theme=dark",
        dark: true,
      }),
    ).toEqual({ theme: "dark", written: [] });
    expect(
      runThemeScript({ cookie: "xoclr-theme=dark", dark: false }).theme,
    ).toBe("light");
  });
  it("keeps the server-rendered theme where matchMedia is unavailable", () => {
    expect(runThemeScript({ matchMedia: false, serverTheme: "dark" })).toEqual({
      theme: "dark",
      written: [],
    });
  });
});
