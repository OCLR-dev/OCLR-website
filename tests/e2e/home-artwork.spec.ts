import { expect, test } from "@playwright/test";

const LIRU = /\/branding\/home-hero\/liru-cn-v3-(?:480|800|1111)\.webp$/;

test("a narrow homepage loads the small Liru artwork and the small nebula", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requested = new Set<string>();
  page.on("request", (request) => {
    if (request.resourceType() === "image")
      requested.add(new URL(request.url()).pathname);
  });
  await page.goto("/");
  const liru = page.locator(".home-hero-character img");
  await expect(liru).toBeVisible();
  await expect
    .poll(() =>
      liru.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(
    await liru.evaluate((node: HTMLImageElement) => node.currentSrc),
  ).toMatch(/liru-cn-v3-(?:480|800|1111)\.webp$/);
  expect(requested.has("/branding/home-hero/nebula-v2-2560.webp")).toBe(false);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("the layered hero keeps logo, entries and Liru apart and the next section on the first screen (#587)", async ({
  page,
}) => {
  for (const [width, height] of [
    [1920, 990],
    [1440, 990],
    [1366, 768],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [430, 932],
    [390, 844],
    [360, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const box = async (selector: string) =>
      (await page.locator(selector).first().boundingBox())!;
    const hero = await box(".home-feature");
    const entries = await box(".home-entry-links");
    const logo = await box(".home-hero-logo");
    const liru = await box(".home-hero-character");
    expect(entries.y + entries.height).toBeLessThanOrEqual(height);
    expect(hero.y + hero.height).toBeLessThanOrEqual(height - 120);
    expect(logo.y + logo.height).toBeLessThan(entries.y);
    if (width > 760) {
      // Liru is beside the logo and entries, never over them
      for (const other of [logo, entries])
        expect(
          liru.x >= other.x + other.width ||
            liru.y >= other.y + other.height ||
            liru.y + liru.height <= other.y,
        ).toBe(true);
    } else {
      // Phones: the logo is above Liru, and the entries sit in the empty
      // sky left of her hair (37 % across the art) and above the fan (41 %
      // down), so they never cover her
      const art = await box(".home-hero-character img");
      expect(logo.y + logo.height).toBeLessThanOrEqual(liru.y);
      expect(entries.x + entries.width).toBeLessThanOrEqual(
        art.x + art.width * 0.37,
      );
      expect(entries.y + entries.height).toBeLessThanOrEqual(
        art.y + art.height * 0.41,
      );
    }
    expect(
      await page
        .locator(".home-hero-character img")
        .evaluate((node: HTMLImageElement) => node.currentSrc),
    ).toMatch(LIRU);
    if (width !== 1024)
      // 1024: the site header's own overflow, unrelated to the hero
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
  }
});

test("Liru's ahoge stays inside her window at the top of the float", async ({
  page,
}) => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const art = page.locator(".home-hero-character img");
    // hold the image at the highest point of its float
    await art.evaluate((node: HTMLElement) => {
      node.style.animation = "none";
      node.style.transform = "translateY(calc(-1 * var(--home-liru-float)))";
    });
    const window = (await page.locator(".home-hero-character").boundingBox())!;
    const peak = (await art.boundingBox())!;
    expect(peak.y).toBeGreaterThanOrEqual(window.y + 4);
  }
});

const ANIMATED = [
  ".home-hero-sky",
  ".home-hero-stars span",
  ".home-hero-logo-stars span",
  ".home-hero-logo-sheen",
  ".home-hero-logo-sparkle",
  ".home-hero-character img",
];

test("the hero animates by default", async ({ page }) => {
  await page.goto("/");
  for (const selector of ANIMATED)
    await expect(page.locator(selector).first()).not.toHaveCSS(
      "animation-name",
      "none",
    );
});

test("reduced motion stops the hero animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const selector of ANIMATED)
    await expect(page.locator(selector).first()).toHaveCSS(
      "animation-name",
      "none",
    );
});
