import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeDb } from "../../src/db";
import { createSession } from "../../src/lib/auth/sessions";
import { appearances } from "../../src/lib/preferences";
import {
  seedPlayerHistory,
  historyUid,
  historyEdition,
} from "../fixtures/player-history";
import { seedEditions } from "../fixtures/editions";

test.describe("Dashboard UID participation history", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async ({ context }) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await seedPlayerHistory();
    const session = await createSession(historyUid);
    await context.addCookies([
      {
        name: "oclr_session",
        value: session.token,
        url: "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await context.route("https://a.ppy.sh/**", (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#5865a8"/></svg>',
      }),
    );
    await context.route("https://assets.ppy.sh/**", (r) => r.abort());
  });
  test.afterAll(closeDb);
  test("shows history-only seasons, scoped links, separate teams and no private/unrelated records", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/dashboard");
    const history = page.locator("#participation-history");
    await expect(history.locator("h3")).toHaveText([
      "Synthetic season 10",
      "Synthetic season 5",
      "Synthetic season 3",
    ]);
    await expect(
      history.getByText("Later historical name", { exact: true }),
    ).toHaveCount(2);
    await expect(
      history.locator('a[href="/tournaments/history-ten/teams/alpha"]'),
    ).toHaveText("Synthetic Alpha");
    await expect(
      history.locator('a[href="/tournaments/history-ten/teams/beta"]'),
    ).toHaveText("Synthetic Beta");
    await expect(history).not.toContainText("PRIVATE_");
    await expect(page.locator("#registrations")).toContainText(
      "You have no applications yet",
    );
    await history
      .getByRole("link", { name: "Synthetic season 10", exact: true })
      .click();
    await expect(page).toHaveURL(/\/tournaments\/history-ten$/);
    await page.goto("/dashboard");
    await page
      .locator(
        '#participation-history a[href="/tournaments/history-ten/teams/beta"]',
      )
      .click();
    await expect(page).toHaveURL(/\/tournaments\/history-ten\/teams\/beta$/);
    expect((await page.locator("main").innerText()).length).toBeGreaterThan(0);
    expect(
      (await page.goto(`/players/${historyUid}?edition=history-ten`))?.status(),
    ).toBe(200);
    await expect(
      page.locator('section[aria-labelledby="participation"] > ul > li'),
    ).toHaveCount(2);
    await seedEditions([
      {
        ...historyEdition("history-ten", "10", "Later historical name"),
        published: false,
      },
    ]);
    await page.goto("/dashboard");
    await expect(history.locator("h3")).toHaveCount(2);
    const other = await createSession(historyUid + 1);
    await context.addCookies([
      {
        name: "oclr_session",
        value: other.token,
        url: "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.reload();
    await expect(history).toContainText(
      "No historical participation is recorded yet.",
    );
    expect(errors).toEqual([]);
  });
  test("keeps the compact list usable across appearances, locales, light/dark and narrow screens", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(240000);
    const locales = ["en", "zh-Hans", "zh-Hant"];
    for (const [i, appearance] of appearances.entries()) {
      for (const theme of ["light", "dark"]) {
        const locale = locales[i % locales.length];
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            url: "http://127.0.0.1:3100",
          },
          { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        await page.setViewportSize({
          width: isMobile ? 390 : 1440,
          height: 1000,
        });
        expect((await page.goto("/dashboard"))?.status()).toBe(200);
        await expect(page.locator("#participation-history h3")).toHaveCount(3);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const scan = await new AxeBuilder({ page })
          .include("#participation-history")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(scan.violations).toEqual([]);
        if (appearance === "default")
          await page.screenshot({
            path: info.outputPath(
              `history-${isMobile ? "mobile" : "desktop"}-${theme}.png`,
            ),
            fullPage: true,
          });
      }
    }
    for (const locale of ["zh-Hans", "zh-Hant"]) {
      await context.addCookies([
        {
          name: "oclr-appearance",
          value: "default",
          url: "http://127.0.0.1:3100",
        },
        { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
        { name: "oclr-theme", value: "light", url: "http://127.0.0.1:3100" },
      ]);
      await page.reload();
      await expect(page.locator("#history-heading")).toHaveText(
        locale === "zh-Hans" ? "我的历史参赛记录" : "我的歷史參賽記錄",
      );
      await page.screenshot({
        path: info.outputPath(
          `history-${isMobile ? "mobile" : "desktop"}-${locale}.png`,
        ),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.reload();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator('#participation-history a[href="/tournaments/history-ten"]')
      .focus();
    await expect(
      page.locator('#participation-history a[href="/tournaments/history-ten"]'),
    ).toBeFocused();
  });
});
