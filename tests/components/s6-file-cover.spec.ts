import { expect, test } from "@playwright/test";

// The 404 regression needs a browser to verify actual image loading and the
// card's CSS artwork as well as the interactive compact/detail consumers.
test("a reviewed alternative loads across views without changing the original map actions", async ({
  page,
}) => {
  await page.route("https://assets.ppy.sh/**", async (route) => {
    if (route.request().url().includes("/beatmaps/743685/covers/cover.jpg"))
      await route.fulfill({
        path: "public/archive/beatmaps/2314568/cover.jpg",
        contentType: "image/jpeg",
      });
    else await route.fulfill({ status: 404 });
  });
  await page.goto("/public-mappools?archive&early-season=s1&pool=gs");
  const card = page.locator("#map-NM3");
  const image = card.locator("img");
  await expect(image).toHaveAttribute(
    "src",
    "https://assets.ppy.sh/beatmaps/743685/covers/cover.jpg",
  );
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBe(1920);
  await expect(card.locator(".map-card-art")).toHaveCSS(
    "background-image",
    /\/beatmaps\/743685\/covers\/cover.jpg/,
  );
  await expect(
    card.getByRole("link", { name: /Open on osu!/ }),
  ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/659750");
  await page.locator(".map-view-control button").nth(1).click();
  await expect(image).toHaveAttribute(
    "src",
    "https://assets.ppy.sh/beatmaps/743685/covers/cover.jpg",
  );
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBe(1920);
  await card.locator(".map-open-button").click();
  const detail = page.getByRole("dialog");
  await expect(detail.locator("img")).toHaveAttribute(
    "src",
    "https://assets.ppy.sh/beatmaps/743685/covers/cover.jpg",
  );
  await expect
    .poll(() =>
      detail
        .locator("img")
        .evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBe(1920);
  await expect(detail).toContainText("Alternative background");
  await expect(
    detail.getByRole("link", { name: "Alternative background", exact: true }),
  ).toHaveAttribute("href", "https://osu.ppy.sh/beatmapsets/743685");
  await expect(
    detail.getByRole("link", { name: "Open on osu!", exact: true }),
  ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/659750");
});

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
