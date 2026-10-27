import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
const origin = "http://127.0.0.1:3100";
test.describe("tournament appearance inheritance", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  for (const appearance of [
    "skyline-pop",
    "glacier-blue",
    "sakura-circuit",
    "graphite-arena",
  ])
    test(`saves ${appearance} as a scoped default, SSR renders it and visitor choice survives cross-edition navigation`, async ({
      page,
      context,
      isMobile,
    }, info) => {
      test.setTimeout(90000);
      assertTestDatabase(process.env.TEST_DATABASE_URL);
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      await db().execute(
        sql`TRUNCATE edition_state, users, site_settings, site_setting_events CASCADE`,
      );
      await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
      await seedEditions([
        {
          ...edition,
          slug: "other-cup",
          name: "Other Cup",
          defaultAppearance: null,
        },
        {
          ...edition,
          slug: "hidden-cup",
          name: "HIDDEN CUP",
          published: false,
          defaultAppearance: "swiss-minimal",
        },
      ]);
      await page.goto("/admin/tournaments/test-cup/settings");
      await page
        .getByRole("combobox", {
          name: "Default tournament appearance",
          exact: true,
        })
        .selectOption(appearance);
      await page
        .getByRole("button", { name: "Save general settings", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        appearance,
      );
      await page.screenshot({
        path: info.outputPath("tournament-default.png"),
        fullPage: true,
      });
      // No explicit preference is created just by inheriting a tournament default.
      expect(
        (await context.cookies()).find((c) => c.name === "oclr-appearance"),
      ).toBeUndefined();
      await context.clearCookies();
      await context.addCookies([
        { name: "oclr-locale", value: "en", url: origin },
        { name: "oclr-theme", value: "dark", url: origin },
      ]);
      const response = await page.goto("/tournaments/test-cup");
      expect(await response!.text()).toMatch(
        new RegExp(`<html[^>]*data-appearance="${appearance}"`),
      );
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.locator(".appearance-trigger").click();
      await expect(
        page.getByRole("menuitemradio", {
          name: "Use tournament/site default",
        }),
      ).toHaveAttribute("aria-checked", "true");
      await page
        .getByRole("menuitemradio", { name: "Original design" })
        .click();
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await page.locator(".appearance-trigger").click();
      await page
        .getByRole("menuitemradio", { name: "Use tournament/site default" })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        appearance,
      );
      // Next Link transitions must recalculate the current tournament instead of retaining the last one.
      if (isMobile)
        await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.goto("/tournaments");
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await page
        .locator('main a[href="/tournaments/other-cup"]')
        .first()
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await page.goto("/tournaments/hidden-cup");
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      await page.goto("/privacy");
      const html = await page.content();
      expect(html).not.toContain("HIDDEN CUP");
      expect(html).not.toContain("hidden-cup");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
});
