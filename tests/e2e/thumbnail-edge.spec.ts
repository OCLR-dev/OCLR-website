import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
test.describe("S11 thumbnail source edge", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("clips the pale source rows and preserves other season artwork", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const assets = [
      "/archive/s8/thumbnail.webp",
      "/archive/s9/thumbnail.webp",
      "/archive/s10/thumbnail.webp",
      "/oclr-s11-square-logo.webp",
    ];
    await seedEditions(
      assets.map((logo, i) => ({
        ...edition,
        slug: `edge-s${i + 8}`,
        name: `Season ${i + 8} thumbnail`,
        status: i < 3 ? "completed" : "upcoming",
        season: String(i + 8),
        branding: { ...edition.branding, logo },
      })),
    );
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
      ]);
      for (const width of isMobile ? [320, 390] : [768, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto("/tournaments");
        const card = page.locator(".edition-card").filter({
          has: page.getByRole("heading", {
            name: "Season 11 thumbnail",
            exact: true,
          }),
        });
        const art = card.locator(".edition-art");
        await expect(art.locator("img")).toHaveJSProperty("naturalWidth", 1200);
        const box = (await art.boundingBox())!;
        const image = (await art.locator("img").boundingBox())!;
        expect(image.y).toBeLessThan(box.y - box.height * 0.003);
        expect(image.width / image.height).toBeCloseTo(1, 4);
        const { data, info: dimensions } = await sharp(
          await art.screenshot({
            path: info.outputPath(`s11-${theme}-${width}.png`),
          }),
        )
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        // Element screenshots round fractional device-pixel bounds outward.
        // Probe one CSS pixel inside; geometry above verifies the actual source crop.
        const row = Math.ceil(dimensions.width / box.width);
        let light = 0,
          total = 0;
        for (
          let x = Math.floor(dimensions.width * 0.2);
          x < dimensions.width * 0.8;
          x++
        ) {
          const offset = (row * dimensions.width + x) * dimensions.channels;
          if (
            data[offset] > 200 &&
            data[offset + 1] > 200 &&
            data[offset + 2] > 200
          )
            light++;
          total++;
        }
        expect(light / total).toBeLessThan(0.1);
        await art.screenshot({
          path: info.outputPath(`s11-${theme}-${width}.png`),
        });
        for (let i = 0; i < 3; i++) {
          const other = page
            .locator(".edition-card")
            .filter({
              has: page.getByRole("heading", {
                name: `Season ${i + 8} thumbnail`,
                exact: true,
              }),
            })
            .locator(".edition-art img");
          await expect(other).toHaveAttribute("src", assets[i]);
          await expect(other).toHaveCSS("transform", "none");
        }
      }
    }
  });
});
