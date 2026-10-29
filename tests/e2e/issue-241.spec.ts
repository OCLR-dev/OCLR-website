import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
test.afterAll(closeDb);
test("241 historical presentation", async ({ page, context }, info) => {
  test.setTimeout(120000);
  const archives = [7, 8, 9, 10].map((n) =>
    historicalArchiveSchema.parse(
      JSON.parse(readFileSync(`docs/imports/s${n}-archive.json`, "utf8")),
    ),
  );
  await seedEditions(
    archives.map((archive, i) => ({
      ...edition,
      slug: `issue-241-s${i + 7}`,
      season: String(i + 7),
      name: `OCLR Season ${i + 7}`,
      status: "completed",
      registration: null,
      archive: { ...archive, editionSlug: `issue-241-s${i + 7}` },
    })),
  );
  await context.addCookies([
    { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
  ]);

  for (const theme of ["light", "dark"]) {
    await context.addCookies([
      { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
    ]);
    for (const season of [7, 8, 9, 10])
      for (const route of ["schedule", "bracket"]) {
        await page.goto(`/tournaments/issue-241-s${season}/${route}`);
        const phase = page.locator(".archive-competition > .event-tabs button");
        await expect(phase).toHaveCount(2);
        await expect(page.locator(".bracket-group-grid")).toBeVisible();
        await phase.nth(1).click();
        await expect(page.locator(".bracket-group-grid")).toHaveCount(0);
        const canvas = page.locator(".bracket-library-scroll");
        await expect(canvas).toBeVisible();
        await expect(canvas.locator(".match-card")).toHaveCount(
          season === 8 ? 14 : 10,
        );
        await expect(canvas.locator("svg path").first()).toBeVisible();
        await expect(page.locator(".page-notes")).toContainText(
          "Recorded appearances are reference links, not confirmed advancement.",
        );
        await page.getByText("Connection sources", { exact: true }).click();
        await expect(
          page.locator(".bracket-source-details .match-source"),
        ).toHaveCount(season === 8 ? 16 : 12);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (route === "schedule")
          await page.screenshot({
            path: info.outputPath(`s${season}-bracket-${theme}.png`),
            fullPage: false,
          });
      }
  }
});
