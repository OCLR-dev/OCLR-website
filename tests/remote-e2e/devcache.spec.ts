import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import { siteSettings } from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { waitForRemoteRateWindow } from "../fixtures/remote-rate-window";

test.afterAll(async () => {
  await db().delete(siteSettings).where(eq(siteSettings.id, 1));
  await closeDb();
});

test("reuses public snapshots until explicit refresh and recovers once after a transient health failure", async ({
  page,
}, info) => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await db()
    .insert(siteSettings)
    .values({ id: 1, defaultAppearance: "cute-pastel" })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: { defaultAppearance: "cute-pastel" },
    });
  await page.goto("/remote");
  await waitForRemoteRateWindow(page);
  await page
    .getByRole("button", { name: "Browse public data anonymously" })
    .click();
  await expect(
    page.getByText("Anonymous public browsing", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "cute-pastel",
  );
  await db()
    .update(siteSettings)
    .set({ defaultAppearance: "swiss-minimal" })
    .where(eq(siteSettings.id, 1));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "cute-pastel",
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "swiss-minimal",
  );
  await page.goto("/tournaments");
  await expect(
    page.getByRole("heading", { name: "Tournaments", exact: true }),
  ).toBeVisible();
  let healthy = false,
    checks = 0,
    routeRefreshes = 0;
  await page.route("**/api/remote/connection", async (route) => {
    checks++;
    await route.fulfill({
      status: healthy ? 200 : 503,
      json: healthy
        ? { state: "anonymous", identity: null }
        : { state: "unavailable", code: "REMOTE_UNAVAILABLE" },
    });
  });
  page.on("request", (request) => {
    if (request.headers().rsc === "1") routeRefreshes++;
  });
  // Observe actual timers; no production quotas or server authentication are bypassed.
  await expect(
    page.getByRole("heading", {
      name: "Remote frontend development",
      exact: true,
    }),
  ).toBeVisible({ timeout: 25000 });
  expect(routeRefreshes).toBe(0);
  healthy = true;
  await expect(
    page.getByRole("heading", { name: "Tournaments", exact: true }),
  ).toBeVisible({ timeout: 35000 });
  expect(routeRefreshes).toBe(1);
  expect(checks).toBeGreaterThanOrEqual(2);
  await page.unroute("**/api/remote/connection");
  await page.screenshot({
    path: info.outputPath("remote-cache-recovered.png"),
    fullPage: false,
  });
});
