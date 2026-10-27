import { expect, type Page } from "@playwright/test";

// Picks a mode from the header color mode menu and waits for it to apply.
export async function chooseTheme(page: Page, mode: string, tap = false) {
  const activate = (selector: string) =>
    tap ? page.locator(selector).tap() : page.locator(selector).click();
  await activate(".theme-control");
  await activate(`.theme-menu [data-theme-option="${mode}"]`);
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    mode,
  );
  if (mode !== "system")
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
}
// Manually switches to the opposite of the brightness currently in effect.
export async function toggleTheme(page: Page, tap = false) {
  const next =
    (await page.locator("html").getAttribute("data-theme")) === "dark"
      ? "light"
      : "dark";
  await chooseTheme(page, next, tap);
  return next;
}
