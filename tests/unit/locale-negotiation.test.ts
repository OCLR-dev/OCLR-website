import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTranslator } from "next-intl";
import { readLocale } from "../../src/i18n/config";
import { proxy } from "../../src/proxy";
import getConfig from "../../src/i18n/request";

const request = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  language: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      request.cookie === undefined ? undefined : { value: request.cookie },
  }),
  headers: async () =>
    new Headers(
      request.language ? { "accept-language": request.language } : {},
    ),
}));
vi.mock("next-intl/server", () => ({
  getRequestConfig: (callback: unknown) => callback,
}));
afterEach(() => {
  request.cookie = undefined;
  request.language = undefined;
  vi.unstubAllEnvs();
});

describe("browser language negotiation", () => {
  it.each([
    ["en", "en"],
    ["en-US", "en"],
    ["en-GB", "en"],
    ["zh", "zh-Hans"],
    ["zh-CN", "zh-Hans"],
    ["zh-SG", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-MO", "zh-Hant"],
    ["zh-Hant", "zh-Hant"],
    ["zh-Hans", "zh-Hans"],
    ["zh-Hant-CN", "zh-Hant"],
    ["zh-Hans-TW", "zh-Hans"],
    ["ZH-hk", "zh-Hant"],
    ["zh-Latn, en;q=0.5", "en"],
    ["fr-FR, en-GB;q=0.8, zh-TW;q=0.5", "en"],
    ["en;q=0.1, zh-HK;q=0.9", "zh-Hant"],
    ["zh-Hant;q=0.5, en;q=0.5", "zh-Hant"],
    ["en;q=0.5, zh-Hant;q=0.5", "en"],
    [" en-US ; q=0.800 , zh-HK;q=0.7 ", "en"],
    ["en;q=0, zh-TW;q=1", "zh-Hant"],
    ["en;q=0.000, zh-TW;q=1.000", "zh-Hant"],
    ["*, en;q=0.5", "en"],
    ["en;q=2, zh-HK;q=0.5", "zh-Hant"],
    ["en;q=-1, zh-HK;q=0.5", "zh-Hant"],
    ["en;q=NaN, zh-HK;q=0.5", "zh-Hant"],
    ["en;q=0.1234, zh-HK;q=0.5", "zh-Hant"],
    ["en;q=0.8;q=0.9, zh-HK;q=0.5", "zh-Hant"],
    ["en_US, zh-HK;q=0.5", "zh-Hant"],
    ["en--US, zh-HK;q=0.5", "zh-Hant"],
    ["en-abcdefghi, zh-HK;q=0.5", "zh-Hant"],
    [undefined, "zh-Hans"],
    [null, "zh-Hans"],
    ["", "zh-Hans"],
    ["fr-FR, ja-JP;q=0.8", "zh-Hans"],
    ["*", "zh-Hans"],
    ["en;q=0, zh-Hant;q=0", "zh-Hans"],
    ["<script>, ../../private", "zh-Hans"],
  ])("matches %s to %s", (header, expected) => {
    expect(readLocale(undefined, header)).toBe(expected);
  });

  it.each(["en", "zh-Hant", "zh-Hans"])(
    "keeps manual %s above the environment",
    (cookie) => {
      for (const header of ["en", "zh-HK", "zh-CN", "invalid", undefined])
        expect(readLocale(cookie, header)).toBe(cookie);
    },
  );
  it.each(["", "zh", "en-US", "../../private", "<script>"])(
    "detects the environment when cookie %s is invalid",
    (cookie) => expect(readLocale(cookie, "zh-HK")).toBe("zh-Hant"),
  );

  it("uses the same request locale, translated catalog and response header without persisting detection", async () => {
    vi.stubEnv("APP_URL", "https://oclr.example.test");
    vi.stubEnv("OCLR_DATA_SOURCE", "database");
    // Sequential requests also catch accidentally cached environment detection.
    for (const [cookie, language, expected] of [
      [undefined, "zh-HK", "zh-Hant"],
      [undefined, "en-GB", "en"],
      [undefined, "zh-CN", "zh-Hans"],
      ["invalid", "zh-TW", "zh-Hant"],
      ["zh-Hans", "en-US", "zh-Hans"],
      ["en", "zh-TW", "en"],
    ]) {
      request.cookie = cookie;
      request.language = language;
      const config = await getConfig({
        requestLocale: Promise.resolve(undefined),
      });
      const response = proxy(
        new NextRequest("https://oclr.example.test/login", {
          headers: {
            host: "oclr.example.test",
            "accept-language": language!,
            ...(cookie ? { cookie: `oclr-locale=${cookie}` } : {}),
          },
        }),
      );
      expect(config.locale).toBe(expected);
      expect(response.headers.get("content-language")).toBe(expected);
      expect(response.headers.get("set-cookie")).toBeNull();
      const tr = createTranslator({
        locale: config.locale!,
        messages: config.messages!,
      });
      expect(tr("ui.navigation_home")).toBe(
        expected === "en" ? "Home" : expected === "zh-Hant" ? "首頁" : "首页",
      );
      expect(config.timeZone).toBe("UTC");
    }
  });
});
