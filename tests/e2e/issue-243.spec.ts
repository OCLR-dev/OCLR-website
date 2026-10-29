import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
test.afterAll(closeDb);
test("243 historical presentation", async ({
  page,
  context,
  isMobile,
}, info) => {
  test.setTimeout(120000);
  const archives = [7, 8, 9, 10].map((n) =>
    historicalArchiveSchema.parse(
      JSON.parse(readFileSync(`docs/imports/s${n}-archive.json`, "utf8")),
    ),
  );
  await seedEditions(
    archives.map((archive, i) => ({
      ...edition,
      slug: `issue-243-s${i + 7}`,
      season: String(i + 7),
      name: `OCLR Season ${i + 7}`,
      status: "completed",
      registration: null,
      archive: { ...archive, editionSlug: `issue-243-s${i + 7}` },
    })),
  );
  await context.addCookies([
    { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
  ]);

  for (const theme of ["light", "dark"])
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
      await context.addCookies(
        [
          ["oclr-theme", theme],
          ["oclr-appearance", appearance],
        ].map(([name, value]) => ({
          name,
          value,
          url: "http://127.0.0.1:3100",
        })),
      );
      const heights: number[] = [];
      for (const season of [7, 8, 9, 10]) {
        await page.goto(`/tournaments/issue-243-s${season}`);
        const frame = page.locator(".archive-key-visual");
        await expect(frame.locator("img")).toHaveAttribute(
          "src",
          new RegExp(`/archive/s${season}/`),
        );
        await expect(frame.locator("img")).toHaveJSProperty("complete", true);
        const box = await frame.boundingBox();
        expect(box).not.toBeNull();
        heights.push(box!.height);
        const data = await page
          .locator(".archive-overview-summary .archive-counts")
          .boundingBox();
        expect(data).not.toBeNull();
        if (isMobile) {
          expect(data!.y).toBeGreaterThanOrEqual(box!.y + box!.height);
        } else {
          expect(data!.x).toBeGreaterThanOrEqual(box!.x + box!.width);
          // #265 intentionally caps the five compact metric rows inside the
          // equal-width data column instead of stretching them to the artwork.
          const summary = (await page
            .locator(".archive-overview-summary")
            .boundingBox())!;
          expect(data!.width).toBeLessThanOrEqual(box!.width + 1);
          expect(data!.x + data!.width).toBeLessThanOrEqual(
            summary.x + summary.width + 1,
          );
          expect(data!.y).toBeLessThan(box!.y + box!.height);
        }
        await expect(page.locator(".archive-counts dd")).toHaveText([
          String(archives[season - 7].teams.length),
          String(archives[season - 7].players.length),
          String(
            archives[season - 7].matches.filter(
              (m) => m.score || m.forfeitWinner !== undefined,
            ).length,
          ),
          String(archives[season - 7].pools.length),
          String(
            archives[season - 7].pools.reduce(
              (total, pool) => total + pool.maps.length,
              0,
            ),
          ),
        ]);
        const metricLinks = page.locator(".archive-counts a");
        await expect(metricLinks).toHaveCount(5);
        for (const [index, section] of [
          "teams",
          "players",
          "schedule",
          "mappools",
          "mappools",
        ].entries()) {
          await expect(metricLinks.nth(index)).toHaveAttribute(
            "href",
            `/tournaments/issue-243-s${season}/${section}`,
          );
        }
        await page
          .locator(".archive-counts dt")
          .first()
          .scrollIntoViewIfNeeded();
        // Clicking the label side must hit the row link, not just its number.
        expect(
          await page
            .locator(".archive-counts dt")
            .first()
            .evaluate((label) => {
              const rect = label.getBoundingClientRect();
              return document
                .elementFromPoint(rect.x + 2, rect.y + 2)
                ?.closest("a")
                ?.getAttribute("href");
            }),
        ).toBe(`/tournaments/issue-243-s${season}/teams`);
        expect(box!.height).toBeLessThanOrEqual(
          page.viewportSize()!.height / 2 + 1,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (appearance === "default") {
          await page.screenshot({
            path: info.outputPath(`s${season}-${theme}.png`),
            fullPage: false,
          });
          await page.locator(".archive-overview-summary").screenshot({
            path: info.outputPath(`s${season}-${theme}-summary.png`),
          });
        }
      }
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
    }
});
