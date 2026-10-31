import { expect, test } from "@playwright/test";

test("a narrow homepage downloads responsive PNGs without full-size fallbacks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requested = new Set<string>();
  page.on("request", (request) => {
    if (request.resourceType() === "image")
      requested.add(new URL(request.url()).pathname);
  });
  await page.goto("/");
  const layers = page.locator(".home-composition picture img");
  await expect(layers).toHaveCount(3);
  for (const image of await layers.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const src = await image.evaluate(
      (node: HTMLImageElement) => node.currentSrc,
    );
    expect(src).toMatch(/-(?:320|480|640|960|1600)\.png$/);
  }
  for (const name of ["nebula-only", "foreground", "liru-refined-v2"]) {
    expect(requested.has(`/branding/home-s11/${name}.png`)).toBe(false);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("the homepage hero leaves the entries and the next section on the first screen (#587)", async ({
  page,
}) => {
  for (const [width, height] of [
    [1920, 990],
    [1440, 990],
    [1366, 768],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const box = async (selector: string) =>
      (await page.locator(selector).first().boundingBox())!;
    const hero = await box(".home-feature");
    const entries = await box(".home-entry-links");
    const logo = await box(".home-layer-logo");
    expect(entries.y + entries.height).toBeLessThanOrEqual(height);
    expect(hero.y + hero.height).toBeLessThanOrEqual(height - 120);
    expect(logo.y + logo.height).toBeLessThan(entries.y);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
