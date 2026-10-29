import { appearances } from "../../src/lib/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedSession } from "./session";
import { seedEditions, setEditionAppearance } from "../fixtures/editions";
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
        defaultAppearance: "graphite-arena",
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

  test("keeps the admin sidebar rectangular and follows the current route", async ({
    context,
    isMobile,
  }) => {
    test.setTimeout(180000);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await context.route("https://a.ppy.sh/**", (route) =>
      route.fulfill({ status: 404, body: "" }),
    );
    const errors: string[] = [];
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"])
        for (const width of isMobile ? [320, 390, 760] : [768, 937, 1440]) {
          const page = await context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          await page.setViewportSize({ width, height: 815 });
          await context.addCookies(
            [
              ["oclr-locale", locale],
              ["oclr-theme", theme],
            ].map(([name, value]) => ({ name, value, url: origin })),
          );
          expect((await page.goto("/admin/tournaments/s7"))?.status()).toBe(
            200,
          );
          await page.waitForLoadState("networkidle");
          const toggle = page.locator(".admin-menu-toggle");
          if (width <= 760) {
            await expect(page.locator("#admin-menu")).toBeHidden();
            await toggle.click();
            await expect(toggle).toHaveAttribute("aria-expanded", "true");
          }
          const group = page.locator("#admin-menu .admin-nav-group").first();
          const links = group.locator("a");
          await expect(links).toHaveCount(4);
          const expected = ["", "/archive", "/statistics", "/settings"];
          for (let i = 0; i < expected.length; i++)
            await expect(links.nth(i)).toHaveAttribute(
              "href",
              `/admin/tournaments/s7${expected[i]}`,
            );
          for (const link of await links.all()) {
            await expect(link).toBeVisible();
            await expect(link).toHaveCSS("border-radius", "2px");
            expect(
              await link.evaluate(
                (n) =>
                  n.getBoundingClientRect().height >= 44 &&
                  n.scrollWidth <= n.clientWidth,
              ),
            ).toBe(true);
          }
          const current = group.locator('a[aria-current="page"]');
          await expect(current).toHaveCount(1);
          await expect(current).toHaveAttribute(
            "href",
            "/admin/tournaments/s7",
          );
          await expect(current).toHaveCSS("border-inline-start-width", "3px");
          expect(
            await current.evaluate((n) => getComputedStyle(n).backgroundImage),
          ).toContain("linear-gradient");
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          if (width === (isMobile ? 390 : 937)) {
            expect(
              (
                await new AxeBuilder({ page })
                  .include(".sidebar")
                  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                  .analyze()
              ).violations,
            ).toEqual([]);
            // Switch from the touch-opened menu to keyboard focus modality.
            await page.keyboard.press("Tab");
            await links.last().focus();
            await expect(links.last()).toHaveCSS("outline-style", /solid|auto/);
            await page.keyboard.press("Enter");
            await expect(page).toHaveURL(/\/admin\/tournaments\/s7\/settings$/);
            await page.waitForLoadState("networkidle");
            if (width <= 760) {
              await expect(toggle).toHaveAttribute("aria-expanded", "false");
              await toggle.click();
            }
            const selected = page.locator('#admin-menu a[aria-current="page"]');
            await expect(selected).toHaveCount(1);
            await expect(selected).toHaveAttribute(
              "href",
              "/admin/tournaments/s7/settings",
            );
            await page.emulateMedia({ forcedColors: "active" });
            await expect(selected).toHaveCSS("background-image", "none");
            await expect(selected).toHaveCSS("box-shadow", "none");
            await expect(selected).toHaveCSS("outline-style", "solid");
          }
          await page.waitForLoadState("networkidle");
          await page.close();
        }
    expect(errors).toEqual([]);
  });

  test("keeps mappool text actions clear and long titles readable", async ({
    context,
    isMobile,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    // Cover-provider failures must not affect title layout or the real controls.
    await context.route("https://assets.ppy.sh/**", (route) =>
      route.fulfill({ status: 404, body: "" }),
    );
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"])
        for (const width of isMobile ? [320, 390, 699] : [655, 699, 1440]) {
          // Keep matrix cases on independent pages so a deliberate preference or
          // viewport change never interrupts the previous page's RSC prefetches.
          const page = await context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          await page.setViewportSize({ width, height: 815 });
          await context.addCookies(
            [
              ["oclr-locale", locale],
              ["oclr-theme", theme],
            ].map(([name, value]) => ({ name, value, url: origin })),
          );
          expect((await page.goto("/tournaments/s7/mappools"))?.status()).toBe(
            200,
          );
          await page.waitForLoadState("networkidle");
          const control = page.locator(".map-view-control");
          await expect(control).toHaveCSS("border-top-width", "0px");
          await expect(control).toHaveCSS("border-radius", "0px");
          await expect(control).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)",
          );
          await expect(control.locator("button").first()).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          for (const [slot, literal] of [
            ["NM2", "DragonForce - My Heart Will Go On [Expert]"],
            ["ACE1", "Shimotsuki Haruka - Secret Liqueur [Last Order]"],
          ]) {
            const title = page.locator(`#map-${slot} .map-open-button`);
            await expect(title).toHaveText(literal);
            await expect(title).toHaveCSS("background-image", "none");
            await expect(title).toHaveCSS("box-shadow", "none");
            const geometry = await title.evaluate((node) => {
              const button = node.getBoundingClientRect();
              const heading = node.parentElement!.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(node);
              return {
                largeEnough: button.height >= 44,
                fillsHeading: Math.abs(button.width - heading.width) < 1,
                unclipped:
                  node.scrollWidth <= node.clientWidth &&
                  node.scrollHeight <= node.clientHeight,
                textInside: [...range.getClientRects()].every(
                  (r) =>
                    r.left >= button.left - 1 && r.right <= button.right + 1,
                ),
              };
            });
            expect(geometry).toEqual({
              largeEnough: true,
              fillsHeading: true,
              unclipped: true,
              textInside: true,
            });
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          if (width === 699) {
            expect(
              (
                await new AxeBuilder({ page })
                  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                  .analyze()
              ).violations,
            ).toEqual([]);
          }
          if (locale === "zh-Hant" && theme === "dark" && width === 699) {
            // Keyboard activation still opens the full title and restores focus on close.
            const title = page.locator("#map-ACE1 .map-open-button");
            await title.focus();
            await expect(title).toHaveCSS("outline-style", /solid|auto/);
            await page.keyboard.down("Space");
            await expect(title).toHaveCSS("background-image", "none");
            await expect(title).toHaveCSS("box-shadow", "none");
            await expect(title).toHaveCSS("transform", "none");
            await page.keyboard.up("Space");
            const dialog = page.getByRole("dialog");
            await expect(dialog.getByRole("heading").first()).toHaveText(
              "Shimotsuki Haruka - Secret Liqueur [Last Order]",
            );
            await page.keyboard.press("Escape");
            await expect(title).toBeFocused();
            await page.locator(".map-view-control button").last().click();
            await expect(page.locator(".archive-map-list")).toBeVisible();
            await expect(
              page.locator(".map-view-control button").last(),
            ).toHaveAttribute("aria-pressed", "true");
            await expect(page.locator("#map-NM2 .map-open-button")).toHaveCSS(
              "background-image",
              "none",
            );
            await page.locator("#map-NM2 .map-open-button").click();
            await expect(dialog.getByRole("heading").first()).toHaveText(
              "DragonForce - My Heart Will Go On [Expert]",
            );
            await page.keyboard.press("Escape");
            await page.emulateMedia({ forcedColors: "active" });
            await expect(page.locator(".map-view-control")).toHaveCSS(
              "border-top-width",
              "0px",
            );
            await expect(
              page.locator('.map-view-control button[aria-pressed="true"]'),
            ).toHaveCSS("outline-style", "solid");
          }
          await page.waitForLoadState("networkidle");
          await page.close();
        }
    expect(errors).toEqual([]);
  });

  test("follows system brightness and retains S7 through manual overrides and navigation", async ({
    page,
    context,
    isMobile,
  }) => {
    await context.clearCookies();
    await context.addCookies([
      { name: "oclr-locale", value: "en", url: origin },
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
    await expect(html).toHaveAttribute("data-appearance", "default");
  });

  test("inherits configured S7 in all locales and renders the shipped light/dark design", async ({
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
    for (const [locale] of [
      ["en", "S7 · Graphite Arena"],
      ["zh-Hans", "S7 · 石墨竞技场"],
      ["zh-Hant", "S7 · 石墨競技場"],
    ]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({ name, value, url: origin })),
        );
        expect((await page.goto("/tournaments/s7"))?.status()).toBe(200);
        // Finish navigation prefetches before deliberately changing cookies or
        // reloading; WebKit reports interrupted in-flight RSC requests as errors.
        await page.waitForLoadState("networkidle");
        const trigger = page.locator(".appearance-trigger");
        await trigger.click();
        const menu = page.locator('.appearance-control [role="menu"]');
        await expect(menu.getByRole("menuitemradio")).toHaveCount(10);
        await expect(
          menu.locator('[data-appearance-option="graphite-arena"]'),
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
          "default",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        // The featured link can point to another edition. Configure that edition
        // explicitly before checking season-specific header styles there.
        const informationHref = await page
          .locator('.main-nav > a[href^="/tournaments"]')
          .getAttribute("href");
        expect(informationHref).toMatch(/^\/tournaments\/[^/?#]+$/);
        await setEditionAppearance(
          informationHref!.split("/")[2],
          "graphite-arena",
        );
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
