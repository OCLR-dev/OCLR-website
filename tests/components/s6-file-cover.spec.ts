import { expect, test } from "@playwright/test";

// A real browser is needed to verify the recovered JPEG actually loads in each
// shared image consumer. Database writes/identity are covered by integration tests.
test("S6 file cover loads in card, compact and detail views with provider images unavailable", async ({
  page,
}) => {
  await page.route("https://assets.ppy.sh/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/public-mappools?archive&s6-file");
  const image = page.locator("#map-NM3 img");
  await expect(image).toHaveAttribute(
    "src",
    /\/archive\/beatmaps\/2314568\/cover\.jpg$/,
  );
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBe(1920);
  await expect(page.locator("#map-NM3 .map-card-art")).toHaveCSS(
    "background-image",
    /\/archive\/beatmaps\/2314568\/cover\.jpg/,
  );
  await expect(page.locator("#map-NM3")).toContainText("CS 4");
  await expect(page.locator("#map-NM3")).toContainText("AR 9.5");
  await expect(page.locator("#map-NM3")).toContainText("OD 9.1");
  await page.locator(".map-view-control button").nth(1).click();
  await expect(image).toHaveAttribute(
    "src",
    /\/archive\/beatmaps\/2314568\/cover\.jpg$/,
  );
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBe(1920);
  await page.locator("#map-NM3 .map-open-button").click();
  const detail = page.getByRole("dialog");
  await expect(detail.locator("img")).toHaveAttribute(
    "src",
    /\/archive\/beatmaps\/2314568\/cover\.jpg$/,
  );
  await expect
    .poll(() =>
      detail
        .locator("img")
        .evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBe(1920);
  await page.keyboard.press("Escape");
});
