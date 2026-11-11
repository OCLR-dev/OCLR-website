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

test("checks history before adding and confirms candidate deletion", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/mappool-workbench*",
    async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        writes.push(request.postDataJSON());
        await route.fulfill({ json: { added: 0, skipped: 0 } });
        return;
      }
      expect(new URL(request.url()).searchParams.get("beatmap")).toBe("75");
      await route.fulfill({ json: { beatmapId: 75, matches: [] } });
    },
  );
  await page.goto("/workbench-compact?locale=en");
  const search = page.getByRole("search", { name: "Historical mappool usage" });
  await search.getByRole("searchbox").fill("https://osu.ppy.sh/beatmaps/75");
  await search.getByRole("button", { name: "Check history" }).click();
  const history = page.getByRole("dialog", {
    name: "Historical mappool usage",
  });
  await expect(history.getByText("No historical records found.")).toBeVisible();
  await history.getByRole("button", { name: "Close" }).click();
  expect(writes).toEqual([]);

  const candidate = page.getByRole("article", { name: "BID 5722291" });
  await candidate.getByRole("button", { name: "Delete candidate" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete candidate" });
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(candidate).toBeVisible();
  expect(writes).toEqual([]);
  await candidate.getByRole("button", { name: "Delete candidate" }).click();
  await confirmation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(candidate).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Refresh list" }),
  ).toBeFocused();
  expect(writes).toEqual([
    {
      action: "delete",
      candidateId: "candidate-1",
      confirmed: true,
      expectedCategory: "unassigned",
      expectedCommentCount: 0,
    },
  ]);
});

test("skillset dialog keeps drafts local and submits a versioned multi-selection", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/mappool-workbench",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({
        status: 400,
        json: { error: "Enter a valid selection workbench change." },
      });
    },
  );
  await page.goto("/workbench-compact?locale=en");
  const row = page.getByRole("article", { name: "BID 5722291", exact: true });
  const edit = row.getByRole("button", { name: "Edit tags", exact: true });
  await edit.click();
  const dialog = page.getByRole("dialog", {
    name: "Edit skillset tags",
    exact: true,
  });
  await expect(dialog.getByRole("button", { pressed: true })).toHaveCount(2);
  await dialog.getByRole("button", { name: "Stream", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
  expect(writes).toHaveLength(0);
  await edit.click();
  await expect(
    dialog.getByRole("button", { name: "Stream", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  const clear = dialog
    .locator("footer")
    .getByRole("button", { name: "Clear selection", exact: true });
  await expect(clear).toHaveText("");
  await expect(clear).toHaveAttribute("title", "Clear selection");
  await expect(clear.locator("svg")).toHaveCount(1);
  await clear.click();
  await expect(clear).toBeDisabled();
  await expect(dialog.getByRole("button", { pressed: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await edit.click();
  await dialog.getByRole("button", { name: "Stream", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply tags", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(writes).toEqual([
    {
      action: "skillsets",
      candidateId: "candidate-1",
      tags: ["jump", "stream", "tech"],
      expectedVersion: 1,
    },
  ]);
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
      const listHeading = page.locator("#candidate-list-heading");
      const listRefresh = listHeading
        .locator("..")
        .getByRole("button", { name: "重新整理列表", exact: true });
      await expect(listRefresh).toHaveText("");
      await expect(listRefresh).toHaveAttribute("title", "重新整理列表");
      await expect(listRefresh.locator("svg")).toHaveCount(1);
      const titleBounds = (await listHeading.boundingBox())!;
      const refreshBounds = (await listRefresh.boundingBox())!;
      expect(refreshBounds.width).toBe(44);
      expect(refreshBounds.height).toBe(44);
      expect(refreshBounds.x).toBeGreaterThan(
        titleBounds.x + titleBounds.width,
      );
      expect(
        Math.abs(
          titleBounds.y +
            titleBounds.height / 2 -
            refreshBounds.y -
            refreshBounds.height / 2,
        ),
      ).toBeLessThan(2);
      const row = page.getByRole("article", {
        name: "BID 5722291",
        exact: true,
      });
      await row.scrollIntoViewIfNeeded();
      const card = row.locator(".map-browse-card--band");
      await expect(card.locator("img, .beatmap-cover")).toHaveCount(0);
      await expect(card.locator(".map-card-art")).toHaveCSS(
        "background-image",
        /12345/,
      );
      const header = card.locator(".map-card-cover");
      const mod = header.getByRole("combobox", {
        name: "模組類別",
        exact: true,
      });
      const bid = header.getByRole("button", {
        name: "複製譜面 ID: 5722291",
        exact: true,
      });
      await expect(mod).toBeVisible();
      await expect(bid).toBeVisible();
      const modBox = (await mod.boundingBox())!;
      const bidBox = (await bid.boundingBox())!;
      expect(
        Math.abs(modBox.y + modBox.height / 2 - bidBox.y - bidBox.height / 2),
      ).toBeLessThan(2);
      expect(bidBox.x).toBeGreaterThan(modBox.x + modBox.width);
      const titleBox = (await card.locator(".map-card-title").boundingBox())!;
      expect(titleBox.width).toBeGreaterThan(40);
      expect(titleBox.x).toBeGreaterThan(bidBox.x + bidBox.width);
      expect(
        Math.abs(
          titleBox.y + titleBox.height / 2 - modBox.y - modBox.height / 2,
        ),
      ).toBeLessThan(2);
      const discussion = row.getByRole("region", {
        name: "評論（0）",
        exact: true,
      });
      await expect(
        discussion.getByText("尚無評論。", { exact: true }),
      ).toBeVisible();
      const mapBox = (await card.boundingBox())!;
      const commentBox = (await discussion.boundingBox())!;
      const tags = row.getByRole("region", {
        name: "Skillset Tags",
        exact: true,
      });
      const tagsBox = (await tags.boundingBox())!;
      const rowBox = (await row.boundingBox())!;
      if (rowBox.width >= 832) {
        expect(Math.abs(tagsBox.y - mapBox.y)).toBeLessThan(2);
        expect(Math.abs(commentBox.y - mapBox.y)).toBeLessThan(2);
        expect(tagsBox.x).toBeGreaterThan(mapBox.x + mapBox.width);
        expect(commentBox.x).toBeGreaterThan(tagsBox.x + tagsBox.width);
        for (const panel of [tags, discussion]) {
          await expect(panel).toHaveCSS("border-top-width", "0px");
          await expect(panel).toHaveCSS("border-inline-start-width", "1px");
        }
      } else {
        expect(tagsBox.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height);
        expect(commentBox.y).toBeGreaterThan(tagsBox.y + tagsBox.height);
        await expect(discussion).toHaveCSS("border-top-width", "1px");
      }
      expect(mapBox.height).toBeLessThan(350);
      const composer = discussion.getByRole("textbox", {
        name: "你的評論",
        exact: true,
      });
      await expect(composer).toBeVisible();
      const compactHeight = (await composer.boundingBox())!.height;
      expect(compactHeight).toBeLessThanOrEqual(50);
      await composer.fill("Long feedback line\n".repeat(12));
      await expect
        .poll(async () => (await composer.boundingBox())!.height)
        .toBeGreaterThan(compactHeight);
      expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(130);
      await composer.fill("Synthetic unsaved comment");
      await expect
        .poll(async () => (await composer.boundingBox())!.height)
        .toBeLessThanOrEqual(50);
      const sendBox = (await discussion
        .getByRole("button", { name: "發表評論", exact: true })
        .boundingBox())!;
      const inputBox = (await composer.boundingBox())!;
      expect(Math.abs(sendBox.y - inputBox.y)).toBeLessThan(2);
      expect(sendBox.x).toBeGreaterThan(inputBox.x + inputBox.width);
      expect(commentBox.height).toBeLessThan(230);
      await expect(
        discussion.getByRole("button", { name: "發表評論", exact: true }),
      ).toBeEnabled();
      const heading = (await discussion.getByRole("heading").boundingBox())!;
      const refreshButton = discussion.getByRole("button", {
        name: "重新整理評論",
        exact: true,
      });
      await expect(refreshButton).toHaveAttribute("title", "重新整理評論");
      await expect(refreshButton).toHaveText("");
      await expect(refreshButton.locator("svg")).toHaveCount(1);
      const refresh = (await refreshButton.boundingBox())!;
      expect(refresh.width).toBe(44);
      expect(refresh.height).toBe(44);
      expect(refresh.x).toBeGreaterThan(heading.x + heading.width);
      expect(
        Math.abs(
          heading.y + heading.height / 2 - refresh.y - refresh.height / 2,
        ),
      ).toBeLessThan(2);
      const values = card.locator(".map-card-values");
      const actionRow = card.locator(".map-card-action-row");
      const roundSummary = actionRow.locator(":scope > [role=group]");
      await expect(roundSummary).toHaveAccessibleName("指定輪次");
      await expect(roundSummary).toContainText("Grand Final");
      const summaryBox = (await roundSummary.boundingBox())!;
      const valuesBox = (await values.boundingBox())!;
      expect(summaryBox.y).toBeGreaterThanOrEqual(
        valuesBox.y + valuesBox.height,
      );
      await expect(values.locator(".beatmap-actions")).toHaveCount(0);
      const toolbar = actionRow.locator(".beatmap-actions");
      const toolbarBox = (await toolbar.boundingBox())!;
      const actionRowBox = (await actionRow.boundingBox())!;
      if (actionRowBox.width >= summaryBox.width + toolbarBox.width + 32) {
        expect(toolbarBox.x).toBeGreaterThanOrEqual(
          summaryBox.x + summaryBox.width,
        );
        expect(
          Math.abs(
            toolbarBox.y +
              toolbarBox.height / 2 -
              summaryBox.y -
              summaryBox.height / 2,
          ),
        ).toBeLessThan(2);
      } else {
        expect(toolbarBox.y).toBeGreaterThanOrEqual(summaryBox.y);
      }
      const controls = toolbar.locator("button:visible, a.button:visible");
      await expect(controls).toHaveCount(6);
      await expect(
        toolbar.locator('a[href^="https://osu.ppy.sh/"]'),
      ).toHaveCount(0);
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
        const touch = await page.evaluate(
          () => matchMedia("(pointer: coarse)").matches,
        );
        expect(box.width).toBe(touch ? 44 : 32);
        expect(box.height).toBe(touch ? 44 : 32);
        await expect(control.locator("svg")).toHaveCSS("width", "16px");
        expect(box.x).toBeGreaterThanOrEqual(mapBox.x);
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
  let count = 8;
  await page.route("**/api/**/comments", (route) =>
    route.fulfill({
      json: Array.from({ length: count }, (_, index) => ({
        id: `comment-${index}`,
        authorId: 1,
        authorName: "Synthetic Pooler",
        body:
          count === 1
            ? "Short feedback."
            : "Synthetic feedback with a long phrase. ".repeat(5),
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
  for (const name of ["Edit", "Delete"]) {
    const action = first.getByRole("button", { name, exact: true });
    await expect(action).toHaveText("");
    await expect(action).toHaveAttribute("title", name);
    await expect(action.locator("svg")).toHaveCount(1);
  }
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
  await expect(
    first.getByRole("button", { name: "Delete", exact: true }),
  ).toBeFocused();
  count = 1;
  await discussion
    .getByRole("button", { name: "Refresh comments", exact: true })
    .click();
  const single = row.getByRole("region", { name: "Comments (1)", exact: true });
  await expect(
    single.getByText("Short feedback.", { exact: true }),
  ).toBeVisible();
  expect((await single.boundingBox())!.height).toBeLessThan(250);
  await expect(
    single.getByRole("textbox", { name: "Your comment", exact: true }),
  ).toHaveValue("Preserved comment draft");
  await single.screenshot({
    path: test.info().outputPath("single-comment.png"),
  });
});
