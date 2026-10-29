import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { readFileSync } from "node:fs";
import { closeDb } from "../../src/db";

async function expectOverviewContents(page: Page, mobile: boolean) {
  const contents = page.locator(
    mobile
      ? ".information-overview-contents.rules-mobile-contents"
      : ".information-overview-contents.rules-desktop-contents",
  );
  await expect(contents).toBeVisible();
  await expect(
    page.locator(
      ".information-page .rules-desktop-contents:visible, .information-page .rules-mobile-contents:visible",
    ),
  ).toHaveCount(1);
  await expect(
    page.locator(
      "#rules .rules-desktop-contents, #rules .rules-mobile-contents",
    ),
  ).toHaveCount(0);
  for (const anchor of ["stages", "schedule", "rules", "rules-1", "rules-2"])
    await expect(contents.locator(`a[href="#${anchor}"]`)).toHaveCount(1);
  await expect(
    page.locator(".information-page .information-heading"),
  ).toHaveCount(0);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCount(1);
  const headingBox = (await heading.boundingBox())!;
  expect(headingBox.width).toBeLessThanOrEqual(1);
  expect(headingBox.height).toBeLessThanOrEqual(1);
  return contents;
}

async function expectNavigationTypography(page: Page) {
  const navigationLink = page
    .getByRole("navigation", { name: "Tournament navigation", exact: true })
    .getByRole("link")
    .first();
  await expect(navigationLink).toBeVisible();
  const navigationSize = await navigationLink.evaluate(
    (node) => getComputedStyle(node).fontSize,
  );
  const breadcrumbSizes = await page
    .locator(".event-identity .context-link")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).fontSize),
    );
  expect(breadcrumbSizes).toEqual([navigationSize, navigationSize]);
}

test.describe("tournament overview alignment (#265, #323)", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("uses one overview index while preserving historical handbooks and chapter links", async ({
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
            const contents = await expectOverviewContents(page, isMobile);
            await expect(page.locator("#information-title")).toHaveText(
              edition.name,
            );
            const banner = await page
              .locator(".information-overview-reading .information-banner")
              .boundingBox();
            const reading = await page
              .locator(".information-overview-reading")
              .boundingBox();
            expect(banner!.width).toBeCloseTo(reading!.width, 0);
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
            const index = (await contents.boundingBox())!;
            if (!isMobile) {
              expect(index.x + index.width).toBeLessThanOrEqual(reading!.x);
              expect(Math.abs(index.y - banner!.y)).toBeLessThanOrEqual(2);
            } else {
              expect(index.y + index.height).toBeLessThanOrEqual(banner!.y);
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
            await expect(
              page.locator(".information-overview-contents"),
            ).toHaveCount(0);
            await expect(
              page.locator(
                isMobile
                  ? "#rules .rules-mobile-contents"
                  : "#rules .rules-desktop-contents",
              ),
            ).toBeVisible();
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
          await expectNavigationTypography(page);
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
          await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement)
              document.activeElement.blur();
            window.scrollTo(0, 0);
          });
          await page.screenshot({
            path: info.outputPath(`${slug}-${appearance}-${theme}.png`),
            fullPage: true,
          });
        }
      }
    }
    // The banner fills the reading column on either side of the index breakpoint.
    for (const width of [819, 647]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tournaments/overview-test");
      const banner = await page.locator(".information-banner").boundingBox();
      const reading = await page
        .locator(".information-overview-reading")
        .boundingBox();
      expect(banner!.width).toBeCloseTo(reading!.width, 0);
      const index = await expectOverviewContents(page, width <= 760);
      const indexBox = await index.boundingBox();
      if (width > 760) {
        expect(indexBox!.x + indexBox!.width).toBeLessThanOrEqual(reading!.x);
        expect(Math.abs(indexBox!.y - banner!.y)).toBeLessThanOrEqual(2);
      } else {
        expect(indexBox!.y + indexBox!.height).toBeLessThanOrEqual(banner!.y);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`overview-${width}-unified-index.png`),
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

  test("keeps tournament navigation available while scrolling and rule chapters clear of both headers (#323)", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const slug = `overview-scroll-${isMobile ? "mobile" : "desktop"}-test`;
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic tournament with a long name for navigation wrapping",
        rules: {
          version: "scroll-test-v1",
          sections: Array.from({ length: 4 }, (_, chapter) => ({
            heading: `Synthetic chapter ${chapter + 1}: detailed tournament instructions with a long heading`,
            body: Array.from(
              { length: 6 },
              (_, paragraph) =>
                `Synthetic paragraph ${paragraph + 1} for chapter ${chapter + 1}. This text supplies enough reading content to check scrolling and chapter navigation without using real tournament rules.`,
            ).join("\n\n"),
          })),
        },
      },
    ]);
    await page.setViewportSize({
      width: isMobile ? 320 : 1280,
      height: 720,
    });
    const header = page.locator(".site-header");
    const tournamentBar = page.locator(".public-tournament > .event-context");
    const chapter = page.locator("#rules-3");
    const contents = page.locator(
      isMobile
        ? ".information-overview-contents.rules-mobile-contents"
        : ".information-overview-contents.rules-desktop-contents",
    );
    async function expectPinnedNavigation() {
      await expect
        .poll(async () => {
          const top = await header.boundingBox();
          const bar = await tournamentBar.boundingBox();
          return Boolean(
            top &&
            bar &&
            bar.y >= top.y + top.height - 1 &&
            bar.y <= top.y + top.height + 16 &&
            bar.y + bar.height <= page.viewportSize()!.height,
          );
        })
        .toBe(true);
    }
    async function expectReadableChapter() {
      await expect(chapter).toBeInViewport();
      await expect
        .poll(async () => {
          const bar = await tournamentBar.boundingBox();
          const heading = await chapter.boundingBox();
          return Boolean(
            bar &&
            heading &&
            heading.y >= bar.y + bar.height - 1 &&
            heading.y + heading.height <= page.viewportSize()!.height,
          );
        })
        .toBe(true);
    }
    async function expectUsableMobileMenu(screenshot: string) {
      const menu = page.getByRole("button", { name: /Tournament menu/ });
      const navigation = page.getByRole("navigation", {
        name: "Tournament navigation",
        exact: true,
      });
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expectNavigationTypography(page);
      await expect(navigation).not.toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect
        .poll(async () => {
          const bar = await tournamentBar.boundingBox();
          const pane = await navigation.boundingBox();
          return Boolean(
            bar &&
            pane &&
            pane.y >= bar.y + bar.height - 1 &&
            pane.y + pane.height <= page.viewportSize()!.height,
          );
        })
        .toBe(true);
      const lastLink = navigation.getByRole("link").last();
      await lastLink.focus();
      await expect(lastLink).toBeFocused();
      await expect
        .poll(async () => {
          const link = await lastLink.boundingBox();
          const top = await header.boundingBox();
          return Boolean(
            link &&
            top &&
            link.y >= top.y + top.height &&
            link.y + link.height <= page.viewportSize()!.height,
          );
        })
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(screenshot),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toBeFocused();
      await expect(navigation).not.toBeVisible();
      await menu.click();
      await page.locator(".event-identity > span").click();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(navigation).not.toBeVisible();
    }
    for (const appearance of [
      "default",
      "cute-pastel",
      "swiss-minimal",
      "claymorphism",
      "manga-halftone",
      "glassmorphism",
      "esports-broadcast",
      "retro-arcade",
      "frutiger-aero",
      "skyline-pop",
      "glacier-blue",
      "sakura-circuit",
      "graphite-arena",
      "orbital-pulse",
      "prism-overture",
      "azure-brush",
      "verdant-prelude",
      "chromatic-origins",
      "frost-waltz",
    ]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            url: "http://127.0.0.1:3100",
          },
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto(`/tournaments/${slug}`);
        await expect(tournamentBar).toBeVisible();
        await expectOverviewContents(page, isMobile);
        if (!isMobile) await expectNavigationTypography(page);
        if (isMobile) {
          // Initial wrapper spacing must not push the dropdown off-screen.
          await page.setViewportSize({ width: 320, height: 568 });
          await page.evaluate(() => window.scrollTo(0, 0));
          await expectUsableMobileMenu(
            `initial-menu-${appearance}-${theme}.png`,
          );
          await page.setViewportSize({ width: 320, height: 720 });
        }
        for (const top of [600, 1000]) {
          await page.evaluate((y) => window.scrollTo(0, y), top);
          await expectPinnedNavigation();
        }
        if (isMobile) {
          // A short mobile viewport must still expose the final menu item.
          await page.setViewportSize({ width: 320, height: 568 });
          await expectPinnedNavigation();
          await expectUsableMobileMenu(
            `pinned-menu-${appearance}-${theme}.png`,
          );
          await page.setViewportSize({ width: 320, height: 720 });
          await contents.locator("summary").click();
        }
        await contents.locator('a[href="#rules-3"]').click();
        await expectReadableChapter();
        await expectPinnedNavigation();
        if (!isMobile) {
          const bar = (await tournamentBar.boundingBox())!;
          const index = (await contents.boundingBox())!;
          expect(index.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
          expect(index.y + index.height).toBeLessThanOrEqual(
            page.viewportSize()!.height,
          );
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`pinned-chapter-${appearance}-${theme}.png`),
          animations: "disabled",
        });
        // Reloading a shared chapter link must account for both sticky bars.
        await page.reload();
        await expectReadableChapter();
        await expectPinnedNavigation();
      }
    }
  });
});
