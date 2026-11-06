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

test("long previous usernames stay on one line and pause on hover", async ({
  page,
}) => {
  await page.goto("/player-profile-cover");
  const aliases = page.locator('[class*="previousNames"]').first();
  await expect(aliases).toHaveAttribute("data-overflowing", "true");

  const viewport = aliases.locator('[class*="previousNamesViewport"]');
  const track = aliases.locator('[class*="previousNamesTrack"]');
  await expect(viewport).toBeVisible();
  expect(await viewport.evaluate((node) => node.clientHeight)).toBeLessThan(40);
  expect(
    await track.evaluate((node) => getComputedStyle(node).animationName),
  ).toContain("previousNamesMarquee");

  await aliases.hover();
  expect(
    await track.evaluate((node) => getComputedStyle(node).animationPlayState),
  ).toBe("paused");
  // Pausing keeps the names as ordinary selectable text for drag selection.
  expect(
    await aliases
      .locator('[class*="previousNamesViewport"]')
      .evaluate((node) => getComputedStyle(node).userSelect),
  ).toBe("text");
});

test("the improvement index carries the faster-than-typical colour band", async ({
  page,
}) => {
  await page.goto("/player-profile-cover");
  const badges = page.locator(".bws-card-metric").nth(3);
  await expect(badges.locator(".bws-card-label")).toHaveText("Badges");
  await expect(badges.locator(".bws-value")).toHaveText("2");
  const metric = page.locator(".bws-card-metric").last();
  await expect(metric.locator(".bws-card-label")).toHaveText("OII");
  const value = metric.locator(".bws-value");
  await expect(value).toHaveText("1.35");
  await expect(value).toHaveClass(/bws-value--oii-up/);
  await expect(value).toHaveClass(/bws-value--rank-tier/);
});
