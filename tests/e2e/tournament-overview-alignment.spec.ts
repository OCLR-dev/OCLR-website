import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { readFileSync } from "node:fs";
import { closeDb } from "../../src/db";
test.describe("tournament overview alignment (#265)", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("shares the handbook, preserves anchors and uses open headers in every appearance", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await seedEditions([
      {
        ...edition,
        slug: "overview-test",
        branding: {
          ...edition.branding,
          background: "/oclr-s11-website-background.webp",
        },
      },
    ]);
    await seedEditions([
      {
        ...edition,
        slug: "s10",
        season: "10",
        name: "OCLR Season 10",
        status: "completed",
        registration: null,
        archive: JSON.parse(
          readFileSync("docs/imports/s10-archive.json", "utf8"),
        ),
      },
    ]);
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            url: "http://127.0.0.1:3100",
          },
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        for (const slug of ["overview-test", "s10"]) {
          await page.goto(`/tournaments/${slug}`);
          if (slug === "overview-test") {
            await expect(
              page.locator(".information-page > .information-heading"),
            ).toBeVisible();
            const banner = await page
              .locator(".information-page > .information-banner")
              .boundingBox();
            const overview = await page
              .locator(".information-page")
              .boundingBox();
            expect(banner!.width).toBeCloseTo(overview!.width, 0);
            await expect(
              page.locator(
                ".information-contents, .information-intro, .rules-handbook-overview",
              ),
            ).toHaveCount(0);
            const schedule = page.locator(
              ".information-overview-details > .information-document",
            );
            await expect(schedule).toHaveCSS("border-top-width", "0px");
            await expect(schedule).toHaveCSS(
              "background-color",
              "rgba(0, 0, 0, 0)",
            );
            const scheduleBox = await schedule.boundingBox();
            if (!isMobile) {
              const index = await page
                .locator("#rules .rules-desktop-contents")
                .boundingBox();
              const article = await page
                .locator("#rules .rules-article")
                .boundingBox();
              expect(index!.x + index!.width).toBeLessThanOrEqual(article!.x);
              expect(index!.y).toBeGreaterThan(
                scheduleBox!.y + scheduleBox!.height,
              );
            } else {
              const index = await page
                .locator("#rules .rules-mobile-contents")
                .boundingBox();
              expect(index!.y).toBeGreaterThan(
                scheduleBox!.y + scheduleBox!.height,
              );
            }
            await expect(
              page.locator(
                '#organization, #links, a[href="#organization"], a[href="#links"]',
              ),
            ).toHaveCount(0);
            await expect(page.locator("#rules .rules-article")).toContainText(
              edition.eligibility!,
            );
            await expect(page.locator("#rules .rules-article")).toContainText(
              edition.rules!.sections[0].body,
            );
          } else {
            await expect(page.locator(".archive-counts > div")).toHaveCount(5);
            await expect(page.locator("#rules .rules-article")).toBeVisible();
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          if (isMobile)
            await page.getByRole("button", { name: /Tournament menu/ }).click();
          const links = page
            .getByRole("navigation", { name: "Tournament navigation" })
            .getByRole("link");
          await expect(links.filter({ hasText: /^Rules$/ })).toHaveCount(0);
          await expect(
            page
              .getByRole("navigation", { name: "Tournament navigation" })
              .locator(`a[href="/tournaments/${slug}/rules"]`),
          ).toHaveCount(0);
          if (isMobile)
            await page.getByRole("button", { name: /Tournament menu/ }).click();
          expect(
            (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
          await page.screenshot({
            path: info.outputPath(`${slug}-${appearance}-${theme}.png`),
            fullPage: true,
          });
        }
      }
    }
    // Reported tablet width and the former breakpoint both keep the banner full width.
    for (const width of [819, 647]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tournaments/overview-test");
      const banner = await page.locator(".information-banner").boundingBox();
      const overview = await page.locator(".information-page").boundingBox();
      expect(banner!.width).toBeCloseTo(overview!.width, 0);
      const index = page.locator(
        width > 760
          ? "#rules .rules-desktop-contents"
          : "#rules .rules-mobile-contents",
      );
      await expect(index).toBeVisible();
      const indexBox = await index.boundingBox();
      const scheduleBox = await page.locator("#schedule").boundingBox();
      expect(indexBox!.y).toBeGreaterThan(scheduleBox!.y + scheduleBox!.height);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`overview-${width}-full-width.png`),
        fullPage: true,
      });
      if (width <= 760) await index.locator("summary").click();
      await index.locator('a[href="#rules-2"]').click();
      await expect(page.locator("#rules-2")).toBeInViewport();
    }
    await page.goto("/tournaments/overview-test#rules-2");
    await expect(page.locator("#rules-2")).toBeInViewport();
    const legacyHtml = await (
      await context.request.get("/tournaments/overview-test/rules")
    ).text();
    expect(legacyHtml).toContain('name="robots" content="noindex, follow"');
    expect(legacyHtml).not.toContain(edition.rules!.sections[0].body);
    await page.goto("/tournaments/s10/rules");
    await expect(page).toHaveURL(/\/tournaments\/s10#rules$/);
    await expect(page.locator(".rules-handbook")).toBeVisible();
    await page.goto("/tournaments/overview-test/rules#rule-test-rules");
    await expect(page).toHaveURL(/\/tournaments\/overview-test#rules-2$/);
    await expect(page.locator("#rules-2")).toBeInViewport();
    await expect(page.locator("#rules .rules-version")).toContainText(
      edition.rules!.version,
    );
    await page.goto("/tournaments/s10/rules#rule-missing-chapter");
    await expect(page).toHaveURL(/\/tournaments\/s10#rules$/);
    await expect(page.locator("#rules")).toBeInViewport();
  });
});
