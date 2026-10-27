import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { chooseTheme } from "./theme";
import s7Archive from "../../docs/imports/s7-archive.json" with { type: "json" };

const origin = "http://127.0.0.1:3100";

test.describe("S7 Graphite Arena appearance", () => {
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
        slug: "s7",
        season: "7",
        name: "OCLR Season 7",
        status: "completed",
        summary: "Design preview using the committed S7 archive.",
        registration: null,
        rules: null,
        eligibility: null,
        schedule: [],
        archive: s7Archive,
      },
    ]);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  test("follows system brightness and retains S7 through manual overrides and navigation", async ({
    page,
    context,
    isMobile,
  }) => {
    await context.clearCookies();
    await context.addCookies([
      { name: "oclr-locale", value: "en", url: origin },
      { name: "oclr-appearance", value: "graphite-arena", url: origin },
    ]);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/tournaments/s7");
    await page.waitForLoadState("networkidle");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme-preference", "system");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".themed-site")).toHaveCSS(
      "background-color",
      "rgb(23, 28, 32)",
    );
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".themed-site")).toHaveCSS(
      "background-color",
      "rgb(243, 244, 242)",
    );
    await chooseTheme(page, "dark", isMobile);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-appearance", "graphite-arena");
    await chooseTheme(page, "system", isMobile);
    await expect(html).toHaveAttribute("data-theme", "light");
    expect(
      (await context.cookies()).find((c) => c.name === "oclr-theme"),
    ).toBeUndefined();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.goto("/privacy");
    await expect(html).toHaveAttribute("data-theme-preference", "system");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-appearance", "graphite-arena");
  });

  test("selects S7 from the real menu in all locales and persists the shipped light/dark design", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: isMobile ? 320 : 1440, height: 568 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const asset = await context.request.get(
      "/themes/graphite-arena/honeycomb.svg",
    );
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/svg+xml");
    for (const [locale, label] of [
      ["en", "S7 · Graphite Arena"],
      ["zh-Hans", "S7 · 石墨竞技场"],
      ["zh-Hant", "S7 · 石墨競技場"],
    ]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
            ["oclr-appearance", "default"],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        expect((await page.goto("/tournaments/s7"))?.status()).toBe(200);
        // Finish navigation prefetches before deliberately changing cookies or
        // reloading; WebKit reports interrupted in-flight RSC requests as errors.
        await page.waitForLoadState("networkidle");
        const trigger = page.locator(".appearance-trigger");
        await trigger.click();
        const menu = page.getByRole("menu").filter({
          has: page.locator('[data-appearance-option="graphite-arena"]'),
        });
        await expect(menu.getByRole("menuitemradio")).toHaveCount(14);
        await page.keyboard.press("End");
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
          "graphite-arena",
        );
        const response = await page.reload();
        await page.waitForLoadState("networkidle");
        expect((await response!.text()).match(/<html[^>]+>/)?.[0]).toContain(
          'data-appearance="graphite-arena"',
        );
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(243, 244, 242)" : "rgb(23, 28, 32)",
        );
        expect(
          await page
            .locator(".page-heading")
            .evaluate(
              (node) => getComputedStyle(node, "::before").backgroundImage,
            ),
        ).toContain("/themes/graphite-arena/honeycomb.svg");
        const original = page.locator(".archive-key-visual img");
        await expect(original).toHaveAttribute(
          "src",
          "/archive/s7/key-visual.jpg",
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
          "graphite-arena",
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
    await page.goto("/tournaments/s7/schedule");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".match-slot > strong").first()).toHaveCSS(
      "font-family",
      /ui-monospace/,
    );
    await page.goto("/tournaments/s7");
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
    for (const surface of [
      ".site-header",
      ".page-heading",
      ".archive-counts",
      ".tournament-navigation nav",
    ]) {
      await expect(page.locator(surface)).toHaveCSS("background-image", "none");
      await expect(page.locator(surface)).toHaveCSS("box-shadow", "none");
    }
    await page.emulateMedia({ forcedColors: "none" });
    expect(errors).toEqual([]);
  });
});
