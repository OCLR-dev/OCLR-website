import { test, expect } from "@playwright/test";
test("selects without writing and confirms a saved pixel", async ({ page }) => {
  let writes = 0;
  const state = {
    pixels: "0".repeat(16384),
    revision: 0,
    enabled: true,
    nextAt: 0,
    serverTime: Date.now(),
    signedIn: true,
    admin: false,
  };
  await page.route("**/api/games/ocl-chess", async (route) => {
    if (route.request().method() === "POST") {
      writes++;
      state.revision++;
      state.nextAt = Date.now() + 30000;
    }
    await route.fulfill({ json: state });
  });
  await page.goto("/ocl-chess");
  await expect(
    page.getByRole("button", { name: "Confirm pixel" }),
  ).toBeEnabled();
  const viewport = await page.locator(".chess-viewport").boundingBox();
  const screen = page.viewportSize()!;
  expect(viewport!.width).toBeGreaterThan(screen.width * 0.9);
  expect(viewport!.height).toBeGreaterThan(screen.height * 0.5);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(screen.width);
  await page
    .getByLabel("Shared pixel canvas")
    .click({ position: { x: 25, y: 25 } });
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Confirm pixel" }).click();
  await expect.poll(() => writes).toBe(1);
  await page.screenshot({
    path: `/tmp/oclr-379-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Confirm pixel" }),
  ).toBeDisabled();
});
test("retries an uncertain save with the same request identity", async ({
  page,
}) => {
  const commands: unknown[] = [];
  await page.route("**/api/games/ocl-chess", async (route) => {
    if (route.request().method() === "POST") {
      commands.push(route.request().postDataJSON());
      await route.abort();
      return;
    }
    await route.fulfill({
      json: {
        pixels: "0".repeat(16384),
        revision: 0,
        enabled: true,
        nextAt: 0,
        serverTime: Date.now(),
        signedIn: true,
        admin: false,
      },
    });
  });
  await page.goto("/ocl-chess");
  await page.getByRole("button", { name: "Confirm pixel" }).click();
  await page.getByRole("button", { name: "Retry pixel" }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[0]).toEqual(commands[1]);
});
