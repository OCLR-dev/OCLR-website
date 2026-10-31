import { test, expect } from "@playwright/test";

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test(`the player id pill clears the overlaid avatar (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/player-profile-cover");
    const pill = page.locator(".profile-id-badge");
    await expect(pill).toBeVisible();

    const pillBox = (await pill.boundingBox())!;
    const avatarBox = (await page
      .locator(".profile-cover-content .avatar")
      .boundingBox())!;
    // The pill is pinned to the card corner, so the overlaid heading has to
    // start below it instead of sharing the corner.
    expect(avatarBox.y).toBeGreaterThanOrEqual(pillBox.y + pillBox.height);

    // Narrow covers reserve the pill's row; that gap is the same 1.25rem the
    // other cover groups keep from the artwork edges.
    if (viewport.name === "phone") {
      expect(avatarBox.y - (pillBox.y + pillBox.height)).toBeCloseTo(20, 0);
    }
  });
}

test("the improvement index carries the faster-than-typical colour band", async ({
  page,
}) => {
  await page.goto("/player-profile-cover");
  const metric = page.locator(".bws-card-metric").last();
  await expect(metric.locator(".bws-card-label")).toHaveText("OII");
  const value = metric.locator(".bws-value");
  await expect(value).toHaveText("1.35");
  await expect(value).toHaveClass(/bws-value--oii-up/);
  await expect(value).toHaveClass(/bws-value--rank-tier/);
});
