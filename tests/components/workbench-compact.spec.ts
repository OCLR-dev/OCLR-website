import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**/comments", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/**/mappools", (route) =>
    route.fulfill({ json: { rounds: [], pools: [], entries: [] } }),
  );
  await page.route("https://assets.ppy.sh/**", (route) => route.abort());
});
for (const theme of ["light", "dark"]) {
  test(`compact map and visible comments (${theme})`, async ({
    page,
  }, info) => {
    const widths =
      info.project.name === "mobile" ? [390, 320] : [1440, 1024, 768];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/workbench-compact?theme=${theme}`);
      const row = page.getByRole("article", {
        name: "BID 5722291",
        exact: true,
      });
      await row.scrollIntoViewIfNeeded();
      const card = row.locator(".map-browse-card--band");
      const discussion = row.getByRole("region", {
        name: "評論（0）",
        exact: true,
      });
      await expect(
        discussion.getByText("尚無評論。", { exact: true }),
      ).toBeVisible();
      const mapBox = (await card.boundingBox())!;
      const commentBox = (await discussion.boundingBox())!;
      const rowBox = (await row.boundingBox())!;
      if (rowBox.width >= 896) {
        expect(commentBox.x).toBeGreaterThan(mapBox.x + mapBox.width);
        expect(commentBox.y).toBe(mapBox.y);
        expect(
          await discussion.evaluate(
            (el) => getComputedStyle(el).borderInlineStartWidth,
          ),
        ).toBe("1px");
        expect(rowBox.height).toBeLessThan(340);
      } else {
        expect(commentBox.y).toBeGreaterThan(mapBox.y + mapBox.height);
        expect(
          await discussion.evaluate(
            (el) => getComputedStyle(el).borderTopWidth,
          ),
        ).toBe("1px");
      }
      expect(mapBox.height).toBeLessThan(350);
      const composer = discussion.getByRole("textbox", {
        name: "你的評論",
        exact: true,
      });
      await expect(composer).toBeVisible();
      await composer.fill("Synthetic unsaved comment");
      await expect(
        discussion.getByRole("button", { name: "發表評論", exact: true }),
      ).toBeEnabled();
      const heading = (await discussion.getByRole("heading").boundingBox())!;
      const refresh = (await discussion
        .getByRole("button", { name: "重新整理評論", exact: true })
        .boundingBox())!;
      expect(
        Math.abs(
          heading.y + heading.height / 2 - refresh.y - refresh.height / 2,
        ),
      ).toBeLessThan(2);
      const toolbar = card.locator(".beatmap-actions");
      const controls = toolbar.locator("button, a.button");
      const rounds = toolbar.getByRole("button", { name: /^指定輪次:/ });
      const promotion = toolbar.getByRole("button", {
        name: "加入正式圖池",
        exact: true,
      });
      await expect(rounds).toBeVisible();
      await expect(promotion).toBeVisible();
      for (const control of await controls.all()) {
        if (!(await control.isVisible())) continue;
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(
          mapBox.x + mapBox.width + 1,
        );
      }
      const height = (await card.boundingBox())!.height;
      await rounds.click();
      const popup = page.locator("[popover]:popover-open");
      await expect(popup).toBeVisible();
      expect((await card.boundingBox())!.height).toBe(height);
      await page.keyboard.press("Escape");
      await expect(rounds).toBeFocused();
      await promotion.click();
      await expect(popup).toBeVisible();
      await expect(popup.getByRole("combobox").first()).toBeVisible();
      expect((await card.boundingBox())!.height).toBe(height);
      await page.keyboard.press("Escape");
      await expect(promotion).toBeFocused();
      await expect(composer).toHaveValue("Synthetic unsaved comment");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const violations = (
        await new AxeBuilder({ page })
          .include('article[aria-label="BID 5722291"]')
          .analyze()
      ).violations;
      expect(violations).toEqual([]);
      await row.screenshot({
        path: info.outputPath(`workbench-${theme}-${width}.png`),
      });
    }
    if (info.project.name === "desktop") {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/workbench-compact?theme=${theme}&narrow`);
      const row = page.getByRole("article", {
        name: "BID 5722291",
        exact: true,
      });
      const card = (await row.locator(".map-browse-card--band").boundingBox())!;
      const discussion = (await row
        .getByRole("region", { name: "評論（0）", exact: true })
        .boundingBox())!;
      expect(discussion.y).toBeGreaterThan(card.y + card.height);
    }
  });
}

test("populated comments scroll while the composer stays visible", async ({
  page,
}) => {
  await page.route("**/api/**/comments", (route) =>
    route.fulfill({
      json: Array.from({ length: 8 }, (_, index) => ({
        id: `comment-${index}`,
        authorId: 1,
        authorName: "Synthetic Pooler",
        body: "Synthetic feedback with a long phrase. ".repeat(5),
        version: "1",
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
    }),
  );
  await page.goto("/workbench-compact?locale=en");
  const row = page.getByRole("article", { name: "BID 5722291", exact: true });
  await row.scrollIntoViewIfNeeded();
  const discussion = row.getByRole("region", {
    name: "Comments (8)",
    exact: true,
  });
  const comments = discussion.getByRole("list", {
    name: "Comments (8)",
    exact: true,
  });
  await expect(comments.getByRole("listitem")).toHaveCount(8);
  expect(
    await comments.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  const composer = discussion.getByRole("textbox", {
    name: "Your comment",
    exact: true,
  });
  await composer.fill("Preserved comment draft");
  const first = comments.getByRole("listitem").first();
  await first.getByRole("button", { name: "Edit", exact: true }).click();
  await first
    .getByRole("textbox", { name: "Edit comment", exact: true })
    .fill("Unsaved edit");
  await first.getByRole("button", { name: "Cancel", exact: true }).click();
  await first.getByRole("button", { name: "Delete", exact: true }).click();
  await first
    .getByRole("group", { name: "Delete this comment?", exact: true })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(composer).toHaveValue("Preserved comment draft");
  await expect(
    discussion.getByRole("button", { name: "Post comment", exact: true }),
  ).toBeEnabled();
});
