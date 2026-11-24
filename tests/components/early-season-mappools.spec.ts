import { expect, test } from "@playwright/test";
import snapshot from "../../src/data/archive-beatmaps.json" with { type: "json" };

test("early saved maps share enriched titles, difficulty, counts and missing states in every view", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
  await page.route("**/api/osu-images/{cover,list}/*", (route) =>
    route.request().url().endsWith("/293275")
      ? route.fulfill({
          status: 404,
          contentType: "text/plain",
          body: "Not found",
        })
      : route.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180"><rect width="400" height="180" fill="#6b417f"/></svg>',
        }),
  );
  await page.goto("/public-mappools?archive&early-season=s1");
  await expect(page.locator(".archive-map-item")).toHaveCount(19);
  const first = page.locator("#map-NM1");
  await expect(first).toContainText("Yoru Naku Usagi wa Yume o Miru");
  const difficulty = snapshot.maps[1532662].difficulty;
  await expect(first.locator(".map-card-difficulty")).toHaveText(
    `[${difficulty}]`,
  );
  await expect(first).toContainText("CS 4");
  await page.locator("#map-NM3").scrollIntoViewIfNeeded();
  await expect(page.locator("#map-NM3")).toContainText("Cover unavailable");
  await page.getByRole("searchbox").fill(difficulty);
  await expect(first).toBeVisible();
  await page.locator(".map-view-control button").nth(1).click();
  await expect(first).toContainText(difficulty);
  await first.locator(".map-open-button").click();
  await expect(page.getByRole("dialog")).toContainText(difficulty);
  await page.keyboard.press("Escape");

  await page.goto("/public-mappools?archive&early-season=s2");
  await expect(page.locator(".archive-map-item")).toHaveCount(18);
  await expect(page.locator("#map-DT5, #map-TB1")).toHaveCount(0);
  await expect(
    page.locator('.archive-pool-stages a[aria-current="page"]'),
  ).toContainText("18");
  await page.goto("/public-mappools?archive&early-season=s2&pool=final");
  await expect(page.locator(".archive-map-item")).toHaveCount(20);
  for (const [slot, bid] of [
    ["NM1", 950963],
    ["DT5", 804387],
    ["TB1", 1962336],
  ] as const) {
    const row = page.locator(`#map-${slot}`);
    await expect(row).toContainText(bid.toString());
    await expect(row.locator(".map-card-title")).not.toContainText(
      "Not recorded",
    );
  }
  await page.getByRole("searchbox").fill("950963");
  await expect(page.locator(".archive-map-item")).toHaveCount(1);
  await page.locator(".map-view-control button").nth(1).click();
  const repaired = snapshot.maps[950963].title;
  await expect(page.locator("#map-NM1")).toContainText(repaired);
  await page.locator("#map-NM1 .map-open-button").click();
  await expect(page.getByRole("dialog")).toContainText(repaired);
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox").fill("");
  await page.locator(".map-sort select").selectOption("title");
  const titles = await page.locator(".map-open-button").allTextContents();
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  const compactBounds = await page
    .locator("#map-NM1 .archive-map-identity")
    .boundingBox();
  expect(compactBounds!.width).toBeGreaterThan(100);
  expect(compactBounds!.height).toBeLessThan(1000);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: info.outputPath("s2-enriched.png"),
    fullPage: false,
  });
  await page.goto(
    "/public-mappools?archive&early-season=s2&pool=captain-qualifier",
  );
  const unknown = page.locator("#map-NM2");
  await expect(unknown).toContainText("Not recorded");
  await expect(unknown).toContainText("1009329");
  await expect(unknown).toContainText("Cover unavailable");
});
