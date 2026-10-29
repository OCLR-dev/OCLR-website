import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { siteSettings, siteSettingEvents } from "../../src/db/schema";
import {
  publicAppearances,
  seasonAppearances,
} from "../../src/lib/preferences";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { seedSession } from "./session";
const origin = "http://127.0.0.1:3100";

test.describe("Admin-only season theme policy", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("ignores legacy preferences in SSR, retains scoped defaults and offers only public designs", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE site_settings, site_setting_events, edition_state, users CASCADE`,
    );
    await seedEditions([
      { ...edition, slug: "season-a", defaultAppearance: "skyline-pop" },
      { ...edition, slug: "season-b", defaultAppearance: "glacier-blue" },
      {
        ...edition,
        slug: "hidden-season",
        published: false,
        defaultAppearance: "sakura-circuit",
      },
    ]);
    // A legacy global value remains inspectable, but must never theme the whole site.
    await db()
      .insert(siteSettings)
      .values({ id: 1, defaultAppearance: "prism-overture", revision: 7 });
    for (const appearance of seasonAppearances) {
      await context.addCookies([
        { name: "oclr-appearance", value: appearance, url: origin },
      ]);
      const response = await page.goto("/privacy");
      expect((await response!.text()).match(/<html[^>]*>/)?.[0]).toContain(
        'data-appearance="default"',
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await expect
        .poll(async () =>
          (await context.cookies()).some((c) => c.name === "oclr-appearance"),
        )
        .toBe(false);
    }
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          { name: "oclr-locale", value: locale, url: origin },
          { name: "oclr-theme", value: theme, url: origin },
          { name: "oclr-appearance", value: "skyline-pop", url: origin },
        ]);
        const response = await page.goto("/tournaments/season-a");
        expect((await response!.text()).match(/<html[^>]*>/)?.[0]).toContain(
          'data-appearance="skyline-pop"',
        );
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "skyline-pop",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.locator(".appearance-trigger").click();
        const menu = page.locator('.appearance-control [role="menu"]');
        await expect(menu.getByRole("menuitemradio")).toHaveCount(
          publicAppearances.length + 1,
        );
        for (const value of seasonAppearances)
          await expect(
            menu.locator(`[data-appearance-option="${value}"]`),
          ).toHaveCount(0);
        const box = (await menu.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(
          page.viewportSize()!.width,
        );
        if (locale === "en" && theme === "dark")
          await page.screenshot({ path: info.outputPath("public-menu.png") });
        await page.keyboard.press("End");
        await expect(menu.getByRole("menuitemradio").last()).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator(".appearance-trigger")).toBeFocused();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (locale === "en" && theme === "dark")
          await page.screenshot({ path: info.outputPath("scoped-season.png") });
      }
    await context.addCookies([
      { name: "oclr-locale", value: "en", url: origin },
    ]);
    // Real Next Link transitions must recalculate defaults without creating a cookie.
    await page.goto("/tournaments");
    await page.locator('main a[href="/tournaments/season-b"]').first().click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "glacier-blue",
    );
    await page.locator(".appearance-trigger").click();
    await page.locator('[data-appearance-option="cute-pastel"]').click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "cute-pastel",
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "cute-pastel",
    );
    await page.locator(".appearance-trigger").click();
    await page.locator('[data-appearance-option="site"]').click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "glacier-blue",
    );
    await page.goto("/tournaments/hidden-season");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "default",
    );
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    try {
      await noJs.addCookies([
        { name: "oclr-appearance", value: "glacier-blue", url: origin },
      ]);
      const staticPage = await noJs.newPage();
      await staticPage.goto(origin + "/tournaments/season-a");
      await expect(staticPage.locator("html")).toHaveAttribute(
        "data-appearance",
        "skyline-pop",
      );
    } finally {
      await noJs.close();
    }
    const admin = await seedSession(isMobile ? 70001 : 60001);
    await context.addCookies([admin]);
    await page.goto("/admin/settings");
    const design = page.getByLabel("Design", { exact: true });
    await expect(design.locator("option")).toHaveCount(
      publicAppearances.length,
    );
    await expect(design).toHaveValue("default");
    // Legacy global data is not silently overwritten, nor removed from the audit trail.
    expect((await db().select().from(siteSettings))[0]).toMatchObject({
      defaultAppearance: "prism-overture",
      revision: 7,
    });
    for (const theme of seasonAppearances) {
      const result = await context.request.patch("/api/admin/settings", {
        headers: { Origin: origin },
        data: { defaultAppearance: theme, expectedRevision: 7 },
      });
      expect(result.status()).toBe(400);
    }
    expect(await db().select().from(siteSettingEvents)).toHaveLength(0);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Website appearance saved.",
    );
    expect((await db().select().from(siteSettingEvents))[0]).toMatchObject({
      before: "prism-overture",
      after: "default",
      revision: 8,
    });
    await page.screenshot({
      path: info.outputPath("public-site-settings.png"),
      fullPage: true,
    });
  });
});
