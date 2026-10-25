import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  siteSettings,
  siteSettingEvents,
  staffRoles,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedSession } from "./session";
const origin = "http://127.0.0.1:3100";
const headers = { Origin: origin };

test.describe("Admin default and visitor appearance overrides", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE site_settings, site_setting_events`);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE site_settings, site_setting_events`);
  });
  test.afterAll(closeDb);
  test("saves the site default while retaining personal overrides and supports returning to the default", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.goto("/admin/settings");
    await expect(
      page.getByRole("heading", { name: "Site settings", exact: true }),
    ).toBeVisible();
    if (isMobile)
      await page
        .getByRole("button", { name: "Open administration menu" })
        .click();
    await expect(
      page.locator('.sidebar a[href="/admin/settings"]'),
    ).toHaveAttribute("aria-current", "page");
    if (isMobile)
      await page
        .getByRole("button", { name: "Close administration menu" })
        .click();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("Design", { exact: true })
      .selectOption("cute-pastel");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Website appearance saved.",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "cute-pastel",
    );
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({
      path: info.outputPath("site-appearance-settings.png"),
      fullPage: true,
    });
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

    const guest = await browser.newContext({
      viewport: { width: isMobile ? 320 : 1280, height: 900 },
    });
    try {
      await guest.addCookies([
        { name: "oclr-locale", value: "en", url: origin },
        { name: "oclr-theme", value: "dark", url: origin },
      ]);
      const visitor = await guest.newPage();
      visitor.on("pageerror", (error) => errors.push(error.message));
      const response = await visitor.goto(origin + "/privacy");
      expect(await response!.text()).toMatch(
        /<html[^>]*data-appearance="cute-pastel"/,
      );
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-theme",
        "dark",
      );
      expect(
        (await guest.cookies()).find(
          (cookie) => cookie.name === "oclr-appearance",
        ),
      ).toBeUndefined();
      await visitor.locator(".appearance-trigger").click();
      await expect(
        visitor.getByRole("menuitemradio", { name: "Use site default" }),
      ).toHaveAttribute("aria-checked", "true");
      const menu = (await visitor
        .getByRole("menu", { name: "Website appearance", exact: true })
        .boundingBox())!;
      expect(menu.x).toBeGreaterThanOrEqual(0);
      expect(menu.x + menu.width).toBeLessThanOrEqual(isMobile ? 320 : 1280);
      await visitor
        .getByRole("menuitemradio", { name: "Original design" })
        .click();
      await visitor.reload();
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-theme",
        "dark",
      );
      // Repeated saves exercise the form's refreshed revision, without a redeploy.
      for (const value of [
        "manga-halftone",
        "glassmorphism",
        "claymorphism",
        "swiss-minimal",
        "default",
        "cute-pastel",
      ]) {
        await page.getByLabel("Design", { exact: true }).selectOption(value);
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "Save", exact: true }),
        ).toBeDisabled();
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          value,
        );
        await visitor.reload();
        await expect(visitor.locator("html")).toHaveAttribute(
          "data-appearance",
          "default",
        );
      }
      await visitor.locator(".appearance-trigger").click();
      await visitor
        .getByRole("menuitemradio", { name: "Use site default" })
        .click();
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-appearance",
        "cute-pastel",
      );
      expect(
        (await guest.cookies()).find(
          (cookie) => cookie.name === "oclr-appearance",
        ),
      ).toBeUndefined();
      await visitor.reload();
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-appearance",
        "cute-pastel",
      );
      await page.getByLabel("Design", { exact: true }).selectOption("default");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await visitor.reload();
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await visitor.locator(".appearance-trigger").click();
      await visitor.getByRole("menuitemradio", { name: "Cute pastel" }).click();
      await visitor.reload();
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-appearance",
        "cute-pastel",
      );
      await guest.addCookies([
        { name: "oclr-appearance", value: "invalid", url: origin },
      ]);
      await visitor.reload();
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await expect(visitor.locator("html")).toHaveAttribute(
        "data-theme",
        "dark",
      );
    } finally {
      await guest.close();
    }
    expect(await db().select().from(siteSettingEvents)).toHaveLength(8);
    expect((await db().select().from(siteSettings))[0].revision).toBe(8);
    expect(errors).toEqual([]);
  });
  test("enforces global Admin authorization, origin and concurrency through the API", async ({
    page,
    context,
    isMobile,
  }) => {
    const admin = isMobile ? 70001 : 60001;
    const operator = isMobile ? 1330002 : 1330001;
    await context.clearCookies();
    expect(
      (await context.request.get(origin + "/api/admin/settings")).status(),
    ).toBe(401);
    expect(
      (
        await context.request.patch(origin + "/api/admin/settings", {
          headers,
          data: { defaultAppearance: "cute-pastel", expectedRevision: 0 },
        })
      ).status(),
    ).toBe(401);
    const adminSession = await seedSession(admin);
    const operatorSession = await seedSession(operator);
    await context.addCookies([
      operatorSession,
      { name: "oclr-locale", value: "en", url: origin },
    ]);
    for (const [role, editionSlug] of [
      ["admin", "test-cup"],
      ["mappooler", null],
      ["referee", null],
    ] as const) {
      await db()
        .insert(staffRoles)
        .values({ userId: operator, role, editionSlug, grantedBy: admin });
      expect(
        (await context.request.get(origin + "/api/admin/settings")).status(),
      ).toBe(403);
      expect(
        (
          await context.request.patch(origin + "/api/admin/settings", {
            headers,
            data: { defaultAppearance: "cute-pastel", expectedRevision: 0 },
          })
        ).status(),
      ).toBe(403);
    }
    await page.goto("/admin");
    await expect(
      page.locator('.sidebar a[href="/admin/settings"]'),
    ).toHaveCount(0);
    expect((await page.goto("/admin/settings"))?.status()).toBe(404);
    await context.addCookies([adminSession]);
    expect(
      (
        await context.request.patch(origin + "/api/admin/settings", {
          headers: { Origin: "https://other.invalid" },
          data: { defaultAppearance: "cute-pastel", expectedRevision: 0 },
        })
      ).status(),
    ).toBe(403);
    const save = () =>
      context.request.patch(origin + "/api/admin/settings", {
        headers,
        data: { defaultAppearance: "cute-pastel", expectedRevision: 0 },
      });
    expect((await save()).status()).toBe(200);
    expect((await save()).status()).toBe(409);
    expect(await db().select().from(siteSettingEvents)).toHaveLength(1);
    const logs = await (
      await context.request.get(origin + "/api/admin/audit?module=site")
    ).json();
    expect(logs.total).toBe(1);
    await context.addCookies([operatorSession]);
    const scopedLogs = await (
      await context.request.get(origin + "/api/admin/audit?module=site")
    ).json();
    expect(scopedLogs.total).toBe(0);
  });
});
