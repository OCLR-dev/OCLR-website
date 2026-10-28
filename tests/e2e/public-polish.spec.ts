import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeDb } from "../../src/db";
import { seedPublicPolish, landscapeFixture } from "../fixtures/public-polish";

const base = "/tournaments/test-cup";
async function preferences(
  context: BrowserContext,
  locale: string,
  theme: string,
) {
  await context.addCookies([
    { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
    { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
  ]);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test.describe("public presentation follow-ups", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  let seed: Awaited<ReturnType<typeof seedPublicPolish>>;
  let id: number;
  test.beforeAll(async ({}, info) => {
    id = info.project.name === "mobile" ? 953000 : 952000;
    const admin = info.project.name === "mobile" ? 70001 : 60001;
    seed = await seedPublicPolish(admin, id + 900, id);
  });
  test.beforeEach(async ({ context }) => {
    await context.route("https://assets.ppy.sh/**", (route) =>
      route
        .request()
        .url()
        .includes(String(id + 505))
        ? route.abort()
        : route.fulfill({
            contentType: "image/svg+xml",
            body: landscapeFixture,
          }),
    );
    await context.route("https://a.ppy.sh/**", (route) => route.abort());
  });
  test.afterAll(closeDb);

  test("keeps one and many player cards compact in every locale and edition-private", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await preferences(context, locale, theme);
        for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(
            `${base}/players?q=${encodeURIComponent(`PolishPlayer ${id} 0`)}`,
          );
          const cards = page.locator(".edition-players .event-player-row");
          await expect(cards).toHaveCount(1);
          expect(
            (await cards.first().boundingBox())!.width,
          ).toBeLessThanOrEqual(width);
          expect((await cards.first().boundingBox())!.height).toBeGreaterThan(
            0,
          );
          await expect(cards).not.toContainText("OCLR public UI test");
          await expect(cards.locator(".directory-details")).toHaveCount(0);
          await expect(
            cards.locator(`a[href="/players/${id + 100}?edition=test-cup"]`),
          ).toBeVisible();
          await noOverflow(page);
          if ([320, 1440].includes(width))
            await page.screenshot({
              path: info.outputPath(
                `players-single-${locale}-${theme}-${width}.png`,
              ),
              fullPage: true,
              animations: "disabled",
            });
          await page.goto(
            `${base}/players?q=${encodeURIComponent(`PolishPlayer ${id}`)}`,
          );
          await expect(cards).toHaveCount(24);
          await expect(cards.first().locator(".avatar span")).toBeVisible();
          for (const card of await cards.all())
            expect((await card.boundingBox())!.width).toBeLessThanOrEqual(
              width,
            );
          await noOverflow(page);
          if ([390, 1440].includes(width))
            await page.screenshot({
              path: info.outputPath(
                `players-many-${locale}-${theme}-${width}.png`,
              ),
              fullPage: true,
              animations: "disabled",
            });
        }
      }
    await preferences(context, "en", "light");
    await page.goto(`${base}/players?q=${id}`);
    const html = await page.content();
    expect(html).not.toMatch(
      /PRIVATE_POLISH_ANSWERS|SYNTHETIC_PRIVATE_CONTACT|SYNTHETIC_INTERNAL_REASON/,
    );
    expect(
      (
        await page.goto(`/players/${seed.home.privateId}?edition=test-cup`)
      )?.status(),
    ).toBe(404);
    expect(
      (await page.goto("/tournaments/private-test-cup/players"))?.status(),
    ).toBe(404);
  });

  test("shows landscape rows, keeps all 18 slots and preserves filters, detail and table", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    const url = `${base}/mappools/${seed.poolId}`;
    for (const theme of ["light", "dark"]) {
      await preferences(context, "en", theme);
      await page.goto(url);
      await expect(page.locator(".map-browse-card")).toHaveCount(18);
      await page.getByRole("button", { name: "NM", exact: true }).click();
      await expect(page.locator(".map-browse-card")).toHaveCount(6);
      for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const rows = await page
          .locator(".map-browse-card")
          .first()
          .boundingBox();
        expect(rows).not.toBeNull();
        const boxes = await page
          .locator(".map-browse-card")
          .evaluateAll((nodes) =>
            nodes.map((n) => {
              const box = n.getBoundingClientRect();
              return {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              };
            }),
          );
        expect(new Set(boxes.map((b) => b.x)).size).toBe(1);
        for (let i = 1; i < boxes.length; i++)
          expect(boxes[i].y).toBeGreaterThanOrEqual(
            boxes[i - 1].y + boxes[i - 1].height,
          );
        for (const cover of await page
          .locator(".map-card-cover .beatmap-cover")
          .all()) {
          const b = (await cover.boundingBox())!;
          // The cover fills its column in the wide band row and becomes a
          // 16:9 banner once the card stacks on narrow screens.
          expect(b.width).toBeGreaterThanOrEqual(200);
          if (width <= 640) expect(b.width / b.height).toBeCloseTo(16 / 9, 1);
          else expect(b.height).toBeGreaterThanOrEqual(150);
          expect(b.width / b.height).toBeGreaterThan(1.2);
        }
        await noOverflow(page);
        await page.screenshot({
          path: info.outputPath(`maps-${theme}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
    // Next Image loads lazily; bring the deliberately broken NM6 cover into
    // view before checking its failure state, especially on narrow screens.
    await page
      .locator(".map-browse-card")
      .filter({ has: page.getByText("NM6", { exact: true }) })
      .scrollIntoViewIfNeeded();
    await expect(page.getByText("Cover unavailable")).toBeVisible();
    // Clipboard rejection must be visible as well as announced.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Denied");
          },
        },
      });
    });
    const copy = page.locator(".map-card-id").first();
    await copy.click();
    await expect(copy).toContainText("Could not copy the beatmap ID.");
    await expect(
      page
        .locator('[role="status"]')
        .filter({ hasText: "Could not copy the beatmap ID." }),
    ).toHaveCount(1);
    const first = page.locator(".map-open-button").first();
    await first.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Next map", exact: true }).click();
    await expect(dialog).toContainText("中文标题");
    await page.keyboard.press("Escape");
    await expect(first).toBeFocused();
    await page.getByRole("button", { name: "All mods", exact: true }).click();
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    await expect(page.locator(".mappool-sheet tbody tr")).toHaveCount(18);
    await page.getByRole("button", { name: "Map cards", exact: true }).click();
    await page.locator(".map-sort select").selectOption("title");
    await page.locator(".map-search input").fill("NM6");
    await expect(page.locator(".map-browse-card")).toHaveCount(1);
    await page.locator(".map-search input").fill("NO_MATCH");
    await expect(page.locator(".map-browse-card")).toHaveCount(0);
  });

  test("distinguishes quiet navigation from inline privacy links and retains focus", async ({
    page,
    context,
    isMobile,
  }, info) => {
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await preferences(context, locale, theme);
        await page.setViewportSize({
          width: isMobile ? 390 : 1440,
          height: 1000,
        });
        await page.goto("/tournaments/polish-empty-test");
        const crumb = page.locator(".event-identity a").first();
        const action = page.locator(".event-identity a").last();
        for (const link of [crumb, action]) {
          await expect(link).toHaveCSS("text-decoration-line", "none");
          await link.focus();
          await expect(link).toHaveCSS("text-decoration-line", "underline");
          await link.blur();
        }
        await page.screenshot({
          path: info.outputPath(
            `links-${locale}-${theme}-${isMobile ? 390 : 1440}.png`,
          ),
          fullPage: true,
          animations: "disabled",
        });
      }
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await preferences(context, locale, theme);
        for (const width of isMobile ? [320, 390] : [1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto("/privacy");
          const contact = page.locator(
            'a[href="https://osu.ppy.sh/users/60001"]',
          );
          await expect(contact).toHaveCSS("text-decoration-line", "underline");
          await expect(contact).not.toHaveClass(/button/);
          await expect(contact).toHaveCount(1);
          await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
          expect(
            (await page.content()).includes("private-contact@example.test"),
          ).toBe(false);
          await expect(page.locator("main")).not.toContainText(
            "the designated osu! contact",
          );
          await expect(page.locator("main details")).toHaveCount(0);
          await noOverflow(page);
          expect(
            (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
          await page.screenshot({
            path: info.outputPath(`privacy-${locale}-${theme}-${width}.png`),
            fullPage: true,
          });
          await page.goto("/about");
          const aboutContact = page.locator(
            '.organizer-contact a[href="https://osu.ppy.sh/users/60001"]',
          );
          await expect(aboutContact).toHaveText(
            locale === "en"
              ? "Contact OCLR Admin on osu!"
              : locale === "zh-Hans"
                ? "通过 osu! 联系 OCLR 管理员"
                : "透過 osu! 聯絡 OCLR 管理員",
          );
        }
      }
  });

  test("localizes all News kinds and generated copy without changing source names", async ({
    page,
    context,
    isMobile,
  }, info) => {
    for (const [locale, labels, summary, prefix] of [
      [
        "en",
        [
          "Announcement",
          "Schedule",
          "Registration",
          "Mappool",
          "Fixture",
          "Result",
          "Scheduled",
        ],
        "test for 1 is published",
        "Scheduled for",
      ],
      [
        "zh-Hans",
        ["公告", "赛程", "报名", "图池", "对局", "赛果", "预告"],
        "轮次「1」的图池「test」已发布",
        "预定时间：",
      ],
      [
        "zh-Hant",
        ["公告", "賽程", "報名", "圖池", "對局", "賽果", "預告"],
        "輪次「1」的圖池「test」已發布",
        "預定時間：",
      ],
    ] as const) {
      await preferences(context, locale, "light");
      await page.setViewportSize({
        width: isMobile ? 320 : 1440,
        height: 1000,
      });
      await page.goto("/news");
      for (const label of labels)
        await expect(
          page
            .locator(".news-kind")
            .filter({ hasText: new RegExp(`^${label}$`) })
            .first(),
        ).toBeVisible();
      expect(await page.locator(".news-kind").allTextContents()).not.toEqual(
        expect.arrayContaining(["MAPPOOL", "REGISTRATION"]),
      );
      const item = page
        .locator(".news-list article")
        .filter({ hasText: summary });
      await expect(item).toHaveCount(1);
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`news-${locale}-${isMobile ? 320 : 1440}.png`),
        fullPage: true,
      });
      await item.locator(".news-headline").click();
      await expect(page.locator(".page-heading")).toContainText(summary);
      expect(await page.title()).toContain("test");
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        new RegExp(summary),
      );
      await page.goto("/news");
      const future = page
        .locator(".news-list article")
        .filter({ hasText: "Future plan" });
      await future.locator(".news-headline").click();
      await expect(page.locator(".page-heading .eyebrow")).toContainText(
        prefix,
      );
      if (locale !== "en")
        await expect(page.locator(".page-heading .eyebrow")).not.toContainText(
          "Scheduled for",
        );
    }
  });
});
