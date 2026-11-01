import { expect, type Locator, type Page } from "@playwright/test";

export async function openHeaderPreferences(page: Page) {
  if (!(await page.locator(".appearance-trigger").isVisible()))
    await page.locator(".menu-toggle").click();
}

export async function closeHeaderPreferences(page: Page) {
  if (
    page.viewportSize()!.width <= 760 &&
    (await page.locator(".menu-toggle").getAttribute("aria-expanded")) ===
      "true"
  )
    await page.locator(".menu-toggle").click();
}

export async function expectPreferenceMenuFits(page: Page, menu: Locator) {
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (page.viewportSize()!.width > 760) {
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  } else {
    const panel = (await page.locator(".header-menu-panel").boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    for (const option of await menu.getByRole("menuitemradio").all()) {
      await option.scrollIntoViewIfNeeded();
      const item = (await option.boundingBox())!;
      expect(item.y).toBeGreaterThanOrEqual(panel.y);
      expect(item.y + item.height).toBeLessThanOrEqual(
        panel.y + panel.height + 1,
      );
    }
  }
}
