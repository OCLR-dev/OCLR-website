import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import prepared from "../../drizzle/legacy-editions.json" with { type: "json" };

test.describe("custom language menu", () => {
  // Start without cookies in an explicit browser language, rather than relying
  // on the former unconditional Simplified Chinese default.
  test.use({ locale: "zh-CN" });
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("supports keyboard, touch, persistence and bounded theme-aware presentation", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    await seedEditions(prepared.map((item) => ({ ...item, published: true })));
    await context.clearCookies();
    try {
      await page.goto("/tournaments/s11?view=locale#details");
      const root = page.locator(".language-control");
      const trigger = root.getByRole("button");
      const menu = root.getByRole("menu");
      const options = root.getByRole("menuitemradio");
      await expect(root.locator("select")).toHaveCount(0);
      await expect(trigger).toHaveAccessibleName(/简体中文$/);
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.focus();
      await trigger.press("Enter");
      await expect(options).toHaveText(["简体中文", "繁體中文", "English"]);
      await expect(options.nth(0)).toBeFocused();
      await expect(options.nth(0)).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("End");
      await expect(options.nth(2)).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(options.nth(0)).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(options.nth(2)).toBeFocused();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press(" ");
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
      await expect(trigger).toHaveAccessibleName(/繁體中文$/);
      await expect(menu).toHaveCount(0);
      await expect(page).toHaveURL(/\/tournaments\/s11\?view=locale#details$/);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
      expect(
        (await context.cookies()).find(
          (cookie) => cookie.name === "oclr-locale",
        )?.value,
      ).toBe("zh-Hant");
      await trigger.press("ArrowUp");
      await expect(options.nth(2)).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await trigger.press("ArrowDown");
      await expect(options.nth(0)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(menu).toHaveCount(0);
      await trigger.click();
      await page.getByRole("heading", { level: 1 }).click();
      await expect(menu).toHaveCount(0);
      for (const width of isMobile ? [320, 390] : [1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["light", "dark"]) {
          if ((await page.locator("html").getAttribute("data-theme")) !== theme)
            await page.locator(".theme-control").click();
          if (isMobile) await trigger.tap();
          else await trigger.click();
          await expect(menu).toBeVisible();
          await expect(options.locator('[aria-hidden="true"]')).toHaveCount(3);
          const box = (await menu.boundingBox())!;
          const anchor = (await trigger.boundingBox())!;
          expect(box.width).toBeLessThan(200);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(box.y - anchor.y - anchor.height).toBeGreaterThanOrEqual(6);
          for (const item of await options.all())
            expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(
              44,
            );
          expect(
            (
              await new AxeBuilder({ page })
                .include(".site-header")
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
          await page.screenshot({
            path: info.outputPath(`language-${theme}-${width}.png`),
            animations: "disabled",
          });
          if (isMobile) await options.nth(2).tap();
          else await options.nth(2).click();
          await expect(page.locator("html")).toHaveAttribute("lang", "en");
          await expect(menu).toHaveCount(0);
        }
      }
      // A pending refresh keeps one selection authoritative and blocks a second
      // activation, without changing the current deep link or auth routes.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/tournaments/s11?**", async (route) => {
        if (route.request().headers().rsc === "1") await gate;
        await route.continue();
      });
      await trigger.click();
      await options.nth(0).click();
      try {
        await expect(trigger).toHaveAttribute("aria-busy", "true");
        await expect(trigger).toBeDisabled();
        await expect(menu).toHaveCount(0);
        expect(
          (await context.cookies()).find(
            (cookie) => cookie.name === "oclr-locale",
          )?.value,
        ).toBe("zh-Hans");
      } finally {
        release();
      }
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
      await expect(trigger).toBeEnabled();
    } finally {
      await seedEditions(prepared);
    }
  });
});
