import { appearances } from "../../src/lib/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import s10Archive from "../../docs/imports/s10-archive.json" with { type: "json" };

const origin = "http://127.0.0.1:3100";

test.describe("S10 Skyline Pop appearance", () => {
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
        defaultAppearance: "skyline-pop",
        slug: "s10",
        season: "10",
        name: "OCLR Season 10",
        status: "completed",
        summary: "Design preview using the committed S10 archive.",
        registration: null,
        rules: null,
        eligibility: null,
        schedule: [],
        archive: s10Archive,
      },
    ]);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  test("inherits configured S10 in all locales and renders the shipped light/dark design", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: isMobile ? 320 : 1440, height: 568 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const asset = await context.request.get("/themes/skyline-pop/coast.webp");
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/webp");
    for (const [locale] of [
      ["en", "S10 · Skyline Pop"],
      ["zh-Hans", "S10 · 晴空未来城"],
      ["zh-Hant", "S10 · 晴空未來城"],
    ]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        expect((await page.goto("/tournaments/s10"))?.status()).toBe(200);
        const trigger = page.locator(".appearance-trigger");
        await trigger.click();
        const menu = page.locator('.appearance-control [role="menu"]');
        await expect(menu.getByRole("menuitemradio")).toHaveCount(10);
        await expect(
          menu.locator('[data-appearance-option="skyline-pop"]'),
        ).toHaveCount(0);
        await page.keyboard.press("Home");
        const option = menu.getByRole("menuitemradio").first();
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
          "skyline-pop",
        );
        const response = await page.reload();
        expect((await response!.text()).match(/<html[^>]+>/)?.[0]).toContain(
          'data-appearance="skyline-pop"',
        );
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(255, 250, 240)" : "rgb(17, 29, 56)",
        );
        expect(
          await page
            .locator(".page-heading")
            .evaluate(
              (node) => getComputedStyle(node, "::before").backgroundImage,
            ),
        ).toContain("/themes/skyline-pop/coast.webp");
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
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "default",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      }
    }
    await page.goto("/tournaments/s10");
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
