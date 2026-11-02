import { englishStorage } from "../fixtures/preferences";
import { captureResponsiveLayout } from "./responsive";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedSession } from "./session";
import { db, closeDb } from "../../src/db";
import { editionState, staffRoles } from "../../src/db/schema";
import { sql } from "drizzle-orm";
test.describe("tournament-centered administration", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("separates global tools, switches editions and enforces role-scoped direct navigation", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const adminId = isMobile ? 70001 : 60001;
    const mapperId = isMobile ? 350102 : 350002;
    const refereeId = mapperId + 1;
    const ordinaryId = mapperId + 2;
    await seedSession(adminId);
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await context.addCookies([await seedSession(adminId)]);
    async function menu(target: Page) {
      if (isMobile) {
        const toggle = target.getByRole("button", {
          name: "Open administration menu",
          exact: true,
        });
        if (await toggle.isVisible()) await toggle.click();
      }
    }
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Administration overview" }),
    ).toBeVisible();
    await expect(page.getByLabel("Search player or osu! ID")).toHaveCount(0);
    await menu(page);
    const global = page.getByRole("navigation", {
      name: "Administration navigation",
      exact: true,
    });
    await expect(
      global.getByRole("link", { name: "Overview", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      global.getByRole("link", { name: "Staff management", exact: true }),
    ).toBeVisible();
    await expect(
      global.getByRole("link", { name: "Player dashboard", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("administration-overview.png"),
      fullPage: true,
    });
    await global
      .getByRole("link", { name: "Tournaments", exact: true })
      .click();
    await page
      .getByRole("link", {
        name: /^Open tournament OCLR Season 11/,
        exact: true,
      })
      .click();
    await menu(page);
    await expect(page.getByLabel("Selected tournament")).toHaveValue("s11");
    const selector = page.getByLabel("Selected tournament");
    await expect(selector.locator('option[value=""]')).toHaveCount(0);
    await expect(page.locator('.sidebar a[href="/"]')).toHaveCount(0);
    const back = page.getByRole("link", {
      name: "← All tournaments",
      exact: true,
    });
    await expect(back).toHaveCount(1);
    await expect(back).toHaveClass(/button secondary/);
    await expect(back).toHaveAttribute("href", "/admin/tournaments");
    await captureResponsiveLayout(page, info, "tournament-return");
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/tournaments$/);
    await expect(
      page.getByRole("link", { name: "← All tournaments", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: /^Open tournament OCLR Season 11/ })
      .click();

    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText("OCLR Season 11");
    await menu(page);
    let navigation = page.getByRole("navigation", {
      name: "Tournament navigation",
      exact: true,
    });
    await expect(navigation.locator('[aria-current="page"]')).toHaveText(
      "Dashboard",
    );
    await navigation
      .getByRole("link", { name: "Settings", exact: true })
      .click();
    await expect(page).toHaveURL(/\/s11\/settings$/);
    await page
      .getByRole("tablist", { name: "Tournament settings", exact: true })
      .getByRole("tab", { name: "Publication", exact: true })
      .click();
    await expect(page).toHaveURL(/section=publication$/);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Publication", exact: true }),
    ).toBeVisible();
    await menu(page);
    await expect(navigation.locator('[aria-current="page"]')).toHaveText(
      "Settings",
    );
    await navigation
      .getByRole("link", { name: "Registrations", exact: true })
      .click();
    await expect(
      page.getByText("No matching registrations.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Export CSV/ })).toHaveCount(0);
    await expect(page.getByLabel("Edition", { exact: true })).toHaveCount(0);
    for (const [link, heading] of [
      ["Players & teams", "Team management"],
      ["Mappools", "Mappool management"],
      ["Fixtures & results", "Fixtures & results"],
    ]) {
      await menu(page);
      await navigation.getByRole("link", { name: link, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Selected tournament")).toHaveValue("s11");
    }
    await menu(page);
    await page.getByLabel("Selected tournament").selectOption("test-cup");
    await expect(page).toHaveURL(/\/test-cup$/);
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText("Synthetic test edition");
    await page.goto("/admin?edition=test-cup&status=pending");
    await expect(page).toHaveURL(/\/admin\/registrations\?.*edition=test-cup/);
    await expect(
      page.getByRole("combobox", { name: "Status", exact: true }),
    ).toHaveValue("pending");
    await page.goto("/admin/tournaments/test-cup/mappools");
    await menu(page);
    navigation = page.getByRole("navigation", {
      name: "Tournament navigation",
      exact: true,
    });
    await expect(navigation.locator('[aria-current="page"]')).toHaveText(
      "Mappools",
    );
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
      path: info.outputPath("selected-tournament-navigation.png"),
      fullPage: true,
    });
    const mapper = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
      viewport: page.viewportSize()!,
    });
    const referee = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
      viewport: page.viewportSize()!,
    });
    const ordinary = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      await mapper.addCookies([await seedSession(mapperId)]);
      await referee.addCookies([await seedSession(refereeId)]);
      await ordinary.addCookies([await seedSession(ordinaryId)]);
      await db()
        .insert(staffRoles)
        .values([
          {
            userId: mapperId,
            role: "mappooler",
            editionSlug: "test-cup",
            grantedBy: adminId,
          },
          {
            userId: refereeId,
            role: "referee",
            editionSlug: "test-cup",
            grantedBy: adminId,
          },
        ]);
      const unassignedId = ordinaryId + 1;
      const unassigned = await browser.newContext({
        storageState: englishStorage,
        baseURL: "http://127.0.0.1:3100",
      });
      try {
        await unassigned.addCookies([await seedSession(unassignedId)]);
        await db()
          .insert(editionState)
          .values({ slug: "no-configured-workspace" })
          .onConflictDoNothing();
        await db().insert(staffRoles).values({
          userId: unassignedId,
          role: "referee",
          editionSlug: "no-configured-workspace",
          grantedBy: adminId,
        });
        const noWorkspace = await unassigned.newPage();
        await noWorkspace.goto("/admin/tournaments");
        await expect(noWorkspace.getByLabel("Selected tournament")).toHaveCount(
          0,
        );
        await expect(
          noWorkspace.getByRole("link", {
            name: "← All tournaments",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          noWorkspace.getByRole("heading", {
            name: "No matching tournaments",
            exact: true,
          }),
        ).toBeVisible();
      } finally {
        await unassigned.close();
      }
      for (const [session, allowed, denied] of [
        [mapper, "Mappools", "matches"],
        [referee, "Fixtures & results", "mappools"],
      ] as const) {
        const operator = await session.newPage();
        await operator.goto("/admin");
        await expect(
          operator.getByRole("heading", { name: "Administration overview" }),
        ).toBeVisible();
        await expect(
          operator.getByRole("link", { name: /Review applications/ }),
        ).toHaveCount(0);
        await operator.goto("/admin/tournaments/test-cup");
        await menu(operator);
        await expect(
          operator.getByLabel("Selected tournament").locator("option"),
        ).toHaveCount(1);
        await expect(
          operator.getByLabel("Selected tournament").locator("option"),
        ).toHaveText("Synthetic test edition");
        await expect(
          operator.getByRole("link", {
            name: "← All tournaments",
            exact: true,
          }),
        ).toBeVisible();
        await menu(operator);
        const nav = operator.getByRole("navigation", {
          name: "Tournament navigation",
          exact: true,
        });
        await expect(nav.getByRole("link")).toHaveCount(
          session === mapper ? 3 : 2,
        );
        await expect(
          nav.getByRole("link", { name: "Rounds", exact: true }),
        ).toHaveCount(session === mapper ? 1 : 0);
        await expect(
          nav.getByRole("link", { name: allowed, exact: true }),
        ).toBeVisible();
        await nav.getByRole("link", { name: allowed, exact: true }).click();
        await expect(
          operator.getByRole("navigation", { name: "Breadcrumb" }),
        ).toContainText(allowed);
        for (const path of [
          "/admin/tournaments/s11",
          `/admin/tournaments/test-cup/${denied}`,
          "/admin/tournaments/test-cup/settings",
          "/admin/tournaments/test-cup/registrations",
          "/admin/registrations",
        ]) {
          // Next.js can stream the shell before a not-found boundary, retaining HTTP 200.
          // Verify denied UI content here and exact authorization status on APIs below.
          await operator.goto(path);
          await expect(
            operator.getByRole("heading", {
              name: "Off the beat.",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            operator.getByRole("heading", {
              name: "Tournament settings",
              exact: true,
            }),
          ).toHaveCount(0);
        }
        for (const path of [
          "/api/admin/tournaments/test-cup",
          "/api/admin/registrations?edition=test-cup",
          `/api/admin/tournaments/test-cup/${denied}`,
          "/api/admin/tournaments/s11/mappools",
        ]) {
          expect((await session.request.get(path)).status()).toBe(403);
        }
      }
      const outsider = await ordinary.newPage();
      await outsider.goto("/admin");
      await expect(
        outsider.getByRole("heading", { name: "Off the beat.", exact: true }),
      ).toBeVisible();
      expect(
        (await ordinary.request.get("/api/admin/tournaments")).status(),
      ).toBe(403);
    } finally {
      await mapper.close();
      await referee.close();
      await ordinary.close();
    }
  });
});
