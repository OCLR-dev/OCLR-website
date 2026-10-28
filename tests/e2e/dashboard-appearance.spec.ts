import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { createSession } from "../../src/lib/auth/sessions";
import { draftPicks, userProfileCache } from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedPublicPolish, landscapeFixture } from "../fixtures/public-polish";
import { prepareDraft } from "../fixtures/draft";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { toggleTheme } from "./theme";
const locales = ["en", "zh-Hans", "zh-Hant"];
const themes = ["light", "dark"];
async function preferences(
  context: BrowserContext,
  locale: string,
  theme: string,
) {
  await context.addCookies([
    { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
    { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
  ]);
}
async function session(context: BrowserContext, userId: number) {
  const value = await createSession(userId);
  await context.addCookies([
    {
      name: "oclr_session",
      value: value.token,
      url: "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function layout(page: Page, theme: string) {
  await expect(page.locator(".themed-site")).toHaveCSS("color-scheme", theme);
  await expect(page.locator(".themed-site")).toHaveCSS(
    "background-color",
    theme === "light" ? "rgb(244, 241, 247)" : "rgb(9, 12, 23)",
  );
  await expect(page.locator(".theme-control")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function accessible(page: Page) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect
    .soft(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          failure: n.failureSummary,
        })),
      })),
    )
    .toEqual([]);
}
async function cachedProfile(id: number) {
  await db()
    .insert(userProfileCache)
    .values({
      osuId: id,
      mode: "osu",
      attemptedAt: new Date(),
      retryAt: new Date(),
      profile: normalizeOsuProfile(
        { ...profileResponse, id, badges: [], cover: null },
        id,
        "osu",
      ),
    })
    .onConflictDoNothing();
}
test.describe("one MainSheet appearance across dashboards", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(420000);
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
  test.afterAll(closeDb);
  test("shares public and staff appearance across operational pages, dialogs and responsive navigation", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const admin = isMobile ? 70001 : 60001;
    const seed = await seedPublicPolish(
      admin,
      admin + 50,
      isMobile ? 951100 : 951000,
    );
    await cachedProfile(admin);
    await session(context, admin);
    const paths = [
      "/",
      "/admin",
      "/admin/tournaments",
      "/admin/tournaments/test-cup",
      "/admin/tournaments/test-cup/settings",
      "/admin/tournaments/test-cup/registrations",
      `/admin/tournaments/test-cup/registrations/${seed.home.privateRegistrationId}`,
      "/admin/tournaments/test-cup/captains",
      "/admin/tournaments/test-cup/teams",
      "/admin/tournaments/test-cup/mappools",
      "/admin/tournaments/test-cup/matches",
      `/admin/tournaments/test-cup/matches/${seed.fixtureId}`,
      "/admin/staff",
      "/admin/audit",
      "/dashboard",
    ];
    for (const locale of locales)
      for (const theme of themes) {
        await preferences(context, locale, theme);
        await page.setViewportSize({
          width: isMobile ? 390 : 1440,
          height: 900,
        });
        let header: number | null = null;
        for (const [index, path] of paths.entries()) {
          expect((await page.goto(path))?.status()).toBe(200);
          await layout(page, theme);
          const height = (await page.locator(".site-header").boundingBox())!
            .height;
          if (header !== null) expect(height).toBeCloseTo(header, 1);
          header = height;
          await page.screenshot({
            path: info.outputPath(`staff-${locale}-${theme}-${index}.png`),
          });
          if ([1, 4, 5, 9, 10, 11, 12, 13, 14].includes(index))
            await accessible(page);
        }
        // A direct private entry and reload keep the saved site preference.
        await toggleTheme(page);
        const next = theme === "light" ? "dark" : "light";
        await layout(page, next);
        await page.goto("/admin/tournaments/test-cup/settings");
        await page.reload();
        await layout(page, next);
      }
    await preferences(context, "en", "light");
    await page.goto("/admin/tournaments/test-cup/matches");
    await page.locator(".fixture-card .fixture-actions button").last().click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await accessible(page);
    await page.screenshot({
      path: info.outputPath("staff-fixture-dialog-light.png"),
    });
    await page.keyboard.press("Escape");
    for (const locale of locales)
      for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
        await preferences(context, locale, "light");
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/admin/tournaments/test-cup/settings");
        await layout(page, "light");
        if (width <= 760) {
          await page.locator(".admin-menu-toggle").click();
          await expect(page.locator(".admin-menu")).toHaveClass(/is-open/);
          await page.keyboard.press("Escape");
        }
        await page.screenshot({
          path: info.outputPath(`staff-responsive-${locale}-${width}.png`),
        });
      }
  });
  test("keeps personal applications and captain selections private within the shared appearance", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const base = isMobile ? 120001 : 110001;
    process.env.ADMIN_OSU_IDS = String(base);
    const fixture = await prepareDraft("test-cup", base);
    await seedEditions([
      {
        ...edition,
        branding: {
          logo: "/oclr-s11-square-logo.webp",
          background: "/oclr-s11-website-background.webp",
          keyVisual: "/oclr-s11-key-visual.webp",
        },
      },
    ]);
    await cachedProfile(fixture.a.osuId);
    await session(context, fixture.a.osuId);
    expect((await context.request.get("/api/admin/staff")).status()).toBe(403);
    for (const locale of locales)
      for (const theme of themes) {
        await preferences(context, locale, theme);
        await page.setViewportSize({
          width: isMobile ? 390 : 1440,
          height: 900,
        });
        for (const [index, path] of [
          "/dashboard",
          "/tournaments/test-cup/team",
          "/tournaments/test-cup/draft/captain",
        ].entries()) {
          expect((await page.goto(path))?.status()).toBe(200);
          await layout(page, theme);
          await accessible(page);
          await page.screenshot({
            path: info.outputPath(`player-${locale}-${theme}-${index}.png`),
          });
        }
        await page.locator(".draft-player-list button").first().click();
        await expect(
          page.locator(".draft-player-list button").first(),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".draft-pending-pick")).toContainText(
          fixture.players[0].username,
        );
        expect(await db().select().from(draftPicks)).toHaveLength(0);
        await accessible(page);
        await page.screenshot({
          path: info.outputPath(`captain-pending-${locale}-${theme}.png`),
        });
      }
    for (const locale of locales)
      for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
        await preferences(context, locale, "light");
        await page.setViewportSize({ width, height: 900 });
        for (const section of ["dashboard", "draft/captain"]) {
          await page.goto(
            section === "dashboard"
              ? "/dashboard"
              : `/tournaments/test-cup/${section}`,
          );
          await layout(page, "light");
          await page.screenshot({
            path: info.outputPath(
              `player-responsive-${locale}-${width}-${section.replaceAll("/", "-")}.png`,
            ),
          });
        }
      }
    await preferences(context, "en", "light");
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Player navigation" }),
    ).toHaveCount(0);
    const other = await createSession(fixture.b.osuId);
    expect(
      (
        await context.request.get("/api/admin/tournaments/test-cup/draft")
      ).status(),
    ).toBe(403);
    await context.addCookies([
      {
        name: "oclr_session",
        value: other.token,
        url: "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/tournaments/test-cup/draft/captain");
    await expect(
      page.getByRole("button", { name: "Confirm Pick", exact: true }),
    ).toBeDisabled();
    expect(await db().select().from(draftPicks)).toHaveLength(0);
  });
});
