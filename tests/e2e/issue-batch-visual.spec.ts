import { test, expect, firefox, webkit } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, ne, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { editionState, mappools } from "../../src/db/schema";
import { seedPublicPolish, landscapeFixture } from "../fixtures/public-polish";
import { seedSession } from "./session";
import { seedBrowserEditions } from "./setup";
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
test.describe("#106–#115 shared presentation", () => {
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);
  test("compact settings preserve tab semantics, editing, themes and mobile scrolling", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedPublicPolish(isMobile ? 70001 : 60001, 60101, 1150000);
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({
            name,
            value,
            url: "http://127.0.0.1:3100",
          })),
        );
        await page.setViewportSize({
          width: isMobile ? 390 : 1440,
          height: 1000,
        });
        await page.goto("/admin/tournaments/test-cup/settings");
        const tabs = page.getByRole("tablist");
        await expect(tabs).toHaveAttribute("data-appearance", "line");
        await expect(page.locator(".general-settings.panel")).toHaveCount(0);
        await expect(page.locator(".general-settings")).toBeVisible();
        await expect(tabs.getByRole("tab", { selected: true })).toHaveCount(1);
        await tabs.getByRole("tab").first().focus();
        await page.keyboard.press("ArrowRight");
        await expect(tabs.getByRole("tab").nth(1)).toBeFocused();
        await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await page.reload();
        await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await tabs.getByRole("tab").first().click();
        await expect(tabs.getByRole("tab").first()).toHaveAttribute(
          "aria-selected",
          "true",
        );
        const input = page.locator(".general-settings input").first();
        const original = await input.inputValue();
        await input.fill(`${original} draft`);
        await tabs.getByRole("tab").nth(1).click();
        await tabs.getByRole("tab").first().click();
        await expect(tabs.getByRole("tab").first()).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await expect(input).toHaveValue(`${original} draft`);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(isMobile ? 390 : 1440);
        await page.screenshot({
          path: info.outputPath(`settings-${locale}-${theme}.png`),
          animations: "disabled",
        });
      }
  });
  test("public context, FM labels and lifecycle metadata stay separate from registration", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    await seedPublicPolish(60001, 60101, 1150000);
    await context.route("https://assets.ppy.sh/**", (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: landscapeFixture }),
    );
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({
            name,
            value,
            url: "http://127.0.0.1:3100",
          })),
        );
        await page.setViewportSize({
          width: isMobile ? 390 : 1600,
          height: 1000,
        });
        for (const fmMode of ["free_mod", "force_mod", null] as const) {
          await db()
            .update(mappools)
            .set({ fmMode })
            .where(eq(mappools.editionSlug, "test-cup"));
          await page.goto("/tournaments/test-cup/mappools");
          const fm = page
            .locator('.map-browse-card[data-category="FM"]')
            .first();
          await expect(fm).toContainText("FM1");
          const policy = fm.locator(".map-fm-policy");
          if (fmMode)
            await expect(policy).toHaveText(
              fmMode === "free_mod" ? "Free Mod" : "Force Mod",
            );
          else {
            await expect(policy).not.toHaveText(/Free Mod|Force Mod/);
            await expect(policy).not.toBeEmpty();
          }
          if (!isMobile) {
            const breadcrumb = await page
              .locator(".event-identity")
              .boundingBox();
            const nav = await page.locator(".event-context nav").boundingBox();
            expect(Math.abs(breadcrumb!.y - nav!.y)).toBeLessThan(45);
          }
          expect(
            await page
              .locator(".mappool-release-heading")
              .first()
              .evaluate((el) => getComputedStyle(el).backgroundColor),
          ).toBe("rgba(0, 0, 0, 0)");
          await fm.locator(".map-open-button").click();
          await expect(page.getByRole("dialog")).toBeVisible();
          if (fmMode)
            await expect(page.getByRole("dialog")).toContainText(
              fmMode === "free_mod" ? "Free Mod" : "Force Mod",
            );
          await page.keyboard.press("Escape");
        }
        await page.screenshot({
          path: info.outputPath(`mappools-${locale}-${theme}.png`),
          animations: "disabled",
        });
        await db()
          .update(editionState)
          .set({ configuration: { ...edition, published: false } })
          .where(ne(editionState.slug, "test-cup"));
        for (const status of ["upcoming", "live", "completed"] as const) {
          await db()
            .update(editionState)
            .set({
              configuration: {
                ...edition,
                status,
                name: "OCLR public UI test",
                registration: null,
              },
            })
            .where(eq(editionState.slug, "test-cup"));
          await page.goto("/");
          await expect(page.locator(".home-information-link")).toHaveAttribute(
            "href",
            status === "completed" ? "/tournaments" : "/tournaments/test-cup",
          );
          await expect(page.locator(".home-registration-link")).toBeVisible();
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(isMobile ? 390 : 1600);
        await page.screenshot({
          path: info.outputPath(`home-${locale}-${theme}.png`),
          animations: "disabled",
        });
        expect(
          (await new AxeBuilder({ page }).include(".site-header").analyze())
            .violations,
        ).toEqual([]);
      }
  });
  for (const engine of [firefox, webkit])
    test(`original wordmark and favicon assets render in ${engine.name()}`, async ({
      isMobile,
    }, info) => {
      test.skip(isMobile);
      test.setTimeout(120000);
      await seedEditions();
      test.skip(
        engine.name() === "firefox" &&
          process.env.OCLR_SKIP_LOCAL_FIREFOX === "1",
        "Local Firefox cannot open its temporary profile; #108 requires Linux CI verification.",
      );
      {
        const browser = await engine.launch();
        try {
          for (const theme of ["light", "dark"]) {
            const context = await browser.newContext({
              viewport: { width: 1440, height: 900 },
            });
            await context.addCookies([
              {
                name: "oclr-theme",
                value: theme,
                url: "http://127.0.0.1:3100",
              },
            ]);
            const page = await context.newPage();
            for (const route of [
              "/",
              "/news",
              "/about",
              "/tournaments/test-cup",
            ]) {
              await page.goto(`http://127.0.0.1:3100${route}`);
              await expect(page.locator(".oclr-wordmark")).toBeVisible();
              expect(
                await page
                  .locator(".oclr-wordmark")
                  .evaluate((el) => el.getBoundingClientRect().width),
              ).toBeGreaterThan(75);
              expect(
                await page
                  .locator('link[rel="apple-touch-icon"]')
                  .getAttribute("href"),
              ).toContain("oclr-180");
            }
            for (const size of [16, 32, 48, 180]) {
              const response = await context.request.get(
                `http://127.0.0.1:3100/branding/oclr-${size}.png?v=1`,
              );
              expect(response.ok()).toBe(true);
              expect(response.headers()["content-type"]).toContain("image/png");
            }
            await page.screenshot({
              path: info.outputPath(`${engine.name()}-${theme}.png`),
              animations: "disabled",
            });
            await context.close();
          }
        } finally {
          await browser.close();
        }
      }
    });
});
