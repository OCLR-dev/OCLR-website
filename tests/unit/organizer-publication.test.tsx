import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { appTranslator, english } from "../../src/i18n/translate";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import About from "../../src/app/about/page";
import { publicStaff } from "../../src/lib/public-staff";
let translator = english;
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => translator,
}));
vi.mock("../../src/i18n/shared", () => ({ useAppTranslations: () => english }));
vi.mock("../../src/lib/public-staff", () => ({ publicStaff: vi.fn() }));
vi.mock("../../src/lib/auth/config", () => ({ privacyContact: () => null }));
async function render() {
  return new Response(await renderToReadableStream(await About())).text();
}
describe("organizer directory publication", () => {
  beforeEach(() => {
    translator = english;
    vi.stubGlobal("React", React);
    vi.mocked(publicStaff).mockResolvedValue([]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it.each([
    [
      "zh-Hans",
      hans,
      ["选图", "打图录像", "图池测试", "直播", "裁判", "工作人员", "开发者"],
    ],
    [
      "zh-Hant",
      hant,
      ["選圖", "打圖錄像", "圖池測試", "直播", "裁判", "工作人員", "開發者"],
    ],
  ] as const)(
    "localizes the directory, section titles and saved role codes in %s",
    async (locale, catalog, labels) => {
      const native = createTranslator({ locale, messages: catalog.ui });
      translator = appTranslator(
        (key, values) => native(key as keyof typeof catalog.ui, values),
        locale,
      );
      vi.mocked(publicStaff).mockResolvedValue([
        {
          osuId: 4242,
          username: "Published Replayer",
          countryCode: null,
          roles: [
            "mappooler",
            "replayer",
            "tester",
            "streamer",
            "referee",
            "developer",
          ].map((role) => ({ role, edition: null })),
        },
      ]);
      const html = await render();
      for (const [index, id] of [
        "pooler",
        "replayer",
        "tester",
        "streamer",
        "referee",
        "staff",
        "developer",
      ].entries()) {
        expect(html).toContain(`href="#${id}">${labels[index]}</a>`);
        expect(html).toContain(`id="${id}-title">${labels[index]}</h`);
      }
      for (const label of labels.slice(0, 5))
        expect(html).toContain(`<span class="staff-role-name">${label}</span>`);
      expect(html).toContain("Published Replayer");
    },
  );
  it.each(["production", "test"])(
    "keeps placeholder identities out of %s",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      const html = await render();
      expect(html).toContain("Public staff profiles have not been announced.");
      for (const name of [
        "Northwind",
        "Komorebi",
        "Yukino",
        "Daybreak",
        "Shiro",
        "Kite",
      ])
        expect(html).not.toContain(`<h4>${name}</h4>`);
    },
  );
  it("renders published people without filling other roles with placeholders", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(publicStaff).mockResolvedValue([
      {
        osuId: 4242,
        username: "Published Pooler",
        countryCode: null,
        roles: [{ role: "mappooler", edition: null }],
      },
    ]);
    const html = await render();
    expect(html).toContain("Published Pooler");
    expect(html).toContain("https://osu.ppy.sh/users/4242");
    expect(html).not.toContain("Northwind");
    expect(html).not.toContain("Kite");
  });
  it("renders published Replayers in their own section", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(publicStaff).mockResolvedValue([
      {
        osuId: 4244,
        username: "Published Replayer",
        countryCode: null,
        roles: [{ role: "replayer", edition: null }],
      },
    ]);
    const html = await render();
    const section = html.match(
      /<section class="organizer-group" id="replayer"[\s\S]*?<\/section>/,
    )?.[0];
    expect(section).toContain("Published Replayer");
    expect(section).toContain("Replayer");
    expect(section).toContain("All editions");
  });
  it("retains the visual sample directory in development only", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const html = await render();
    expect(html).toContain("Northwind");
    expect(html).toContain("Komorebi");
  });
  it("renders an approved Developer in its own section", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(publicStaff).mockResolvedValue([
      {
        osuId: 4243,
        username: "Published Developer",
        countryCode: null,
        roles: [{ role: "developer", edition: null }],
      },
    ]);
    const html = await render();
    const section = html.match(
      /<section id="developer"[\s\S]*?<\/section>/,
    )?.[0];
    expect(section).toContain("Published Developer");
    expect(section).toContain('href="https://osu.ppy.sh/users/4243"');
    expect(section).toContain('src="https://a.ppy.sh/4243"');
    expect(section).toContain("All editions");
    expect(section).not.toContain("Not announced");
    expect(html).not.toContain("Kite");
  });
});
