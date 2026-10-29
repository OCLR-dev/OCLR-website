import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { users, staffRoles } from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
const base = 982000;
async function roster(count: number) {
  await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  await seedEditions([
    edition,
    {
      ...edition,
      slug: "private-cup",
      name: "PRIVATE_EDITION",
      published: false,
    },
  ]);
  await db()
    .insert(users)
    .values(
      Array.from({ length: count + 1 }, (_, i) => ({
        osuId: base + i,
        username:
          i === count
            ? "PRIVATE_STAFF"
            : i === 0
              ? "LongMixed主辦人員Username"
              : "Organizer " + (i + 1),
      })),
    );
  if (count)
    await db()
      .insert(staffRoles)
      .values(
        Array.from({ length: count }, (_, i) => ({
          userId: base + i,
          role: "admin" as const,
          editionSlug: null,
          grantedBy: base,
          aboutPublished: true,
        })),
      );
  await db()
    .insert(staffRoles)
    .values({
      userId: base + count,
      role: "referee",
      editionSlug: "private-cup",
      grantedBy: base,
      aboutPublished: true,
    });
  if (count)
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: base,
          role: "mappooler",
          editionSlug: "test-cup",
          grantedBy: base,
          aboutPublished: true,
        },
        {
          userId: base,
          role: "referee",
          editionSlug: "test-cup",
          grantedBy: base,
          aboutPublished: true,
        },
      ]);
}
test.describe("compact About organizer cards", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async ({ context }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await context.route("https://a.ppy.sh/**", (route) =>
      route.request().url().endsWith(String(base))
        ? route.abort()
        : route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#704594"/></svg>',
          }),
    );
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);
  test("handles empty, one, three and many people without disclosing private grants", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    for (const count of [0, 1, 3, 24]) {
      await roster(count);
      await page.goto("/about");
      await expect(page.locator(".public-staff-list > li")).toHaveCount(
        count ? count + 2 : 0,
      );
      await expect(page.locator("main")).not.toContainText(
        /PRIVATE_STAFF|PRIVATE_EDITION/,
      );
      await expect(page.locator(".organizer-contact")).toBeVisible();
      if (count) {
        await expect(
          page.locator(".public-staff-list .avatar span").first(),
        ).toBeVisible();
        await expect(
          page
            .locator(".public-staff-list > li")
            .first()
            .locator(".staff-role-name"),
        ).toHaveCount(1);
        const link = page.locator(".public-staff-list h4 a").first();
        await link.focus();
        await expect(link).toBeFocused();
        expect(
          (await page.locator(".public-staff-list > li").first().boundingBox())!
            .width,
        ).toBeLessThanOrEqual(page.viewportSize()!.width);
      }
      if (count === 3)
        await page.screenshot({
          path: info.outputPath("three-organizers.png"),
          fullPage: true,
          animations: "disabled",
        });
    }
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({
            name,
            value,
            url: "http://127.0.0.1:3100",
          })),
        );
        for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto("/about");
          const g = await page.evaluate(() => {
            const rect = (selector: string) =>
              document
                .querySelector(selector)!
                .getBoundingClientRect()
                .toJSON();
            return {
              document: document.documentElement.scrollWidth,
              staff: rect(".organizer-directory"),
              contact: rect(".organizer-contact"),
              grids: [...document.querySelectorAll(".public-staff-list")].map(
                (list) => ({
                  width: list.getBoundingClientRect().width,
                  gap: parseFloat(getComputedStyle(list).columnGap),
                  cards: [...list.children].map((card) =>
                    card.getBoundingClientRect().toJSON(),
                  ),
                }),
              ),
              cards: [
                ...document.querySelectorAll(".public-staff-list > li"),
              ].map((el) => el.getBoundingClientRect().toJSON()),
            };
          });
          expect(g.document).toBeLessThanOrEqual(width);
          for (const grid of g.grids) {
            for (const card of grid.cards)
              expect(
                Math.abs(card.width - (grid.width - grid.gap) / 2),
              ).toBeLessThanOrEqual(1);
            if (grid.cards.length % 2)
              expect(grid.cards.at(-1)!.left).toBeCloseTo(
                grid.cards[0].left,
                0,
              );
          }
          for (const card of g.cards) {
            expect(card.left).toBeGreaterThanOrEqual(g.staff.left);
            expect(card.right).toBeLessThanOrEqual(g.staff.right + 1);
          }
          await expect(
            page.locator(
              '.organizer-contact a[href^="https://osu.ppy.sh/users/"]',
            ),
          ).toHaveAttribute("href", "https://osu.ppy.sh/users/60001");
          if ([390, 1440].includes(width))
            await page.screenshot({
              path: info.outputPath(`about-${locale}-${theme}-${width}.png`),
              fullPage: true,
              animations: "disabled",
            });
        }
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      }
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, base));
    await page.reload();
    await expect(page.locator(".public-staff-list > li")).toHaveCount(23);
  });
});
