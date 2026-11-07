import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://assets.ppy.sh/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180"><rect width="400" height="180" fill="#6b417f"/></svg>',
    }),
  );
});

test("mirror dropdown fits the compact list and Escape dismisses it inside Details", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile";
  const width = mobile ? 320 : 1280;
  await page.setViewportSize({ width, height: 700 });
  await page.goto(
    `/public-mappools?archive&early-season=s2&pool=captain-qualifier&theme=${mobile ? "dark" : "light"}`,
  );
  const row = page.locator("#map-NM2");
  const mirror = row.getByRole("button", { name: "Download mirror · NM2" });
  await expect(mirror).toBeVisible();

  await page.locator(".map-view-control button").nth(1).click();
  await mirror.click();
  const menu = row.locator("[popover]");
  await expect(menu.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect
    .poll(async () => (await menu.boundingBox())?.x)
    .toBeGreaterThan(0);
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThan(width);
  await page.getByRole("searchbox").click();
  await expect(menu).toBeHidden();

  await row.locator(".map-open-button").click();
  const details = page.getByRole("dialog");
  const detailsMirror = details.getByRole("button", {
    name: "Download mirror",
  });
  await detailsMirror.focus();
  await page.keyboard.press("Enter");
  const savedLink = details.getByRole("link", { name: "GitHub" });
  await expect(savedLink).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(savedLink).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(savedLink).toBeHidden();
  await expect(details).toBeVisible();
  await expect(detailsMirror).toBeFocused();
});

for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
  for (const theme of ["light", "dark"]) {
    test(`one pool, S10 cards and keyboard tabs (${locale}, ${theme})`, async ({
      page,
    }, info) => {
      await page.setViewportSize({
        width: info.project.name === "mobile" ? 320 : 1280,
        height: 900,
      });
      const writes: string[] = [];
      page.on("request", (request) => {
        if (!["GET", "HEAD"].includes(request.method()))
          writes.push(request.method());
      });
      await page.goto(`/public-mappools?locale=${locale}&theme=${theme}`);
      const pools = page.getByRole("tablist").first();
      await expect(page.locator(".map-browse-card")).toHaveCount(6);
      await expect(page.locator("#map-entry-1-0")).toHaveCount(0);
      const first = pools.getByRole("tab").first();
      const second = pools.getByRole("tab").nth(1);
      await first.focus();
      await page.keyboard.press("ArrowRight");
      await expect(second).toBeFocused();
      await expect(second).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#map-entry-1-0")).toBeVisible();
      await expect(page.locator("#map-entry-0-0")).toHaveCount(0);
      await page.keyboard.press("Home");
      await expect(first).toBeFocused();
      const mods = page.getByRole("tablist").nth(1);
      await mods.getByRole("tab", { name: "HD", exact: true }).click();
      await expect(page.locator(".map-browse-card")).toHaveCount(1);
      await page.getByRole("searchbox").fill("does not exist");
      await expect(page.locator(".map-browse-card")).toHaveCount(0);
      await page.getByRole("searchbox").fill("");
      await mods.getByRole("tab", { name: "DT", exact: true }).click();
      await mods.getByRole("tab").first().click();
      const opener = page.locator(".map-open-button").first();
      await opener.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.locator('a[href="https://osu.ppy.sh/beatmaps/880000"]'),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
      await expect(
        page.locator('a[href="/tournaments/synthetic/mappools/pool-1"]'),
      ).toBeVisible();
      const card = page.locator(".map-browse-card").first();
      const bounds = await card.evaluate((node) => {
        const cover = node
          .querySelector(".map-card-cover")!
          .getBoundingClientRect();
        const copy = node
          .querySelector(".map-card-copy")!
          .getBoundingClientRect();
        return {
          coverRight: cover.right,
          copyLeft: copy.left,
          coverTop: cover.top,
          coverBottom: cover.bottom,
          coverWidth: cover.width,
          coverHeight: cover.height,
          copyTop: copy.top,
        };
      });
      if (info.project.name === "mobile") {
        expect(bounds.copyTop).toBeGreaterThanOrEqual(bounds.coverBottom - 1);
        expect(bounds.coverWidth / bounds.coverHeight).toBeCloseTo(16 / 9, 1);
      } else {
        expect(bounds.copyLeft).toBeGreaterThanOrEqual(bounds.coverRight - 1);
        expect(bounds.copyTop).toBeCloseTo(bounds.coverTop, 0);
        expect(bounds.coverWidth).toBeGreaterThanOrEqual(200);
      }
      expect(
        await card.evaluate((node) =>
          parseFloat(getComputedStyle(node, "::before").width),
        ),
      ).toBe(20);
      await expect(card.locator(".map-card-mode")).toBeVisible();
      const toggle = page.getByRole("switch");
      await toggle.check();
      await page.getByRole("button", { name: "HR", exact: true }).click();
      await expect(toggle).toBeChecked();
      await expect(
        page.getByRole("button", { name: "HR", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({
        path: info.outputPath(`public-pool-${locale}-${theme}.png`),
        fullPage: true,
      });
      await toggle.uncheck();
      await page.locator(".map-view-control button").nth(1).click();
      await expect(page.locator(".mappool-sheet")).toHaveCount(5);
      await expect(page.locator(".mappool-base-sr").first()).toContainText(
        "6.50",
      );
      expect(writes).toEqual([]);
    });
  }
}

test("single pool and duplicate authored names retain context", async ({
  page,
}) => {
  await page.goto("/public-mappools?single");
  await expect(page.getByRole("tablist")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Exhibition 1", exact: true }),
  ).toBeVisible();
  await page.goto("/public-mappools?duplicates");
  const pools = page.getByRole("tablist").first();
  await expect(pools.getByRole("tab").first()).toContainText("Group round");
  await expect(pools.getByRole("tab").nth(1)).toContainText("Final round");
  await pools.getByRole("tab").nth(1).click();
  await expect(page.locator("#map-entry-1-0")).toBeVisible();
});

// Saved UI fixtures exercise selection consistency; provider math, failures and
// cache identity are covered in unit/integration tests without a locale matrix.
test("difficulty choices stay consistent across native/archive cards, tables and details", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 877,
    height: 819,
  });
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  for (const archive of [false, true]) {
    await page.goto(
      `/public-mappools?difficulty&appearance=skyline-pop&${archive ? "archive" : "detail"}`,
    );
    const toggle = page.getByRole("switch", {
      name: "Enable modded difficulty",
    });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();
    const dt = page.locator('.map-browse-card[data-category="DT"]');
    await expect(dt.locator(".map-card-star")).toContainText("7.12");
    await expect(dt.locator(".map-card-values")).toContainText("270");
    const fm = page.locator('.map-browse-card[data-category="FM"]');
    await expect(fm.locator(".map-card-star")).toContainText("5.7");
    const selector = page.getByRole("group", { name: "FM preview" });
    await expect(
      page.locator(".map-browse-settings").getByRole("switch"),
    ).toBeVisible();
    expect(
      (await page.locator(".map-browse-toolbar").boundingBox())!.y,
    ).toBeLessThan((await selector.boundingBox())!.y);
    await expect(selector.locator(".event-pills")).toHaveCount(0);
    const borders = await selector.getByRole("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const style = getComputedStyle(button);
        return {
          border: style.borderTopWidth,
          radius: style.borderTopLeftRadius,
        };
      }),
    );
    expect(
      borders.every(
        (style) => style.border === "1px" && style.radius === borders[0].radius,
      ),
    ).toBe(true);
    await expect(selector.getByRole("button")).toHaveText(["HD", "HR", "EZ"]);
    await expect(
      page.getByRole("combobox", { name: "FM preview" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Difficulty preview only.", { exact: false }),
    ).toHaveCount(0);
    await selector.getByRole("button", { name: "HR", exact: true }).click();
    await expect(
      selector.getByRole("button", { name: "HR", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const selectedColors = await selector
      .getByRole("button", { name: "HR", exact: true })
      .evaluate((button) => ({
        foreground: getComputedStyle(button).color,
        background: getComputedStyle(button).backgroundColor,
      }));
    const idleColors = await selector
      .getByRole("button", { name: "HD", exact: true })
      .evaluate((button) => ({
        foreground: getComputedStyle(button).color,
        background: getComputedStyle(button).backgroundColor,
      }));
    expect(selectedColors.background).not.toBe(idleColors.background);
    expect(selectedColors.foreground).not.toBe(selectedColors.background);
    await page.screenshot({
      path: info.outputPath(
        `difficulty-toolbar-${archive ? "archive" : "native"}.png`,
      ),
    });
    await expect(fm.locator(".map-card-star")).toContainText("6.8");
    await fm.locator(".map-open-button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("6.80 ★");
    await expect(dialog).toContainText("10 / 10 / 5.2 / 8.4");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    const row = page.locator(archive ? "#map-FM1" : "#map-entry-0-4");
    await expect(row).toContainText("6.8");
    await selector.getByRole("button", { name: "EZ", exact: true }).click();
    await expect(row).toContainText("3.1");
    await row.locator(".map-open-button").click();
    await expect(dialog).toContainText("3.10 ★");
    await expect(dialog).not.toContainText("6.80 ★");
    await page.keyboard.press("Escape");
    await toggle.uncheck();
    await expect(row).toContainText("5.7");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(writes).toEqual([]);
});

test("missing official snapshots do not erase known native or recorded historical values", async ({
  page,
}) => {
  for (const archive of [false, true]) {
    await page.goto(
      `/public-mappools?difficulty&missing-variants&no-snapshot&${archive ? "archive" : "detail"}`,
    );
    const toggle = page.getByRole("switch", {
      name: "Enable modded difficulty",
    });
    await toggle.check();
    const dt = page.locator('.map-browse-card[data-category="DT"]');
    await expect(dt.locator(".map-card-values")).toContainText("270");
    await expect(dt.locator(".map-card-star")).toContainText(
      archive ? "8.8" : "—",
    );
    await expect(dt).toContainText(
      archive ? "Recorded historical values" : "Not calculated",
    );
    await dt.locator(".map-open-button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(archive ? "1:20" : "2:09");
    await page.keyboard.press("Escape");
    const selector = page.getByRole("group", { name: "FM preview" });
    for (const mod of ["HR", "EZ", "HD"]) {
      await selector.getByRole("button", { name: mod, exact: true }).click();
      const fm = page.locator('.map-browse-card[data-category="FM"]');
      await expect(fm.locator(".map-card-values")).toContainText(
        archive ? "270" : "180",
      );
      await expect(fm.locator(".map-card-star")).toContainText(
        archive ? "8.8" : "—",
      );
    }
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    const row = page.locator(archive ? "#map-DT1" : "#map-entry-0-3");
    await expect(row).toContainText("270");
    await toggle.uncheck();
    await expect(row).toContainText(archive ? "270" : "180");
  }
});

test("pool detail and historical cards retain season appearance boundaries", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
  for (const appearance of [
    "default",
    "skyline-pop",
    "glacier-blue",
    "sakura-circuit",
  ]) {
    for (const theme of ["light", "dark"]) {
      await page.goto(
        `/public-mappools?detail&appearance=${appearance}&theme=${theme}`,
      );
      await expect(page.locator(".map-browse-card")).toHaveCount(6);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.goto(
        `/public-mappools?archive&appearance=${appearance}&theme=${theme}`,
      );
      const card = page.locator(".map-browse-card");
      await expect(card).toHaveCount(1);
      expect(
        await card.evaluate((node) =>
          parseFloat(getComputedStyle(node, "::before").width),
        ),
      ).toBe(20);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      await card.locator(".map-open-button").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(card.locator(".map-open-button")).toBeFocused();
    }
  }
});

test("public cards match the S10 archive card geometry at each breakpoint", async ({
  page,
}, info) => {
  const widths = info.project.name === "mobile" ? [390, 320] : [1280, 680];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      for (const appearance of ["default", "skyline-pop"]) {
        const dimensions = [];
        for (const archive of [false, true]) {
          await page.goto(
            `/public-mappools?locale=zh-Hant&${archive ? "archive&" : ""}appearance=${appearance}&theme=${theme}`,
          );
          const card = page.locator(".map-browse-card").first();
          await expect(card).toBeVisible();
          dimensions.push(
            await card.evaluate((node) => {
              const style = getComputedStyle(node);
              const cover = node.querySelector(".map-card-cover")!;
              const copy = node.querySelector(".map-card-copy")!;
              const title = node.querySelector(".map-card-title")!;
              return {
                columns: style.gridTemplateColumns,
                padding: style.padding,
                minHeight: style.minHeight,
                radius: style.borderRadius,
                railWidth: getComputedStyle(node, "::before").width,
                railContent: getComputedStyle(node, "::before").content,
                coverWidth: cover.getBoundingClientRect().width,
                coverRadius: getComputedStyle(cover).borderRadius,
                imageAspect: getComputedStyle(
                  cover.querySelector(".beatmap-cover")!,
                ).aspectRatio,
                copyPadding: getComputedStyle(copy).padding,
                titleSize: getComputedStyle(title).fontSize,
                titleWhiteSpace: getComputedStyle(title).whiteSpace,
                artOpacity: getComputedStyle(
                  node.querySelector(".map-card-art")!,
                ).opacity,
                modePosition: getComputedStyle(
                  node.querySelector(".map-card-mode")!,
                ).position,
                actionPosition: getComputedStyle(
                  node.querySelector(".beatmap-actions")!,
                ).position,
              };
            }),
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
          if (!archive && appearance === "default" && theme === "light") {
            await page.screenshot({
              path: info.outputPath(`s11-s10-card-${width}.png`),
            });
          }
        }
        expect(dimensions[0], `${width}px ${theme} ${appearance}`).toEqual(
          dimensions[1],
        );
      }
    }
  }
});
