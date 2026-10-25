import { test, expect, type Locator, type Page } from "@playwright/test";
import { closeDb } from "../../src/db";
import { seedSession } from "./session";

test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
let staffCookie: Awaited<ReturnType<typeof seedSession>>;
test.beforeAll(async () => {
  if (process.env.TEST_DATABASE_URL) staffCookie = await seedSession(60001);
});
test.afterAll(closeDb);

// Visibility alone does not detect a later header row painting over a menu.
// Sample the edges as well as the centre of every actual touch target.
async function unobstructed(items: Locator) {
  for (const item of await items.all()) {
    await expect(item).toBeVisible();
    expect(
      await item.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return [0.2, 0.5, 0.8].every((x) =>
          [0.25, 0.5, 0.75].every((y) =>
            node.contains(
              document.elementFromPoint(
                box.x + box.width * x,
                box.y + box.height * y,
              ),
            ),
          ),
        );
      }),
      `Covered target: ${await item.textContent()}`,
    ).toBe(true);
  }
}

async function withinViewport(page: Page, menu: Locator, width: number) {
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const locale of ["zh-Hans", "zh-Hant", "en"])
  for (const theme of ["light", "dark"])
    for (const appearance of [
      "default",
      "cute-pastel",
      "swiss-minimal",
      "claymorphism",
      "manga-halftone",
      "glassmorphism",
    ]) {
      test(`header overlays ${locale} ${theme} ${appearance}`, async ({
        page,
        context,
      }, info) => {
        test.setTimeout(60000);
        const activate = (target: Locator) =>
          info.project.use.hasTouch ? target.tap() : target.click();
        await context.addCookies([
          staffCookie,
          ...[
            ["oclr-locale", locale],
            ["oclr-theme", theme],
            ["oclr-appearance", appearance],
          ].map(([name, value]) => ({
            name,
            value,
            url: "http://127.0.0.1:3100",
          })),
        ]);
        await page.route("https://a.ppy.sh/**", (route) => route.abort());
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/");
        const header = page.locator(".site-header");
        const account = header.locator("button.account-control");
        const appearanceTrigger = header.locator(".appearance-trigger");
        const language = header.locator(".language-control > button");
        for (const width of [
          320, 360, 390, 412, 674, 819, 950, 951, 1024, 1100, 1101, 1440,
        ]) {
          await page.setViewportSize({ width, height: 900 });
          await unobstructed(header.locator("button:visible"));
          if (width <= 950) {
            const toggle = await header.locator(".menu-toggle").boundingBox();
            const actions = await header.locator(".nav-actions").boundingBox();
            const rightEdge = await header
              .locator(".nav-wrap")
              .evaluate((node) => {
                const box = node.getBoundingClientRect();
                return (
                  box.right - parseFloat(getComputedStyle(node).paddingRight)
                );
              });
            if (width > 480) {
              expect(toggle!.x).toBeGreaterThanOrEqual(
                actions!.x + actions!.width,
              );
              expect(
                Math.abs(
                  toggle!.y +
                    toggle!.height / 2 -
                    actions!.y -
                    actions!.height / 2,
                ),
              ).toBeLessThan(2);
            } else {
              expect(toggle!.y + toggle!.height).toBeLessThanOrEqual(
                actions!.y,
              );
            }
            expect(toggle!.x + toggle!.width).toBeCloseTo(rightEdge, 0);
          }

          await activate(account);
          const menu = header.locator(".account-dropdown");
          await expect(menu).toBeVisible();
          await withinViewport(page, menu, width);
          await unobstructed(menu.getByRole("menuitem"));
          await expect(menu.getByRole("menuitem").first()).toBeFocused();
          await expect(menu.getByRole("menuitem").first()).toHaveAttribute(
            "href",
            "/dashboard",
          );
          await expect(menu.getByRole("menuitem").last()).toHaveAttribute(
            "href",
            "/admin",
          );
          if ((width === 360 || width === 674) && locale === "zh-Hans")
            await page.screenshot({
              path: info.outputPath(`${width}-${theme}-${appearance}.png`),
            });
          await page.keyboard.press("End");
          await expect(menu.getByRole("menuitem").last()).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(menu).toHaveCount(0);
          await expect(account).toBeFocused();

          // Opening another control dismisses the previous menu through the
          // existing outside-pointer/focus handlers, including keyboard use.
          await activate(appearanceTrigger);
          const appearanceMenu = header.locator(
            '.appearance-control [role="menu"]',
          );
          await withinViewport(page, appearanceMenu, width);
          await unobstructed(appearanceMenu.getByRole("menuitemradio"));
          await activate(language);
          await expect(appearanceMenu).toHaveCount(0);
          const languageMenu = header.locator(
            '.language-control [role="menu"]',
          );
          await withinViewport(page, languageMenu, width);
          await unobstructed(languageMenu.getByRole("menuitemradio"));
          await activate(account);
          await expect(languageMenu).toHaveCount(0);
          await unobstructed(menu.getByRole("menuitem"));
          await page.keyboard.press("Escape");
          await language.focus();
          await language.press("ArrowDown");
          await expect(
            languageMenu.getByRole("menuitemradio").first(),
          ).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(language).toBeFocused();
          await appearanceTrigger.focus();
          await appearanceTrigger.press("ArrowUp");
          await expect(
            appearanceMenu.getByRole("menuitemradio").last(),
          ).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(appearanceTrigger).toBeFocused();
          await activate(header.locator(".theme-control"));
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme === "light" ? "dark" : "light",
          );
          await activate(header.locator(".theme-control"));
        }
        await context.clearCookies({ name: "oclr_session" });
        await page.reload();
        await expect(header.locator(".nav-login")).toBeVisible();
        await expect(account).toHaveCount(0);
        await page.setViewportSize({ width: 320, height: 900 });
        await unobstructed(header.locator("button:visible, .nav-login"));
        const signedOutToggle = await header
          .locator(".menu-toggle")
          .boundingBox();
        const login = await header.locator(".nav-login").boundingBox();
        expect(
          signedOutToggle!.y + signedOutToggle!.height,
        ).toBeLessThanOrEqual(login!.y);

        await activate(header.locator(".menu-toggle"));
        await expect(header.locator(".main-nav")).toBeVisible();
        await unobstructed(header.locator(".main-nav > a"));
      });
    }
