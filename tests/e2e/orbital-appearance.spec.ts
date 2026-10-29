import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import {
  historicalArchiveSchema,
  approveArchiveMatches,
} from "../../src/lib/historical-archive";
import archiveSource from "../../docs/imports/s6-confirmed-archive.json" with { type: "json" };
import rules from "../../docs/imports/s6-configured-rules.json" with { type: "json" };

const origin = "http://127.0.0.1:3100";

test.describe("S6 Orbital Pulse appearance", () => {
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
        slug: "s6",
        season: "6",
        name: "OCLR Season 6",
        status: "completed",
        summary: "Synthetic presentation of the committed S6 archive.",
        registration: null,
        rules,
        eligibility: null,
        schedule: [],
        archive: approveArchiveMatches(
          archive,
          archive.matches.map((m) => m.id),
          {
            approvedOn: "2026-10-25",
            source:
              "Synthetic UI fixture of organizer-attested S6 approval; docs/s6-archive.md",
          },
        ),
      },
    ]);
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
      ["en", "S6 · Orbital Pulse"],
      ["zh-Hans", "S6 · 星环脉冲"],
      ["zh-Hant", "S6 · 星環脈衝"],
    ])
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
            ["oclr-appearance", "default"],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        await page.goto("/tournaments/s6");
        await page.waitForLoadState("networkidle");
        const trigger = page.locator(".appearance-trigger");
        await trigger.click();
        const menu = page.getByRole("menu").filter({
          has: page.locator('[data-appearance-option="orbital-pulse"]'),
        });
        await expect(menu.getByRole("menuitemradio")).toHaveCount(19);
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
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
          'data-appearance="orbital-pulse"',
        );
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(244, 246, 252)" : "rgb(12, 20, 40)",
        );
        expect(
          await page
            .locator(".page-heading")
            .evaluate((n) => getComputedStyle(n, "::before").backgroundImage),
        ).toContain("/themes/orbital-pulse/music-spectrum.svg");
        const circuit = `/themes/orbital-pulse/circuit-${theme}.svg`;
        expect(
          await page
            .locator(".page-heading")
            .evaluate((n) => getComputedStyle(n).backgroundImage),
        ).toContain(circuit);
        expect(
          await page.evaluate(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            return image.naturalWidth > 0 && image.naturalHeight > 0;
          }, circuit),
        ).toBe(true);
        const original = page.locator(".archive-key-visual img");
        await expect(original).toHaveAttribute(
          "src",
          "/archive/s6/key-visual.jpg",
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
      "/themes/orbital-pulse/music-spectrum.svg",
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
            ["oclr-appearance", "orbital-pulse"],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        await page.setViewportSize({ width, height: 844 });
        for (const route of ["", "/schedule", "/mappools"]) {
          expect((await page.goto(`/tournaments/s6${route}`))?.status()).toBe(
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
