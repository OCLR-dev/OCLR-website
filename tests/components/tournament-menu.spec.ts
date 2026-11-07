import { expect, test } from "@playwright/test";

test("tournament menu stays near its trigger, fits the viewport and supports keyboard dismissal and navigation", async ({
  page,
}, testInfo) => {
  // CSS container queries need real browser geometry. Reuse the shell host.
  await page.goto("/player-sidebar?path=/tournaments/s11/players&locale=en");
  await page.locator(".public-tournament").evaluate((node) => {
    (node as HTMLElement).style.maxWidth = "50rem";
  });
  const trigger = page.getByRole("button", { name: "Tournament menu" });
  const menu = page.getByRole("navigation", { name: "Tournament navigation" });
  await trigger.click();
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  const button = await trigger.boundingBox();
  const shell = await page.locator(".event-context").boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(385);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(
    Math.abs(bounds!.x + bounds!.width - button!.x - button!.width),
  ).toBeLessThan(2);
  if (testInfo.project.name === "desktop")
    expect(bounds!.width).toBeLessThan(shell!.width * 0.6);
  await expect(
    menu.getByRole("link", { name: "Players", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await trigger.press("Tab");
  await expect(menu.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: "Teams", exact: true }).click();
  await expect(page.locator("[data-pathname]")).toHaveText(
    "/tournaments/s11/teams",
  );
  await expect(menu).toBeHidden();
});
