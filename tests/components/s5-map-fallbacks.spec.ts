import { expect, test } from "@playwright/test";

const locale = "en";

const theme = "light";

test(`legacy S5 links work without a provider lookup (${locale}, ${theme})`, async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
  await page.route("**/api/osu-images/{cover,list}/*", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180"><rect width="400" height="180" fill="#6b417f"/></svg>',
    }),
  );
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.method());
  });
  await page.goto(
    `/public-mappools?archive&legacy-s5&locale=${locale}&theme=${theme}`,
  );
  const checkLinks = async () => {
    for (const [slot, original] of [
      ["DT2", 2933979],
      ["DT4", 2678913],
    ] as const) {
      const actions = page.locator(`#map-${slot} .beatmap-actions`);
      await expect(
        actions.locator(`a[href="https://osu.ppy.sh/beatmaps/${original}"]`),
      ).toHaveCount(1);
      await expect(
        actions.locator(`a[href="osu://b/${original}"]`),
      ).toHaveCount(1);
    }
  };
  await checkLinks();
  await expect(page.locator("#map-DT2 .map-card-id-value")).toHaveText(
    "2567502",
  );
  await expect(page.locator("#map-DT4 .map-card-id-value")).toHaveText(
    "2720295",
  );
  await expect(page.locator("#map-DT4 .map-card-values")).toContainText(
    "210 BPM",
  );
  await expect(page.locator("#map-DT4 .map-card-star")).toHaveText("6.27 ★");
  await page.locator("#map-DT4 .map-open-button").click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.locator('a[href="https://osu.ppy.sh/beatmaps/2678913"]'),
  ).toBeVisible();
  await expect(dialog.locator('a[href="osu://b/2678913"]')).toBeVisible();
  await expect(dialog.locator(".map-detail-grid").first()).toContainText("210");
  await expect(dialog.locator(".map-detail-grid").first()).toContainText("8.5");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: info.outputPath(`s5-${theme}.png`),
    fullPage: true,
  });
  await page.locator(".map-view-control button").nth(1).click();
  await checkLinks();
  await expect(page.locator("#map-DT4")).toContainText("#2720295");
  await page.getByRole("searchbox").fill("2933979");
  await expect(page.locator("#map-DT2")).toBeVisible();
  await expect(page.locator("#map-DT4")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(writes).toEqual([]);
});
