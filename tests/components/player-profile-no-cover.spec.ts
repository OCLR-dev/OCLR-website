import { test, expect } from "@playwright/test";

// A profile whose osu! response carries no banner artwork must keep the
// current cover card instead of falling back to the older stacked layout: the
// identity heading stays overlaid on an artless cover ring and the summary
// card keeps its cover placement.
for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test(`the banner-less profile keeps the cover card layout (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/player-profile-no-cover");

    const cover = page.locator(".profile-summary > .profile-cover");
    await expect(cover).toBeVisible();
    // The cover is still a banner on the card: it bleeds to the card edges and
    // keeps the minimum banner height.
    const coverBox = (await cover.boundingBox())!;
    const cardBox = (await page.locator(".profile-summary").boundingBox())!;
    expect(coverBox.width).toBeGreaterThan(cardBox.width - 4);
    expect(coverBox.height).toBeGreaterThanOrEqual(110);
    // Only the artwork and its darkening scrim are absent.
    await expect(cover.locator(".profile-cover-image")).toHaveCount(0);
    expect(
      await cover.evaluate((node) => getComputedStyle(node, "::after").content),
    ).toBe("none");

    // The heading and the summary card are inside the cover, as with artwork.
    const heading = cover.locator(".profile-cover-content > header");
    await expect(heading).toBeVisible();
    await expect(
      cover.locator(".profile-cover-content .bws-card"),
    ).toBeVisible();

    // The id pill still clears the overlaid avatar.
    const pillBox = (await page.locator(".profile-id-badge").boundingBox())!;
    const avatarBox = (await heading.locator(".avatar").boundingBox())!;
    expect(avatarBox.y).toBeGreaterThanOrEqual(pillBox.y + pillBox.height);

    // Without artwork the heading cannot rely on white-on-scrim text or the
    // dark-cover remapping of the tier colours.
    const nameColor = await heading
      .locator("h1")
      .evaluate((node) => getComputedStyle(node).color);
    expect(nameColor).toBe("rgb(27, 20, 34)");
    expect(
      await heading
        .locator("h1")
        .evaluate((node) => getComputedStyle(node).textShadow),
    ).toBe("none");
    expect(
      await page
        .locator(".profile-cover-content .bws-card .bws-value--rank-tier")
        .last()
        .evaluate((node) => getComputedStyle(node).filter),
    ).toBe("none");
  });
}
