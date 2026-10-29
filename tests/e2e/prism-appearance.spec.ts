import { appearances } from "../../src/lib/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import archiveSource from "../../docs/imports/s5-reviewed-import.json" with { type: "json" };
import rules from "../../docs/imports/s5-rulebook.json" with { type: "json" };

const origin = "http://127.0.0.1:3100";

test.describe("S5 Prism Overture appearance", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, site_settings, site_setting_events CASCADE`,
    );
    await seedBrowserEditions();
    const archive = historicalArchiveSchema.parse(archiveSource);
    await seedEditions([
      {
        ...edition,
        defaultAppearance: "prism-overture",
        slug: "s5",
        season: "5",
        name: "OCLR β (S5)",
        status: "completed",
        summary: "Synthetic presentation of the committed S5 archive.",
        registration: null,
        rules: { version: rules.version, sections: rules.sections },
        eligibility: null,
        schedule: [],
        archive,
      },
    ]);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  test("inherits the configured season with a public-only menu, renders SSR and preserves complete artwork", async ({
    page,
    context,
  }, info) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [locale] of [
      ["en", "S5 · Prism Overture"],
      ["zh-Hans", "S5 · 棱光序曲"],
      ["zh-Hant", "S5 · 稜光序曲"],
    ])
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        await page.goto("/tournaments/s5");
        await page.waitForLoadState("networkidle");
        const trigger = page.locator(".appearance-trigger");
        await trigger.click();
        const menu = page.locator('.appearance-control [role="menu"]');
        await expect(menu.getByRole("menuitemradio")).toHaveCount(10);
        await expect(
          menu.locator('[data-appearance-option="prism-overture"]'),
        ).toHaveCount(0);
        await page.keyboard.press("Home");
        const option = menu.getByRole("menuitemradio").first();
        await expect(option).toBeFocused();
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
          'data-appearance="prism-overture"',
        );
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(247, 245, 252)" : "rgb(27, 23, 48)",
        );
        const texture = `/themes/prism-overture/prism-field-${theme}.svg`;
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
          "/archive/s5/key-visual.png",
        );
        await expect(original).toHaveJSProperty("naturalWidth", 1920);
        await expect(original).toHaveJSProperty("naturalHeight", 1080);
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
      "/themes/prism-overture/prism-field-dark.svg",
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
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const theme of ["light", "dark"])
      for (const width of isMobile ? [320, 390, 760] : [768, 937, 1440]) {
        await context.addCookies(
          [
            ["oclr-locale", "zh-Hant"],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        await page.setViewportSize({ width, height: 844 });
        for (const route of ["", "/schedule", "/mappools"]) {
          expect((await page.goto(`/tournaments/s5${route}`))?.status()).toBe(
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
