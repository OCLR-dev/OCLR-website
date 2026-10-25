import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { editionState, draftPicks } from "../../src/db/schema";
import { createSession } from "../../src/lib/auth/sessions";
import { assertTestDatabase } from "../database";
import { seedPublicPolish, landscapeFixture } from "../fixtures/public-polish";
import { prepareDraft } from "../fixtures/draft";
import { seedBrowserEditions } from "./setup";
import { readTournament } from "../../src/lib/tournaments";
import { seedEditions } from "../fixtures/editions";
import { appearances } from "../../src/lib/preferences";
const origin = "http://127.0.0.1:3100",
  base = "/tournaments/test-cup";
async function preferences(
  context: BrowserContext,
  locale: string,
  theme: string,
  appearance = "cute-pastel",
) {
  await context.addCookies(
    [
      ["oclr-locale", locale],
      ["oclr-theme", theme],
      ["oclr-appearance", appearance],
    ].map(([name, value]) => ({ name, value, url: origin })),
  );
}
async function session(context: BrowserContext, id: number) {
  const value = await createSession(id);
  await context.addCookies([
    {
      name: "oclr_session",
      value: value.token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${page.url()} at ${page.viewportSize()?.width}px`,
  ).toBe(true);
}
async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}
const optional = {
  "cute-pastel": {
    label: "Cute pastel",
    lightBackground: "rgb(255, 244, 248)",
    darkBackground: "rgb(36, 26, 32)",
  },
  "swiss-minimal": {
    label: "Swiss minimal",
    lightBackground: "rgb(255, 255, 255)",
    darkBackground: "rgb(20, 20, 20)",
  },
  claymorphism: {
    label: "Claymorphism",
    lightBackground: "rgb(248, 235, 228)",
    darkBackground: "rgb(39, 27, 25)",
  },
} as const;
for (const appearance of Object.keys(optional) as (keyof typeof optional)[]) {
  const { label, lightBackground, darkBackground } = optional[appearance];
  const setPreferences = (
    context: BrowserContext,
    locale: string,
    theme: string,
    value = appearance as string,
  ) => preferences(context, locale, theme, value);
  test.describe(`optional visitor-selected ${appearance} appearance`, () => {
    test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
    test.beforeEach(async ({ context }) => {
      assertTestDatabase(process.env.TEST_DATABASE_URL);
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      await db().execute(
        sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
      );
      await context.route("https://a.ppy.sh/**", (r) =>
        r.fulfill({ contentType: "image/svg+xml", body: landscapeFixture }),
      );
      await context.route("https://assets.ppy.sh/**", (r) =>
        r.fulfill({ contentType: "image/svg+xml", body: landscapeFixture }),
      );
    });
    test.afterEach(async () => {
      await db().execute(
        sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
      );
      await seedBrowserEditions();
    });
    test.afterAll(closeDb);
    test("switches anonymously with keyboard/touch, restores server markup and keeps brightness independent", async ({
      page,
      context,
      isMobile,
    }, info) => {
      test.setTimeout(120000);
      await seedPublicPolish(isMobile ? 70001 : 60001, 1230099, 1230000);
      await setPreferences(context, "en", "light", "default");
      const before = await db()
        .select({ configuration: editionState.configuration })
        .from(editionState);
      for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base);
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "default",
        );
        const trigger = page.getByRole("button", {
          name: "Website appearance",
          exact: true,
        });
        await trigger.focus();
        // ArrowUp opens on the last option; step up to this appearance.
        await page.keyboard.press("ArrowUp");
        for (
          let step = appearances.indexOf(appearance);
          step < appearances.length - 1;
          step++
        )
          await page.keyboard.press("ArrowUp");
        const option = page.getByRole("menuitemradio", {
          name: label,
          exact: true,
        });
        await expect(option).toBeFocused();
        const menu = page.getByRole("menu", {
          name: "Website appearance",
          exact: true,
        });
        const box = (await menu.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        await trigger.click();
        await option.click();
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          appearance,
        );
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "light",
        );
        await expect(trigger).toBeFocused();
        await page.locator(".theme-control").click();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "dark",
        );
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          appearance,
        );
        const response = await context.request.get(base + "/rules");
        expect(await response.text()).toMatch(
          new RegExp(`<html[^>]*data-appearance="${appearance}"`),
        );
        await page.goto(base + "/rules");
        await page.reload();
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          darkBackground,
        );
        await noOverflow(page);
        await trigger.click();
        await page
          .getByRole("menuitemradio", { name: "Original design", exact: true })
          .click();
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "default",
        );
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "dark",
        );
        await page.locator(".theme-control").click();
        await noOverflow(page);
      }
      const cookie = (await context.cookies()).find(
        (c) => c.name === "oclr-appearance",
      )!;
      expect(cookie.sameSite).toBe("Lax");
      expect(cookie.expires).toBeGreaterThan(
        Date.now() / 1000 + 3600 * 24 * 360,
      );
      await setPreferences(context, "en", "light", "invalid-theme");
      await page.goto(base);
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "default",
      );
      expect(
        await db()
          .select({ configuration: editionState.configuration })
          .from(editionState),
      ).toEqual(before);
      expect((await context.request.get("/api/admin/staff")).status()).toBe(
        401,
      );
      await page.screenshot({
        path: info.outputPath("default-retained.png"),
        fullPage: true,
      });
    });
    test("shares the selected palette across public and Admin pages in every locale, brightness and responsive layout", async ({
      page,
      context,
      isMobile,
    }, info) => {
      test.setTimeout(240000);
      const admin = isMobile ? 70001 : 60001;
      await seedPublicPolish(admin, 1240099, 1240000);
      const configured = (await readTournament("test-cup"))!;
      await seedEditions([
        {
          ...configured.edition,
          branding: {
            logo: "/oclr-s11-square-logo.webp",
            keyVisual: "/oclr-s11-key-visual.webp",
            background: "/oclr-s11-website-background.webp",
          },
        },
      ]);
      await session(context, admin);
      const errors: string[] = [];
      page.on("pageerror", (error) =>
        errors.push(`${page.url()}: ${error.message}`),
      );
      for (const locale of ["en", "zh-Hans", "zh-Hant"])
        for (const theme of ["light", "dark"]) {
          await setPreferences(context, locale, theme);
          await page.setViewportSize({
            width: isMobile ? 390 : 1440,
            height: 900,
          });
          for (const path of [
            "/",
            base,
            base + "/rules",
            base + "/mappools",
            base + "/players",
            "/privacy",
            "/admin",
            "/admin/tournaments/test-cup/settings",
            "/dashboard",
          ]) {
            expect((await page.goto(path))?.status()).toBe(200);
            await expect(page.locator("html")).toHaveAttribute(
              "data-appearance",
              appearance,
            );
            await expect(page.locator("html")).toHaveAttribute(
              "data-theme",
              theme,
            );
            await expect(page.locator(".themed-site")).toHaveCSS(
              "background-color",
              theme === "light" ? lightBackground : darkBackground,
            );
            await expect(page.locator(".themed-site")).toHaveCSS(
              "color-scheme",
              theme,
            );
            await noOverflow(page);
            if ([base, base + "/rules", "/admin"].includes(path))
              await page.screenshot({
                path: info.outputPath(
                  `${locale}-${theme}-${path === base ? "overview" : path.endsWith("rules") ? "rules" : "admin"}.png`,
                ),
                fullPage: true,
                animations: "disabled",
              });
            if (
              locale === "en" &&
              [
                base + "/rules",
                base + "/mappools",
                "/admin/tournaments/test-cup/settings",
              ].includes(path)
            )
              await accessible(page);
          }
          await page.locator(".appearance-trigger").click();
          await expect(
            page.locator(".appearance-control [aria-checked=true]"),
          ).toHaveAttribute("data-appearance-option", appearance);
          await accessible(page);
          await page.keyboard.press("Escape");
        }
      await setPreferences(context, "en", "light");
      for (const width of isMobile ? [320, 390] : [768, 1024, 1600]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/admin/tournaments/test-cup/settings");
        await page.locator(".appearance-trigger").click();
        await noOverflow(page);
        // Click the footer padding, outside the menu and away from footer links.
        await page.locator(".site-footer").click({ position: { x: 4, y: 4 } });
        await expect(
          page.locator(".appearance-control [role=menu]"),
        ).toHaveCount(0);
      }
      expect(errors).toEqual([]);
    });
    test("keeps captain actions private and isolates OBS/presenter output from both appearance preferences", async ({
      page,
      context,
      isMobile,
    }, info) => {
      test.setTimeout(120000);
      const id = isMobile ? 120001 : 110001;
      process.env.ADMIN_OSU_IDS = String(id);
      const fixture = await prepareDraft("test-cup", id);
      await session(context, fixture.a.osuId);
      await setPreferences(context, "en", "light");
      for (const path of [
        "/dashboard",
        base + "/team",
        base + "/draft/captain",
      ]) {
        expect((await page.goto(path))?.status()).toBe(200);
        await expect(page.locator(".themed-site")).toHaveCSS(
          "background-color",
          lightBackground,
        );
        await noOverflow(page);
      }
      await page.locator(".draft-player-list button").first().click();
      await expect(page.locator(".draft-pending-pick")).toContainText(
        fixture.players[0].username,
      );
      expect(await db().select().from(draftPicks)).toHaveLength(0);
      expect((await context.request.get("/api/admin/staff")).status()).toBe(
        403,
      );
      await page.screenshot({
        path: info.outputPath("captain-pastel.png"),
        fullPage: true,
      });
      await session(context, id);
      for (const theme of ["light", "dark"]) {
        await setPreferences(context, "en", theme);
        for (const path of [
          base + "/draft/overlay",
          base + "/draft?presenter=1",
        ]) {
          expect((await page.goto(path))?.status()).toBe(200);
          await expect(page.locator(".themed-site")).toHaveCount(0);
          await expect(page.locator(".site-header")).toBeHidden();
          if (path.endsWith("/overlay")) {
            await expect(page.locator("[data-broadcast]")).toHaveCSS(
              "background-color",
              "rgb(9, 12, 23)",
            );
            await expect(page.locator("body")).toHaveCSS(
              "background-color",
              "rgba(0, 0, 0, 0)",
            );
          } else {
            await expect(page.locator(".presenter-view")).toBeVisible();
            await expect(page.locator("body")).toHaveCSS(
              "background-color",
              "rgb(9, 12, 23)",
            );
          }
        }
      }
    });
  });
}
