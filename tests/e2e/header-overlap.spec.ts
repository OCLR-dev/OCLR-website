import { test, expect } from "@playwright/test";
import { closeDb } from "../../src/db";
import { seedSession } from "./session";

// Full CI owns this real-session navigation check. Menu geometry, keyboard
// dismissal and slow stylesheet races live in DB-free component tests.
test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
test.afterAll(closeDb);

test("the authenticated header routes players directly and lets staff switch workspaces", async ({
  page,
  context,
}) => {
  await page.route("**/api/osu-images/avatar/*", (route) => route.abort());
  const origin = "http://127.0.0.1:3100";
  const player = await seedSession(8690002);
  const staff = await seedSession(60001);
  await context.addCookies([
    player,
    { name: "oclr-locale", value: "en", url: origin },
  ]);
  await page.goto("/privacy");
  await page.locator(".account-control").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(".account-dropdown")).toHaveCount(0);

  await context.addCookies([staff]);
  await page.goto("/privacy");
  const account = page.locator("button.account-control");
  await account.click();
  const menu = page.getByRole("menu", { name: "Dashboards", exact: true });
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  const admin = menu.locator('[href="/admin"]');
  await expect(admin).toBeFocused();
  await admin.press("Enter");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator("main h1").first()).toBeVisible();

  await account.click();
  await menu.locator('[href="/dashboard"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("main h1").first()).toBeVisible();
});
