import { englishStorage } from "../fixtures/preferences";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { editionState } from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import prepared from "../../drizzle/legacy-editions.json" with { type: "json" };
import { seedEditions } from "../fixtures/editions";
import { seedSession } from "./session";
import { changeStaffRole } from "../../src/lib/staff-roles";
test.describe("role-aware header actions and compact tournament context", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test.afterEach(async () => {
    if (process.env.TEST_DATABASE_URL) await seedEditions(prepared);
  });
  test("keeps public navigation separate, offers authorized dashboard actions and preserves sidebar context", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    // Three account contexts, viewport sweeps and axe scans can exhaust 30s
    // on CI while capturing the final screenshot. Keep action limits intact.
    test.setTimeout(60000);
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const adminId = isMobile ? 70001 : 60001;
    const playerId = isMobile ? 497102 : 497002;
    const staffId = playerId + 1;
    const adminCookie = await seedSession(adminId);
    const playerCookie = await seedSession(playerId);
    const staffCookie = await seedSession(staffId);
    process.env.ADMIN_OSU_IDS = String(adminId);
    const actor = { osuId: adminId, username: "Synthetic Admin" };
    async function inspectSwitcher(
      target: Page,
      surface: string,
      current?: string,
    ) {
      // Exercise the real initials fallback rather than relying on provider images.
      await target.route("https://a.ppy.sh/**", (route) => route.abort());
      await target.reload();
      const original = target.viewportSize()!;
      const control = target.getByRole("button", {
        name: "Dashboard",
        exact: true,
      });
      const menu = target.getByRole("menu", {
        name: "Dashboards",
        exact: true,
      });
      await expect(control.locator(".avatar img")).toHaveCount(0);
      // Initials use the shared light/dark foreground and tint, not a fixed white.
      const contrast = await control.locator(".avatar").evaluate((node) => {
        const style = getComputedStyle(node);
        const luminance = (color: string) => {
          const values = color
            .match(/\d+(?:\.\d+)?/g)!
            .slice(0, 3)
            .map(Number)
            .map((channel) => {
              const value = channel / 255;
              return value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4;
            });
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        const foreground = luminance(style.color),
          background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await target.setViewportSize({ width, height: 900 });
        await target.evaluate(() => window.scrollTo(0, 0));
        // Measure the same stable target that Playwright waits for before tapping.
        if (isMobile) await control.tap({ trial: true });
        else await control.click({ trial: true });
        const before = (await control.boundingBox())!;
        const contentBefore = (await target.locator("main").boundingBox())!;
        if (isMobile) await control.tap();
        else await control.click();
        await expect(menu).toBeVisible();
        const bounds = (await menu.boundingBox())!;
        const after = (await control.boundingBox())!;
        const contentAfter = (await target.locator("main").boundingBox())!;
        expect(after.y).toBeCloseTo(before.y, 1);
        expect(after.width).toBeCloseTo(before.width, 1);
        expect(contentAfter.y).toBeCloseTo(contentBefore.y, 1);
        expect(contentAfter.height).toBeCloseTo(contentBefore.height, 1);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.x + bounds.width).toBeCloseTo(after.x + after.width, 1);
        const gap = bounds.y - (after.y + after.height);
        expect(gap).toBeGreaterThanOrEqual(6);
        expect(gap).toBeLessThanOrEqual(9);
        for (const corner of [
          "border-top-left-radius",
          "border-top-right-radius",
          "border-bottom-left-radius",
          "border-bottom-right-radius",
        ]) {
          expect(
            parseFloat(
              await menu.evaluate(
                (node, property) =>
                  getComputedStyle(node).getPropertyValue(property),
                corner,
              ),
            ),
          ).toBeGreaterThan(0);
          expect(
            parseFloat(
              await control.evaluate(
                (node, property) =>
                  getComputedStyle(node).getPropertyValue(property),
                corner,
              ),
            ),
          ).toBeGreaterThan(0);
        }
        expect(bounds.height).toBeLessThanOrEqual(108);
        expect(bounds.width).toBeLessThanOrEqual(300);
        expect(bounds.width).toBeGreaterThanOrEqual(160);
        expect(bounds.width).toBeLessThan(240);
        const items = menu.getByRole("menuitem");
        await expect(items).toHaveCount(2);
        for (const item of await items.all()) {
          expect(
            Math.round((await item.boundingBox())!.height),
          ).toBeGreaterThanOrEqual(44);
          expect((await item.boundingBox())!.height).toBeLessThanOrEqual(48);
          expect(
            await item.evaluate((node) => {
              const box = node.getBoundingClientRect();
              return node.contains(
                document.elementFromPoint(
                  box.x + box.width / 2,
                  box.y + box.height / 2,
                ),
              );
            }),
          ).toBe(true);
        }
        const selected = menu.locator('[aria-current="page"]');
        await expect(selected).toHaveCount(current ? 1 : 0);
        if (current) {
          await expect(selected).toHaveText(current);
          const other = menu.locator('a:not([aria-current="page"])');
          await other.focus();
          await expect
            .poll(
              async () =>
                (await selected.evaluate(
                  (node) => getComputedStyle(node).backgroundColor,
                )) !==
                (await other.evaluate(
                  (node) => getComputedStyle(node).backgroundColor,
                )),
            )
            .toBe(true);
        }
        if (width === 320) {
          await target.emulateMedia({ reducedMotion: "reduce" });
          await expect(menu).toHaveCSS("animation-name", "none");
          await expect(control.locator(".account-chevron")).toHaveCSS(
            "transition-duration",
            "0s",
          );
          expect(
            (
              await new AxeBuilder({ page: target })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
          await target.emulateMedia({ reducedMotion: "no-preference" });
        }
        expect(
          await target.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const path = info.outputPath(
          `account-switcher-${surface}-${width}.png`,
        );
        await target.screenshot({
          path,
          fullPage: true,
          animations: "disabled",
        });
        if (width === 320 || width === 1440)
          await info.attach(`Account switcher ${surface} ${width}px`, {
            path,
            contentType: "image/png",
          });
        await target.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(control).toBeFocused();
      }
      // Enlarged text may wrap the account control onto a second header row.
      // Its floating menu must stay right-anchored within the viewport there too.
      await target.setViewportSize({ width: 320, height: 900 });
      await target.evaluate(() => {
        document.documentElement.style.fontSize = "20px";
      });
      await control.click();
      await expect(menu).toBeVisible();
      const enlarged = (await menu.boundingBox())!;
      expect(enlarged.x).toBeGreaterThanOrEqual(0);
      expect(enlarged.x + enlarged.width).toBeLessThanOrEqual(320);
      await target.keyboard.press("Escape");
      await target.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await target.setViewportSize(original);
    }
    const grant = await changeStaffRole(actor, {
      action: "grant",
      userId: staffId,
      role: "mappooler",
      editionSlug: "test-cup",
      confirmed: true,
    });
    await page.goto("/");
    const accounts = page.getByRole("group", {
      name: "Account actions",
      exact: true,
    });
    await expect(
      accounts.getByRole("link", { name: "Staff dashboard", exact: true }),
    ).toHaveCount(0);
    await expect(
      accounts.getByRole("link", { name: "Login with osu!", exact: true }),
    ).toBeVisible();
    if (isMobile)
      await page.getByRole("button", { name: "Menu", exact: true }).click();
    const publicNav = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    expect(await publicNav.getByRole("link").allTextContents()).toEqual([
      "Home",
      "Tournaments",
      "Announcements",
      "Handbook",
      "Organizers",
    ]);
    await expect(
      publicNav.getByRole("link", { name: "Tournaments", exact: true }),
    ).toHaveAttribute("href", "/tournaments");
    await expect(
      publicNav.getByRole("link", { name: "Handbook", exact: true }),
    ).toHaveAttribute("href", "/wiki");
    await expect(publicNav.getByRole("link", { name: /Staff/ })).toHaveCount(0);
    if (isMobile)
      await page.getByRole("button", { name: "Close", exact: true }).click();
    await context.addCookies([playerCookie]);
    await page.reload();
    await expect(
      accounts.getByRole("link", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await expect(accounts.getByRole("button")).toHaveCount(0);
    await expect(accounts.locator(".avatar")).toHaveCount(1);
    expect((await context.request.get("/api/admin/staff")).status()).toBe(403);
    await accounts
      .getByRole("link", { name: "Dashboard", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Browse tournaments", exact: true }),
    ).toBeVisible();
    await expect(
      accounts.getByRole("link", { name: "Dashboard", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    const staff = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
      viewport: page.viewportSize()!,
    });
    await staff.addCookies([staffCookie]);
    try {
      await staff.route("https://a.ppy.sh/**", (route) => route.abort());
      await db()
        .update(editionState)
        .set({
          configuration: sql`jsonb_set(jsonb_set(configuration, '{published}', 'true'), '{status}', '"live"')`,
        })
        .where(eq(editionState.slug, "s11"));
      const operator = await staff.newPage();
      await operator.goto("/");
      await inspectSwitcher(operator, "home");
      const operatorActions = operator.getByRole("group", {
        name: "Account actions",
        exact: true,
      });
      const dashboard = operatorActions.getByRole("button", {
        name: "Dashboard",
        exact: true,
      });
      const menu = operatorActions.getByRole("menu", {
        name: "Dashboards",
        exact: true,
      });
      await expect(dashboard).toHaveAttribute("aria-expanded", "false");
      await expect(operatorActions.locator(".avatar span")).toHaveText("Sy");
      await dashboard.focus();
      await dashboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem")).toHaveText([
        "Player dashboard",
        "Staff dashboard",
      ]);
      await expect(menu.getByRole("menuitem").first()).toBeFocused();
      await operator.keyboard.press("End");
      await expect(menu.getByRole("menuitem").last()).toBeFocused();
      await operator.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem").first()).toBeFocused();
      await operator.keyboard.press("Escape");
      await expect(dashboard).toBeFocused();
      await expect(menu).toHaveCount(0);
      await dashboard.press("ArrowUp");
      await expect(menu.getByRole("menuitem").last()).toBeFocused();
      await operator.keyboard.press("Tab");
      await expect(menu).toHaveCount(0);
      if (isMobile) {
        await operator
          .getByRole("button", { name: "Menu", exact: true })
          .click();
        await dashboard.click();
        await expect(
          operator.getByRole("navigation", {
            name: "Main navigation",
            exact: true,
          }),
        ).toBeHidden();
        await expect(menu).toBeVisible();
        await operator.keyboard.press("Escape");
      }
      await dashboard.click();
      await operator.getByRole("heading", { level: 1 }).click();
      await expect(menu).toHaveCount(0);
      await dashboard.click();
      await menu
        .getByRole("menuitem", { name: "Staff dashboard", exact: true })
        .press(" ");
      await expect(operator).toHaveURL(/\/admin$/);
      await expect(menu).toHaveCount(0);
      await inspectSwitcher(operator, "staff", "Staff dashboard");
      await dashboard.click();
      await expect(
        menu.getByRole("menuitem", { name: "Staff dashboard", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await menu
        .getByRole("menuitem", { name: "Player dashboard", exact: true })
        .press("Enter");
      await expect(operator).toHaveURL(/\/dashboard$/);
      await expect(menu).toHaveCount(0);
      await inspectSwitcher(operator, "player", "Player dashboard");
      await expect(
        operator
          .getByRole("navigation", { name: "Main navigation", exact: true })
          .locator('[aria-current="page"]'),
      ).toHaveCount(0);
      await changeStaffRole(actor, {
        action: "revoke",
        grantId: grant.id,
        confirmed: true,
      });
      await operator.goto("/");
      await expect(operatorActions.getByRole("button")).toHaveCount(0);
      await expect(
        operatorActions.getByRole("link", { name: "Dashboard", exact: true }),
      ).toBeVisible();
      expect(
        (
          await staff.request.get("/api/admin/tournaments/test-cup/mappools")
        ).status(),
      ).toBe(403);
      await operator.close();
    } finally {
      await staff.close();
    }
    await seedEditions(prepared);
    await context.clearCookies();
    await context.addCookies(englishStorage.cookies);
    await context.addCookies([adminCookie]);
    await page.goto("/admin");
    const appearance = await page.locator("main .button").evaluateAll((nodes) =>
      nodes.map((node) => ({
        height: node.getBoundingClientRect().height,
        font: getComputedStyle(node).fontSize,
      })),
    );
    expect(appearance.length).toBeGreaterThan(3);
    expect(new Set(appearance.map((style) => JSON.stringify(style))).size).toBe(
      1,
    );
    expect(appearance[0].height).toBe(44);
    await page.goto("/admin/tournaments/s11");
    for (const width of [320, 390, 760, 768, 950, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const control = accounts.getByRole("button", {
        name: "Dashboard",
        exact: true,
      });
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      // DOMRect transform interpolation can report 43.999999px for a 44px target.
      expect(Math.round(bounds.height * 100) / 100).toBeGreaterThanOrEqual(44);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await expect(accounts.locator(".account-control")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await control.click();
      await expect(accounts.getByRole("menuitem")).toHaveCount(2);
      if (width === 320)
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      if ([320, 1440].includes(width))
        await page.screenshot({
          path: info.outputPath(`account-menu-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 900 });
    if (isMobile)
      await page
        .getByRole("button", { name: "Open administration menu", exact: true })
        .click();
    const sidebar = page.locator(".sidebar");
    await expect(sidebar.getByLabel("Selected tournament")).toHaveValue("s11");
    await expect(sidebar.locator('option[value=""]')).toHaveCount(0);
    await expect(
      sidebar.getByRole("link", { name: "← All tournaments", exact: true }),
    ).toHaveClass(/button secondary/);
    await expect(
      sidebar.getByRole("link", {
        name: /Back to website|Administration overview/,
      }),
    ).toHaveCount(0);

    await expect(sidebar.locator(".admin-context .sr-only")).toHaveCSS(
      "clip-path",
      "inset(50%)",
    );
    await expect(
      sidebar.locator('.admin-context option[value="s11"]'),
    ).toHaveCount(1);
    expect(
      (await sidebar.locator("p").allTextContents()).filter((text) =>
        /Season 11/.test(text),
      ),
    ).toEqual([]);
    expect(
      (await sidebar.locator(".eyebrow").allTextContents()).filter(
        (text) => text.toLowerCase() === "tournament",
      ),
    ).toHaveLength(0);
    await expect(sidebar.locator(".admin-context .badge")).toHaveText("Draft");
    const contextHeading = sidebar.locator(".admin-context-heading");
    await expect(contextHeading).toContainText("Tournament");
    const selectorBounds = (await sidebar
      .getByLabel("Selected tournament")
      .boundingBox())!;
    const returnBounds = (await sidebar
      .getByRole("link", { name: "← All tournaments", exact: true })
      .boundingBox())!;
    expect(returnBounds.width).toBeLessThan(selectorBounds.width);
    expect(returnBounds.x).toBeCloseTo(selectorBounds.x, 0);
    await db()
      .update(editionState)
      .set({
        configuration: sql`jsonb_set(jsonb_set(configuration, '{published}', 'true'), '{status}', '\"live\"')`,
      })
      .where(eq(editionState.slug, "s11"));
    await page.reload();
    await expect(sidebar.locator(".admin-context .badge")).toHaveText("Live");
    expect(
      await sidebar
        .locator(".admin-context .badge")
        .evaluate((node) => node.closest("a,button") === null),
    ).toBe(true);
    if (isMobile)
      await page
        .getByRole("button", { name: "Open administration menu", exact: true })
        .click();
    const tournamentNav = page.getByRole("navigation", {
      name: "Tournament navigation",
      exact: true,
    });
    await expect(tournamentNav.locator('[aria-current="page"]')).toHaveText(
      "Dashboard",
    );
    await tournamentNav
      .getByRole("link", { name: "Mappools", exact: true })
      .click();
    if (isMobile)
      await page
        .getByRole("button", { name: "Open administration menu", exact: true })
        .click();
    await expect(tournamentNav.locator('[aria-current="page"]')).toHaveText(
      "Mappools",
    );
    const selector = sidebar.getByLabel("Selected tournament");
    const nextValue = await selector
      .locator("option")
      .evaluateAll(
        (options) =>
          (options as HTMLOptionElement[]).find((o) =>
            o.text.startsWith("Synthetic"),
          )!.value,
      );
    await selector.focus();
    await expect(selector).toBeFocused();
    await selector.press("s");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`/admin/tournaments/${nextValue}$`),
    );
    await page.goto("/admin/tournaments/test-cup");
    const publicAction = page.getByRole("link", {
      name: "View public tournament",
      exact: true,
    });
    await expect(publicAction).toHaveClass(/button secondary/);
    const applications = page.getByRole("link", {
      name: "View applications (0)",
      exact: true,
    });
    await expect(applications).toHaveClass(/button secondary/);
    const publicSize = await publicAction.evaluate(
      (node) => node.getBoundingClientRect().height,
    );
    expect(
      await applications.evaluate(
        (node) => node.getBoundingClientRect().height,
      ),
    ).toBe(publicSize);
    expect(
      await page
        .locator(".registration-state")
        .evaluate(
          (node) => node.tagName === "SPAN" && !node.closest("a,button"),
        ),
    ).toBe(true);
    await applications.click();
    await expect(page).toHaveURL(/\/test-cup\/registrations$/);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath("dashboard-actions.png"),
      fullPage: true,
    });
  });
});
