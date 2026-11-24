import { expect, test } from "@playwright/test";
import {
  closeHeaderPreferences,
  expectPreferenceMenuFits,
  openHeaderPreferences,
} from "../e2e/header-preferences";

// Existing menu tests miss the homepage's direct token declarations. A browser
// is needed to resolve inherited CSS variables with :has() across route changes.
test("homepage header keeps appearance colors when switching and returning", async ({
  page,
}, info) => {
  const header = page.locator(".site-header");
  const paint = () =>
    header.evaluate((node) => {
      const style = getComputedStyle(node);
      const login = getComputedStyle(node.querySelector(".nav-login")!);
      return [
        style.backgroundColor,
        style.color,
        style.borderBottomColor,
        login.backgroundColor,
        login.color,
        login.borderColor,
        login.borderRadius,
      ];
    });
  const inherits = async () => {
    await expect
      .poll(() =>
        header.evaluate((node) => {
          const style = getComputedStyle(node);
          const shell = getComputedStyle(node.closest(".themed-site")!);
          return [
            "--site-header",
            "--site-foreground",
            "--site-accent",
            "--site-border",
            "--site-primary",
            "--site-on-primary",
          ].every(
            (key) =>
              style.getPropertyValue(key) === shell.getPropertyValue(key),
          );
        }),
      )
      .toBe(true);
  };
  const choose = async (appearance: string) => {
    await openHeaderPreferences(page);
    await page.locator(".appearance-trigger").click();
    await expectPreferenceMenuFits(
      page,
      page.locator('.appearance-control [role="menu"]'),
    );
    await page.locator(`[data-appearance-option="${appearance}"]`).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      appearance,
    );
    await closeHeaderPreferences(page);
  };
  for (const [appearance, theme] of [
    ["cute-pastel", "light"],
    ["swiss-minimal", "dark"],
  ]) {
    await page.goto(
      `/header?home=1&locale=en&appearance=${appearance}&theme=${theme}`,
    );
    await header.screenshot({ path: info.outputPath(`${appearance}.png`) });
    await inherits();
    const homePaint = await paint();
    await page.locator("[data-route-change]").click();
    await expect(page.locator(".home-redesign")).toHaveCount(0);
    await expect.poll(paint).toEqual(homePaint);
    await page.locator("[data-route-home]").click();
    await expect(page.locator(".home-redesign")).toHaveCount(1);
    await expect.poll(paint).toEqual(homePaint);
    await choose("default");
    await expect(header).toHaveCSS(
      "background-color",
      theme === "light" ? "rgb(240, 233, 250)" : "rgb(17, 19, 41)",
    );
    await choose(appearance);
    await expect.poll(paint).toEqual(homePaint);
    await openHeaderPreferences(page);
    await page.locator(".theme-control").click();
    await page
      .locator(`[data-theme-option="${theme === "light" ? "dark" : "light"}"]`)
      .click();
    await inherits();
    await closeHeaderPreferences(page);
    await page.reload();
    await inherits();
  }
});

// Independent presentation risks, without multiplying language, theme, role
// and width over every appearance. Server-side session routing stays in E2E.
test("long remote account names fit on phones, tablets and desktop", async ({
  page,
}) => {
  const username = "Synthetic Directory 2717000 Captain";
  await page.route("**/api/osu-images/avatar/*", (route) => route.abort());
  for (const [width, appearance] of [
    [320, "default"],
    [768, "cute-pastel"],
    [1440, "default"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    const params = new URLSearchParams({
      remote: "1",
      user: "player",
      username,
      appearance,
      locale: "en",
      theme: "dark",
    });
    await page.goto(`/header?${params}`);
    await expect(page.locator(".account-label")).toHaveText(username);
    await expect(page.locator(".account-label")).toHaveAttribute(
      "title",
      username,
    );
    await expect(
      page.locator(".nav-actions").getByRole("link"),
    ).toHaveAttribute("href", "/remote");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("phone menus retain focus and dismiss nested preferences", async ({
  page,
}) => {
  await page.route("**/api/osu-images/avatar/*", (route) => route.abort());
  for (const [width, appearance, locale, user] of [
    [320, "default", "en", ""],
    [390, "cute-pastel", "zh-Hant", "player"],
    [760, "glassmorphism", "zh-Hans", "staff"],
  ] as const) {
    await page.setViewportSize({ width, height: 568 });
    await page.goto(
      `/header?appearance=${appearance}&theme=dark&locale=${locale}&user=${user}`,
    );
    const toggle = page.locator(".menu-toggle");
    const preferences = page.locator(".site-preferences");
    await expect(preferences).toBeHidden();
    await toggle.click();
    await expect(preferences).toBeVisible();
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

test("anonymous English navigation fits across the collapse boundaries", async ({
  page,
}) => {
  await page.goto("/header?locale=en");
  for (const width of [768, 1100, 1101, 1321, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".nav-login")).toBeVisible();
    await expect(page.locator(".appearance-trigger")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (width === 1440) {
      await expect(page.locator(".main-nav")).toBeVisible();
      await expect(page.locator(".menu-toggle")).toBeHidden();
    }
  }
});
