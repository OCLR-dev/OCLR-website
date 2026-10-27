import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import s8Archive from "../../docs/imports/s8-archive.json" with { type: "json" };

const origin = "http://127.0.0.1:3100";

test.describe("S8 Sakura Circuit appearance", () => {
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
        slug: "s8",
        season: "8",
        name: "OCLR Season 8",
        status: "completed",
        summary: "Design preview using the committed S8 archive.",
        registration: null,
        rules: null,
        eligibility: null,
        schedule: [],
        archive: s8Archive,
      },
    ]);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  test("selects S8 from the real menu in all locales and persists the shipped light/dark design", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: isMobile ? 320 : 1440, height: 568 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const asset = await context.request.get(
      "/themes/sakura-circuit/heroine-half.webp",
    );
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/webp");
    for (const name of ["blossom-spray.webp", "source-rules-banner.png"]) {
      expect(
        (await context.request.get(`/themes/sakura-circuit/${name}`)).status(),
      ).toBe(200);
    }
    for (const [locale, label] of [
      ["en", "S8 · Sakura Circuit"],
      ["zh-Hans", "S8 · 樱花折线"],
      ["zh-Hant", "S8 · 櫻花折線"],
    ]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
            ["oclr-appearance", "default"],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        expect((await page.goto("/tournaments/s8"))?.status()).toBe(200);
        // Finish navigation prefetches before deliberately changing cookies or
        // reloading; WebKit reports interrupted in-flight RSC requests as errors.
        await page.waitForLoadState("networkidle");
        const trigger = page.locator(".appearance-trigger");
        await trigger.click();
        const menu = page.getByRole("menu").filter({
          has: page.locator('[data-appearance-option="sakura-circuit"]'),
        });
        await expect(menu.getByRole("menuitemradio")).toHaveCount(14);
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
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "sakura-circuit",
        );
        const response = await page.reload();
        await page.waitForLoadState("networkidle");
        expect((await response!.text()).match(/<html[^>]+>/)?.[0]).toContain(
          'data-appearance="sakura-circuit"',
        );
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(255, 248, 250)" : "rgb(36, 26, 34)",
        );
        expect(
          await page
            .locator(".page-heading")
            .evaluate(
              (node) => getComputedStyle(node, "::before").backgroundImage,
            ),
        ).toContain("/themes/sakura-circuit/heroine-half.webp");
        const banner = page.locator(
          '.rules-illustration img[src="/archive/s8/rules-1.png"]',
        );
        await expect(banner).toHaveCount(1);
        expect(
          await banner.evaluate((node) => getComputedStyle(node).content),
        ).toContain("/themes/sakura-circuit/source-rules-banner.png");
        const original = page.locator(".archive-key-visual img");
        await expect(original).toHaveAttribute(
          "src",
          "/archive/s8/thumbnail.jpg",
        );
        await expect(original).toHaveJSProperty("naturalWidth", 1920);
        await expect(original).toHaveJSProperty("naturalHeight", 1080);
        await expect(original).toHaveCSS("object-fit", "contain");
        await expect(page.locator(".glacier-attribution")).toBeHidden();
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
        await page.goto("/privacy");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "sakura-circuit",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        // The global information link may target a featured edition rather
        // than this historical archive. Follow its real href to test selection.
        const informationHref = await page
          .locator('.main-nav > a[href^="/tournaments"]')
          .getAttribute("href");
        expect(informationHref).toBeTruthy();
        await page.goto(informationHref!);
        await page.waitForLoadState("networkidle");
        if (isMobile) await page.locator(".menu-toggle").click();
        const currentNavigation = page.locator(".main-nav > a[aria-current]");
        await expect(currentNavigation).toHaveCount(1);
        await expect(currentNavigation).toHaveCSS(
          "background-color",
          "rgba(0, 0, 0, 0)",
        );
        await expect(currentNavigation).toHaveCSS("box-shadow", "none");
        await expect(currentNavigation).toHaveCSS("border-bottom-width", "1px");
        await expect(currentNavigation).toBeVisible();
      }
    }
    await page.goto("/tournaments/s8");
    await page.waitForLoadState("networkidle");
    await page.emulateMedia({
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    expect(
      await page
        .locator(".page-heading")
        .evaluate((node) => getComputedStyle(node, "::before").display),
    ).toBe("none");
    expect(
      await page
        .locator('.rules-illustration img[src="/archive/s8/rules-1.png"]')
        .evaluate((node) => getComputedStyle(node).content),
    ).toBe("normal");
    await page.emulateMedia({ forcedColors: "none" });
    await context.addCookies([
      { name: "oclr-appearance", value: "default", url: origin },
    ]);
    await page.reload();
    expect(
      await page
        .locator('.rules-illustration img[src="/archive/s8/rules-1.png"]')
        .evaluate((node) => getComputedStyle(node).content),
    ).toBe("normal");
    expect(errors).toEqual([]);
  });
});
