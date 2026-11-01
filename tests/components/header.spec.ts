import { expect, test } from "@playwright/test";
import { appearances } from "../../src/lib/preferences";
import { expectPreferenceMenuFits } from "../e2e/header-preferences";

test("phone dropdown keeps preferences accessible across appearances, locales and account states", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.route("https://a.ppy.sh/**", (route) => route.abort());
  for (const [index, appearance] of appearances.entries()) {
    for (const theme of ["light", "dark"]) {
      const locale = ["zh-Hans", "zh-Hant", "en"][index % 3];
      const user = ["", "player", "staff"][index % 3];
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(
        `/header?appearance=${appearance}&theme=${theme}&locale=${locale}&user=${user}`,
      );
      const toggle = page.locator(".menu-toggle");
      for (const width of [320, 390, 760]) {
        await page.setViewportSize({ width, height: 568 });
        await expect(page.locator(".site-preferences")).toBeHidden();
        const boxes = await page
          .locator(".brand,.menu-toggle,.nav-actions")
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const b = node.getBoundingClientRect();
              return { x: b.x, y: b.y, width: b.width, height: b.height };
            }),
          );
        expect(
          new Set(boxes.map((b) => Math.round(b.y + b.height / 2))).size,
        ).toBe(1);
        for (const box of boxes)
          expect(box.x + box.width).toBeLessThanOrEqual(width);
        await toggle.click();
        await expect(page.locator(".main-nav > a")).toHaveCount(6);
        const preferences = page.locator(".site-preferences");
        await expect(preferences).toBeVisible();
        await expect(preferences.locator(":scope > div > button")).toHaveCount(
          3,
        );
        await page.locator(".appearance-trigger").click();
        const choices = page.locator('.appearance-control [role="menu"]');
        await expect(choices.getByRole("menuitemradio")).toHaveCount(10);
        await expectPreferenceMenuFits(page, choices);
        await page.keyboard.press("Escape");
        await expect(page.locator(".appearance-trigger")).toBeFocused();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(toggle).toBeFocused();
        await expect(preferences).toBeHidden();
        await toggle.click();
        await page.mouse.click(4, 564);
        await expect(preferences).toBeHidden();
        await expect(toggle).toBeFocused();
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/header?locale=zh-Hant");
  await page.locator(".menu-toggle").click();
  await page.screenshot({ path: info.outputPath("phone-dropdown.png") });
});

test("phone controls preserve preference cookies and close on navigation or leaving focus", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/header?remote=1");
  await expect(page.locator(".account-control")).toHaveAttribute(
    "href",
    "/remote",
  );
  const toggle = page.locator(".menu-toggle");
  await toggle.click();
  await page.locator(".appearance-trigger").click();
  await page.locator('[data-appearance-option="cute-pastel"]').click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "cute-pastel",
  );
  await page.locator(".theme-control").click();
  await page.locator('[data-theme-option="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator(".language-control > button").click();
  await page.locator('[data-locale="zh-Hant"]').click();
  expect((await context.cookies()).map((c) => `${c.name}=${c.value}`)).toEqual(
    expect.arrayContaining([
      "oclr-appearance=cute-pastel",
      "oclr-theme=dark",
      "oclr-locale=zh-Hant",
    ]),
  );
  await page.locator(".language-control > button").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".site-preferences")).toBeHidden();
  await toggle.click();
  await page.locator('.main-nav > a[href="/"]').click();
  await expect(page.locator(".site-preferences")).toBeHidden();
});

test("desktop and tablet retain existing preference controls and navigation", async ({
  page,
}) => {
  for (const width of [768, 950, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/header?user=staff");
    await expect(page.locator(".appearance-trigger")).toBeVisible();
    await expect(page.locator(".theme-control")).toBeVisible();
    await expect(page.locator(".language-control > button")).toBeVisible();
    await expect(page.locator(".mobile-preference-heading")).toBeHidden();
    await expect(page.locator(".mobile-preference-label").first()).toBeHidden();
    await expect(page.locator(".header-menu-panel")).toHaveCSS(
      "display",
      "contents",
    );
    if (width === 1440) {
      await expect(page.locator(".main-nav")).toBeVisible();
      await expect(page.locator(".menu-toggle")).toBeHidden();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
