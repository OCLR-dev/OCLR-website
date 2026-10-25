import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";

test.describe("archive official covers", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("loads covers independently and degrades once on a genuine image error", async ({
    page,
    context,
  }, info) => {
    const s10 = JSON.parse(
      readFileSync("docs/imports/s10-archive.json", "utf8"),
    ) as typeof historicalArchive;
    const originals = s10.pools.flatMap((p) => p.maps);
    const maps = [3786810, 4914171, 123, null].map((beatmapId, i) => ({
      ...(originals.find((m) => m.beatmapId === beatmapId) ??
        historicalArchive.pools[0].maps[0]),
      slot: `NM${i + 1}`,
      beatmapId,
    }));
    await seedEditions([
      {
        ...edition,
        slug: "cover-test",
        status: "completed",
        registration: null,
        archive: {
          ...historicalArchive,
          editionSlug: "cover-test",
          pools: [{ ...historicalArchive.pools[0], maps }],
        },
      },
    ]);
    let failedRequests = 0;
    await context.route("https://assets.ppy.sh/beatmaps/**", (route) => {
      if (route.request().url().includes("/42/")) {
        failedRequests++;
        return route.fulfill({ status: 404, body: "" });
      }
      return process.env.OCLR_REAL_COVER_CHECK
        ? route.continue()
        : route.fulfill({
            status: 200,
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="250"><rect width="900" height="250" fill="#6c427e"/></svg>',
          });
    });
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
      ]);
      await page.goto("/tournaments/cover-test/mappools");
      const images = page.locator(".map-card-cover img");
      await expect(images).toHaveCount(2);
      await expect(images.nth(0)).toHaveAttribute(
        "src",
        "https://assets.ppy.sh/beatmaps/1843515/covers/cover.jpg",
      );
      await expect(images.nth(1)).toHaveAttribute(
        "src",
        "https://assets.ppy.sh/beatmaps/2299790/covers/cover.jpg",
      );
      for (const img of await images.all())
        await expect(img).toHaveJSProperty("naturalWidth", 900);
      await expect(
        page.locator(".beatmap-cover").filter({ hasText: "Cover unavailable" }),
      ).toHaveCount(2);
      const settledFailures = failedRequests;
      const search = page.getByRole("searchbox", {
        name: "Search maps",
        exact: true,
      });
      await search.fill("123");
      await expect(page.locator(".archive-map-item")).toHaveCount(1);
      await search.fill("");
      await expect(images).toHaveCount(2);
      expect(failedRequests).toBe(settledFailures); // Unrelated renders do not retry a failed image.
      await page.screenshot({
        path: info.outputPath(`archive-covers-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Compact table", exact: true })
        .click();
      await expect(page.locator(".archive-map-item")).toHaveCount(4);
      await expect(
        page.locator(
          '.archive-map-list .beatmap-cover [aria-label="Cover unavailable"]',
        ),
      ).toHaveCount(2);
      await page
        .getByRole("button", { name: "Map cards", exact: true })
        .click();
      await expect(images).toHaveCount(2);
    }
    expect(failedRequests).toBeLessThanOrEqual(6); // SSR may fail before hydration; explicit Cards remounts retry once.
  });
});
