import { appearances } from "../../src/lib/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { frostPreview } from "../fixtures/frost-preview";

const origin = process.env.OCLR_E2E_ORIGIN ?? "http://127.0.0.1:3100";

test.describe("S3 Frost Waltz appearance", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, site_settings, site_setting_events CASCADE`,
    );
    await seedBrowserEditions();
    await seedEditions([frostPreview]);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  test("selects all three labels with keyboard, persists SSR and preserves complete artwork", async ({
    page,
    context,
  }, info) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [locale, label] of [
      ["en", "S3 · Frost Waltz"],
      ["zh-Hans", "S3 · 雪花圆舞曲"],
      ["zh-Hant", "S3 · 雪花圓舞曲"],
    ])
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
            ["oclr-appearance", "default"],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        await page.goto("/tournaments/s3");
        await page.waitForLoadState("networkidle");
        const trigger = page.locator(".appearance-trigger");
        await trigger.click();
        const menu = page.getByRole("menu").filter({
          has: page.locator('[data-appearance-option="frost-waltz"]'),
        });
        await expect(menu.getByRole("menuitemradio")).toHaveCount(
          appearances.length + 1,
        );
        await page.keyboard.press("End");
        for (
          let step = appearances.indexOf("frost-waltz");
          step < appearances.length - 1;
          step++
        )
          await page.keyboard.press("ArrowUp");
        await expect(
          menu.getByRole("menuitemradio", { name: label, exact: true }),
        ).toBeFocused();
        const box = (await menu.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(
          page.viewportSize()!.height,
        );
        await page.keyboard.press("Enter");
        await expect(trigger).toBeFocused();
        const response = await page.reload();
        await page.waitForLoadState("networkidle");
        expect((await response!.text()).match(/<html[^>]+>/)?.[0]).toContain(
          'data-appearance="frost-waltz"',
        );
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(242, 250, 255)" : "rgb(16, 30, 42)",
        );
        const texture = `/themes/frost-waltz/frost-field-${theme}.svg`;
        expect(
          await page
            .locator(".page-heading")
            .evaluate((n) => getComputedStyle(n).backgroundImage),
        ).toContain(texture);
        expect(
          await page.evaluate(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            return image.naturalWidth > 0 && image.naturalHeight > 0;
          }, texture),
        ).toBe(true);
        const original = page.locator(".archive-key-visual img");
        await expect(original).toHaveAttribute(
          "src",
          "/archive/s3/key-visual.avif",
        );
        await expect(original).toHaveJSProperty("naturalWidth", 995);
        await expect(original).toHaveJSProperty("naturalHeight", 621);
        await expect(original).toHaveCSS("object-fit", "contain");
        await expect(page.locator(".archive-counts > div")).toHaveCount(5);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${locale}-${theme}.png`),
          animations: "disabled",
        });
      }
    const asset = await page.request.get(
      "/themes/frost-waltz/frost-field-dark.svg",
    );
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/svg+xml");
    expect(errors).toEqual([]);
  });

  test("keeps long data, narrow layouts, reduced motion and forced colours readable", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(180000);
    await seedEditions([
      { ...frostPreview, name: "S3 · 合成長名稱外觀測試 ".repeat(5) },
    ]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const theme of ["light", "dark"])
      for (const width of isMobile ? [320, 390, 760] : [768, 937, 1440]) {
        await context.addCookies(
          [
            ["oclr-locale", "zh-Hant"],
            ["oclr-theme", theme],
            ["oclr-appearance", "frost-waltz"],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        await page.setViewportSize({ width, height: 844 });
        for (const route of ["", "/schedule", "/mappools"]) {
          expect((await page.goto(`/tournaments/s3${route}`))?.status()).toBe(
            200,
          );
          await page.waitForLoadState("networkidle");
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          const heading = page.locator(".page-heading").first();
          await expect(heading).toHaveCSS("animation-name", "none");
          expect(
            await heading.evaluate((n) =>
              [...n.querySelectorAll("h1,p")].every(
                (el) => el.scrollWidth <= el.clientWidth,
              ),
            ),
          ).toBe(true);
        }
        await page.emulateMedia({ forcedColors: "active" });
        await expect(page.locator(".page-heading").first()).toHaveCSS(
          "background-image",
          "none",
        );
        expect(
          await page
            .locator(".page-heading")
            .first()
            .evaluate((n) => getComputedStyle(n, "::before").display),
        ).toBe("none");
        await page.emulateMedia({ forcedColors: "none" });
      }
  });
});
