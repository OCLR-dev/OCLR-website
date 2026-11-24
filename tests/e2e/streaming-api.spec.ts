import { test, expect } from "@playwright/test";
import { db, closeDb } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import { seedSession } from "./session";

test.use({ trace: "off", screenshot: "off" });
test.describe("streaming API credentials", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "isolated DB required");
  test.afterAll(async () => closeDb());
  test("Streamer can create and revoke edition-bound idle access", async ({
    page,
    context,
    isMobile,
  }) => {
    const id = isMobile ? 5402002 : 5402001;
    const cookie = await seedSession(id);
    await db().insert(staffRoles).values({
      userId: id,
      role: "streamer",
      editionSlug: "test-cup",
      grantedBy: id,
    });
    await context.addCookies([cookie]);
    await context.route("**/api/osu-images/avatar/*", (route) => route.abort());
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Dashboard/ }).click();
    await page
      .getByRole("menuitem", { name: "Streaming API access", exact: true })
      .click();
    await expect(page).toHaveURL(/\/streaming\/test-cup$/);
    await expect(
      page.getByRole("heading", { name: "Streaming API access", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/one hour without a successful streaming read/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create token", exact: true })
      .click();
    const credential = page.getByRole("textbox", { name: "New API token" });
    await expect(credential).toBeVisible();
    const token = await credential.inputValue();
    // Never write the credential to a trace attachment or screenshot.
    await page.getByRole("button", { name: "Hide token", exact: true }).click();
    const response = await context.request.get(
      "/api/v1/streaming/tournaments/test-cup/next",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(response.status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Revoke token", exact: true }),
    ).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page
      .getByRole("button", { name: "Revoke token", exact: true })
      .click();
    await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await page.waitForFunction(() => window.scrollY === 0);
    }
    expect(
      (
        await context.request.get(
          "/api/v1/streaming/tournaments/test-cup/next",
          { headers: { Authorization: `Bearer ${token}` } },
        )
      ).status(),
    ).toBe(401);
  });
});
