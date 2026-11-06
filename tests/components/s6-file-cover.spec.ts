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
for (const entry of [
  {
    season: "s6",
    slot: "NM3",
    bid: 2314568,
    width: 1920,
    query: "s6-file",
    cs: "4",
    ar: "9.5",
    od: "9.1",
  },
  {
    season: "s2",
    slot: "NM2",
    bid: 1009329,
    width: 1366,
    query: "early-season=s2&pool=captain-qualifier",
    cs: "4",
    ar: "9.3",
    od: "8.3",
  },
])
  test(`${entry.season} recovered cover loads in card, compact and detail views`, async ({
    page,
  }) => {
    await page.route("https://assets.ppy.sh/**", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.goto(`/public-mappools?archive&${entry.query}`);
    const image = page.locator(`#map-${entry.slot} img`);
    await expect(image).toHaveAttribute(
      "src",
      new RegExp(`/archive/beatmaps/${entry.bid}/cover\\.jpg$`),
    );
    await expect
      .poll(() =>
        image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBe(entry.width);
    await expect(page.locator(`#map-${entry.slot} .map-card-art`)).toHaveCSS(
      "background-image",
      new RegExp(`/archive/beatmaps/${entry.bid}/cover\\.jpg`),
    );
    await expect(page.locator(`#map-${entry.slot}`)).toContainText(
      `CS ${entry.cs}`,
    );
    await expect(page.locator(`#map-${entry.slot}`)).toContainText(
      `AR ${entry.ar}`,
    );
    await expect(page.locator(`#map-${entry.slot}`)).toContainText(
      `OD ${entry.od}`,
    );
    if (entry.season === "s2") {
      await expect(page.locator(`#map-${entry.slot}`)).toContainText(
        "Yakusoku no Ao",
      );
      await expect(page.locator(`#map-${entry.slot}`)).toContainText("HP 5.5");
    }
    await page.locator(".map-view-control button").nth(1).click();
    await expect(image).toHaveAttribute(
      "src",
      new RegExp(`/archive/beatmaps/${entry.bid}/cover\\.jpg$`),
    );
    await expect
      .poll(() =>
        image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBe(entry.width);
    await page.locator(`#map-${entry.slot} .map-open-button`).click();
    const detail = page.getByRole("dialog");
    await expect(detail.locator("img")).toHaveAttribute(
      "src",
      new RegExp(`/archive/beatmaps/${entry.bid}/cover\\.jpg$`),
    );
    await expect
      .poll(() =>
        detail
          .locator("img")
          .evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBe(entry.width);
    await page.keyboard.press("Escape");
  });
