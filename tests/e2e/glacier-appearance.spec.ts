import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import s9Archive from "../../docs/imports/s9-archive.json" with { type: "json" };

const origin = "http://127.0.0.1:3100";

test.describe("S9 Glacier Blue appearance", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, site_settings, site_setting_events CASCADE`,
    );
    await seedBrowserEditions();
    await seedEditions([
      {
        ...edition,
        slug: "s9",
        season: "9",
        name: "OCLR Season 9",
        status: "completed",
        summary: "Design preview using the committed S9 archive.",
        registration: null,
        rules: null,
        eligibility: null,
        schedule: [],
        archive: s9Archive,
      },
    ]);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  test("selects S9 from the real menu in all locales and persists the shipped light/dark design", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: isMobile ? 320 : 1440, height: 568 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const asset = await context.request.get(
      "/themes/glacier-blue/cirno-ice-fairy.webp",
    );
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/webp");
    for (const name of [
      "crystal-etching.svg",
      "frost-rim.svg",
      "ice-facets.svg",
    ]) {
      expect(
        (await context.request.get(`/themes/glacier-blue/${name}`)).status(),
      ).toBe(200);
    }
    for (const [locale, label, credit] of [
      [
        "en",
        "S9 · Glacier Blue",
        "Touhou Project fan art · Cirno © Team Shanghai Alice / ZUN",
      ],
      [
        "zh-Hans",
        "S9 · 冰晶钴蓝",
        "东方Project 二次创作 · 琪露诺 ©上海アリス幻樂団 / ZUN",
      ],
      [
        "zh-Hant",
        "S9 · 冰晶鈷藍",
        "東方Project 二次創作 · 琪露諾 ©上海アリス幻樂団 / ZUN",
      ],
    ]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
            ["oclr-appearance", "default"],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        expect((await page.goto("/tournaments/s9"))?.status()).toBe(200);
        await expect(page.locator(".glacier-attribution")).toBeHidden();
        const trigger = page.locator(".appearance-trigger");
        await trigger.click();
        const menu = page.getByRole("menu").filter({
          has: page.locator('[data-appearance-option="glacier-blue"]'),
        });
        await expect(menu.getByRole("menuitemradio")).toHaveCount(13);
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowUp");
        const option = menu.getByRole("menuitemradio", {
          name: label,
          exact: true,
        });
        await expect(option).toBeFocused();
        const box = (await menu.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(568);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(
          page.viewportSize()!.width,
        );
        await option.click();
        await expect(trigger).toBeFocused();
        await expect(page.locator(".glacier-attribution")).toBeVisible();
        await expect(page.locator(".glacier-attribution")).toHaveText(credit);
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "glacier-blue",
        );
        const response = await page.reload();
        expect((await response!.text()).match(/<html[^>]+>/)?.[0]).toContain(
          'data-appearance="glacier-blue"',
        );
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(244, 249, 254)" : "rgb(13, 24, 44)",
        );
        expect(
          await page
            .locator(".page-heading")
            .evaluate(
              (node) => getComputedStyle(node, "::before").backgroundImage,
            ),
        ).toContain("/themes/glacier-blue/cirno-ice-fairy.webp");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`${locale}-${theme}.png`),
          animations: "disabled",
        });
        await expect(page.locator(".glacier-attribution")).toBeVisible();
        await page.goto("/privacy");
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "glacier-blue",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      }
    }
    await page.goto("/tournaments/s9");
    await page.emulateMedia({
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    expect(
      await page
        .locator(".page-heading")
        .evaluate((node) => getComputedStyle(node, "::before").display),
    ).toBe("none");
    expect(errors).toEqual([]);
  });
});
