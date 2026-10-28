import { test, expect } from "@playwright/test";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { statisticsArchive } from "../fixtures/archive-statistics";
import { closeDb } from "../../src/db";

test("schedule side headers follow locale changes and refresh", async ({
  page,
  context,
}) => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  await seedEditions([
    {
      ...edition,
      slug: "s7",
      published: true,
      status: "completed",
      registration: null,
      archive: statisticsArchive,
    },
  ]);
  for (const [locale, red, blue] of [
    ["en", "Red team", "Blue team"],
    ["zh-Hans", "红方", "蓝方"],
    ["zh-Hant", "紅方", "藍方"],
  ]) {
    await context.addCookies([
      { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
    ]);
    await page.goto("/tournaments/s7/schedule");
    for (let refresh = 0; refresh < 2; refresh++) {
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(
        page.getByRole("columnheader", { name: red, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: blue, exact: true }),
      ).toBeAttached();
      if (!refresh) await page.reload();
    }
  }
});
test.afterAll(async () => closeDb());
