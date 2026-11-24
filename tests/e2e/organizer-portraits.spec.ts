import { test, expect } from "@playwright/test";
import { db, closeDb } from "../../src/db";
import { staffRoles, users } from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
const base = 322000;
test.describe("complete organizer portraits", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("keeps square, landscape and portrait artwork intact and handles failed images", async ({
    page,
    context,
    isMobile,
  }) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await seedEditions([edition], false);
    for (let i = 0; i < 4; i++) {
      await db()
        .insert(users)
        .values({
          osuId: base + i,
          username:
            i === 0 ? "Synthetic long主辦人員Name" : "Synthetic Organizer " + i,
        })
        .onConflictDoNothing();
      await db()
        .insert(staffRoles)
        .values({
          userId: base + i,
          role: "admin",
          editionSlug: null,
          grantedBy: base,
          aboutPublished: true,
        })
        .onConflictDoNothing();
    }
    await page.route("**/api/osu-images/avatar/*", (route) => {
      const n = Number(route.request().url().split("/").at(-1)) - base;
      if (n === 3) return route.abort();
      return route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${n === 1 ? 176 : 88}" height="${n === 2 ? 176 : 88}"><rect width="100%" height="100%" fill="#7650a0"/></svg>`,
      });
    });
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
      for (const theme of ["light", "dark"])
        for (const width of isMobile ? [320, 390] : [1440]) {
          await context.addCookies([
            {
              name: "oclr-appearance",
              value: appearance,
              domain: "127.0.0.1",
              path: "/",
            },
            {
              name: "oclr-theme",
              value: theme,
              domain: "127.0.0.1",
              path: "/",
            },
          ]);
          await page.setViewportSize({ width, height: 1000 });
          await page.goto("/about");
          const cards = page.locator("#hosts .organizer-people > li");
          for (let i = 0; i < 3; i++) {
            const image = cards
              .filter({
                has: page.locator(`img[src="/api/osu-images/avatar/${base + i}"]`),
              })
              .locator("img");
            await expect(image).toHaveCSS("object-fit", "contain");
            const box = await image.boundingBox();
            expect(box!.width).toBeCloseTo(box!.height, 0);
            const geometry = await image.evaluate((img) => {
              const outer = img.closest("li")!.getBoundingClientRect(),
                inner = img.getBoundingClientRect();
              return {
                left: inner.left - outer.left,
                top: inner.top - outer.top,
              };
            });
            expect(geometry.left).toBeGreaterThanOrEqual(16);
            expect(geometry.top).toBeGreaterThanOrEqual(16);
          }
          await expect(
            cards
              .filter({ hasText: "Synthetic Organizer 3" })
              .locator(".avatar span"),
          ).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
  });
});
