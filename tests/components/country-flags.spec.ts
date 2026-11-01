import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
});

test("local assets preserve geometry and accessible names across locales and themes", async ({
  page,
}, info) => {
  for (const width of info.project.name.startsWith("mobile")
    ? [320, 375]
    : [1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
      for (const theme of ["light", "dark"]) {
        await page.goto(`/country-flags?locale=${locale}&theme=${theme}`);
        await expect(
          page.getByRole("heading", { name: "Country flags" }),
        ).toBeVisible();
        const flags = page.locator(".country-flag img");
        await expect(flags).toHaveCount(13);
        await expect
          .poll(() =>
            flags.evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.complete &&
                  image.naturalWidth > 0,
              ),
            ),
          )
          .toBe(true);
        const dimensions = await flags.evaluateAll((images) =>
          images.map((image) => {
            const img = image as HTMLImageElement;
            const rect = img.getBoundingClientRect();
            return {
              width: rect.width,
              height: rect.height,
              naturalRatio: img.naturalWidth / img.naturalHeight,
              fit: getComputedStyle(img).objectFit,
              src: img.getAttribute("src"),
            };
          }),
        );
        for (const image of dimensions) {
          expect(image.width / image.height).toBeCloseTo(image.naturalRatio, 3);
          expect(image.fit).toBe("contain");
          const source = new URL(image.src!, page.url());
          expect(source.origin).toBe(new URL(page.url()).origin);
          expect(source.pathname).toMatch(/^\/flags\/twemoji\//);
        }
        const sizes = dimensions.map((image) => image.height);
        expect(sizes).toContain(18);
        expect(sizes).toContain(24);
        expect(sizes).toContain(32);
        await expect(
          page
            .getByRole("region", { name: "Published team list" })
            .getByRole("img"),
        ).toHaveCount(0);
        await expect(
          page.getByTestId("invalid").locator(".country-flag"),
        ).toHaveCount(0);
        await expect(
          page.getByRole("region", { name: "Staff" }).getByRole("img"),
        ).toHaveAttribute("aria-label", /Taiwan|台湾|台灣/);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        if (
          locale === "en" &&
          ((width === 1280 && theme === "light") ||
            (width === 320 && theme === "dark"))
        ) {
          const path = info.outputPath(`flags-${width}-${theme}.png`);
          await page.screenshot({ fullPage: true, path });
          await info.attach(`flags-${width}-${theme}`, {
            path,
            contentType: "image/png",
          });
        }
      }
    }
  }
});

test("flag artwork and sizes remain consistent across public appearances", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
    for (const theme of ["light", "dark"]) {
      await page.goto(`/country-flags?appearance=${appearance}&theme=${theme}`);
      const flag = page
        .getByRole("region", { name: "Staff" })
        .locator(".country-flag img");
      await expect
        .poll(() =>
          flag.evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      expect(await flag.boundingBox()).toMatchObject({ width: 24, height: 24 });
      expect(
        await flag.evaluate((image) => getComputedStyle(image).filter),
      ).toBe("none");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(375);
    }
  }
});

test("a failed asset becomes a stable neutral code, and a new country can load", async ({
  page,
}) => {
  let failedRequests = 0;
  await page.route("**/flags/twemoji/1f1fa-1f1f8.svg", (route) => {
    failedRequests++;
    return route.abort();
  });
  await page.goto("/country-flags");
  const flag = page.getByTestId("recoverable");
  await expect(flag).toHaveText("US");
  await expect(flag.getByRole("img")).toHaveAttribute(
    "aria-label",
    "United States",
  );
  const before = await flag.boundingBox();
  await page.getByRole("button", { name: "Render again" }).click();
  await expect(flag.locator("img")).toHaveCount(0);
  expect(failedRequests).toBe(1);
  await page.getByRole("button", { name: "Change country" }).click();
  await expect(flag.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Japan flag",
  );
  await expect
    .poll(() =>
      flag
        .locator("img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  expect((await flag.boundingBox())!.height).toBe(before!.height);
});
