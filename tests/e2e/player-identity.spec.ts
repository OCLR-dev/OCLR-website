import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db, closeDb } from "../../src/db";
import { userProfileCache } from "../../src/db/schema";
import { seedSession } from "./session";

test.describe("known player without public participation", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("opens from the dashboard, keeps empty statistics/participation usable and private in three locales", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const id = isMobile ? 360102 : 360101;
    await context.addCookies([await seedSession(id)]);
    await db()
      .insert(userProfileCache)
      .values({
        osuId: id,
        mode: "osu",
        profile: null,
        errorStatus: 404,
        attemptedAt: new Date(),
        retryAt: new Date(Date.now() + 3600000),
      })
      .onConflictDoUpdate({
        target: [userProfileCache.osuId, userProfileCache.mode],
        set: {
          profile: null,
          errorStatus: 404,
          retryAt: new Date(Date.now() + 3600000),
        },
      });
    await page.goto("/dashboard");
    const link = page.locator(`a[href="/players/${id}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await expect(
      page.getByRole("heading", {
        name: `Synthetic Player ${id}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("No published tournament participation is available.", {
        exact: true,
      }),
    ).toBeVisible();
    expect((await context.request.get(`/api/players/${id}`)).status()).toBe(
      200,
    );
    for (const [locale, message] of [
      ["zh-Hans", "暂无已公开的参赛记录。"],
      ["zh-Hant", "暫無已公開的參賽紀錄。"],
      ["en", "No published tournament participation is available."],
    ]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      await page.reload();
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath("known-empty-profile.png"),
      fullPage: true,
    });
    const anonymous = await browser.newContext();
    expect(
      (
        await anonymous.request.get(`http://127.0.0.1:3100/api/players/${id}`)
      ).status(),
    ).toBe(404);
    await anonymous.close();
  });
});
