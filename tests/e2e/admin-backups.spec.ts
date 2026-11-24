import { test, expect } from "@playwright/test";
import { seedSession } from "./session";
import { closeDb } from "../../src/db";
test.describe("Admin backup boundary and confirmation", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("global Admin sees private backup controls", async ({
    page,
    context,
    isMobile,
  }) => {
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.route("**/api/admin/backups", (route) =>
      route.fulfill({
        json: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            action: "import",
            state: "validated",
            createdAt: "2026-10-30T00:00:00Z",
            manifest: {
              source: "Synthetic test",
              createdAt: "2026-10-30T00:00:00Z",
              release: "a".repeat(40),
            },
          },
        ],
      }),
    );
    await page.goto("/admin");
    const backupLink = page.getByRole("link", {
      name: "Database backups",
      exact: true,
    });
    await expect(backupLink).toHaveCount(0);
    await page.goto("/admin/settings");
    await backupLink.click();
    await expect(page).toHaveURL(/\/admin\/backups$/);
    await expect(
      page.getByRole("heading", { name: "Database backups" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Review restore" }).click();
    await expect(
      page.getByRole("button", { name: "Confirm restore", exact: true }),
    ).toBeDisabled();
    await page.getByRole("textbox", { name: "REPLACE" }).fill("REPLACE");
    await expect(
      page.getByRole("button", { name: "Confirm restore", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await context.addCookies([
      { name: "oclr-theme", value: "dark", domain: "127.0.0.1", path: "/" },
    ]);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Database backups" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Review restore" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test("direct requests reject ordinary users", async ({
    context,
    baseURL,
  }) => {
    await context.addCookies([await seedSession(999002)]);
    expect((await context.request.get("/api/admin/backups")).status()).toBe(
      403,
    );
    expect(
      (
        await context.request.post("/api/admin/backups?action=backup", {
          headers: { origin: baseURL! },
        })
      ).status(),
    ).toBe(403);
  });
});

test.describe("Backup operator availability", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("explains missing installation, disables actions and recovers without stretching the button", async ({
    page,
    context,
    isMobile,
  }) => {
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    let available = false;
    await page.route("**/api/admin/backups", (route) =>
      route.fulfill(
        available
          ? { json: [] }
          : {
              status: 503,
              json: {
                code: "not_configured",
                error: "Backup service is unavailable.",
              },
            },
      ),
    );
    await page.goto("/admin/backups");
    const missing = page
      .getByRole("alert")
      .filter({ hasText: "one-time installation" });
    await expect(missing).toBeVisible();
    const create = page.getByRole("button", { name: "Create backup" });
    await expect(create).toBeDisabled();
    await expect(page.locator("input[type=file]")).toBeDisabled();
    const box = await create.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(64);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    available = true;
    await expect(create).toBeEnabled({ timeout: 10000 });
    await expect(missing).toHaveCount(0);
    await context.addCookies([
      { name: "oclr-theme", value: "dark", domain: "127.0.0.1", path: "/" },
    ]);
    await page.reload();
    await expect(create).toBeEnabled();
    expect((await create.boundingBox())!.height).toBeLessThanOrEqual(64);
  });
});
