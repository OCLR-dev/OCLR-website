import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { chooseTheme } from "./theme";

const origin = "http://127.0.0.1:3100";
// The brightness present when <body> is first parsed, i.e. before first paint.
const firstPaint = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { firstPaintTheme?: string }).firstPaintTheme,
  );

test.describe("system color scheme preference", () => {
  test.use({ locale: "en-US" });
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("follows the system until a manual choice and returns to it", async ({
    page,
    context,
  }, info) => {
    test.setTimeout(120000);
    const tap = !!info.project.use.hasTouch;
    await seedEditions([edition]);
    await context.clearCookies();
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (!document.body) return;
        (window as unknown as { firstPaintTheme?: string }).firstPaintTheme =
          document.documentElement.dataset.theme;
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydrat|did not match/i.test(message.text())
      )
        failures.push(message.text());
    });
    const html = page.locator("html");
    const trigger = page.locator(".theme-control");
    const cookie = async (name: string) =>
      (await context.cookies(origin)).find((c) => c.name === name)?.value;

    // No saved choice: the system's dark mode applies before first paint.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/tournaments/test-cup");
    expect(await firstPaint(page)).toBe("dark");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-theme-preference", "system");
    await expect(page.locator(".themed-site")).toHaveCSS(
      "color-scheme",
      "dark",
    );
    await expect(trigger).toHaveAccessibleName(
      "Color mode: Follow system (Dark)",
    );
    expect(await cookie("oclr-theme")).toBeUndefined();
    expect(await cookie("oclr-system-theme")).toBe("dark");

    // Changing the system updates the open page without a reload.
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(trigger).toHaveAccessibleName(
      "Color mode: Follow system (Light)",
    );
    await expect.poll(() => cookie("oclr-system-theme")).toBe("light");
    expect(await cookie("oclr-theme")).toBeUndefined();

    // A stale hint is corrected before paint rather than flashing.
    await page.emulateMedia({ colorScheme: "dark" });
    await context.addCookies([
      { name: "oclr-system-theme", value: "light", url: origin },
    ]);
    await page.reload();
    expect(await firstPaint(page)).toBe("dark");
    await expect(html).toHaveAttribute("data-theme-preference", "system");

    // Three accessible options, keyboard reachable.
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "Color mode", exact: true });
    const options = menu.getByRole("menuitemradio");
    await expect(options).toHaveText([/Follow system/, /Light/, /Dark/]);
    await expect(options.nth(0)).toBeFocused();
    await expect(options.nth(0)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("End");
    await expect(options.nth(2)).toBeFocused();
    expect(
      (
        await new AxeBuilder({ page })
          .include(".theme-menu")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // A manual choice wins over the system and persists.
    await chooseTheme(page, "light", tap);
    expect(await cookie("oclr-theme")).toBe("light");
    await expect(trigger).toHaveAccessibleName("Color mode: Light");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    expect(await firstPaint(page)).toBe("light");
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "light" });
    await chooseTheme(page, "dark", tap);
    await page.locator(".brand").click();
    await expect(page).toHaveURL(origin + "/");
    await expect(html).toHaveAttribute("data-theme", "dark");

    // Following the system again clears the manual choice.
    await chooseTheme(page, "system", tap);
    await expect(html).toHaveAttribute("data-theme", "light");
    expect(await cookie("oclr-theme")).toBeUndefined();

    // A route refresh (language change) keeps the automatic mode and listener.
    await page.locator(".language-control button").first().click();
    await page.locator('.language-control [data-locale="zh-Hans"]').click();
    await expect(html).toHaveAttribute("lang", "zh-Hans");
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(html).toHaveAttribute("data-theme-preference", "system");
    await expect(trigger).toHaveAccessibleName("明暗模式：跟随系统（浅色）");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "dark");
    expect(failures).toEqual([]);
  });
});
