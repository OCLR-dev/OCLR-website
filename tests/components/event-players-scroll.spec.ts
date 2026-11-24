import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/tournaments/synthetic/players/*/messages", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/osu-images/avatar/*", (route) => route.abort());
});

test("a shared range stays editable when its last digit is erased", async ({
  page,
}) => {
  await page.goto("/event-players?group=list&rankMin=7");
  const minimum = page.getByRole("textbox", {
    name: "Global rank minimum (number)",
  });
  const summary = page
    .locator("summary")
    .filter({ hasText: "Advanced filters" });
  await minimum.press("End");
  await page.keyboard.press("Backspace");
  await expect(minimum).toBeFocused();
  await expect(page).not.toHaveURL(/rankMin=/);
  await page.keyboard.type("42");
  await expect(minimum).toHaveValue("42");
  await expect(
    page.getByRole("status").filter({ hasText: "64 / 105 Players" }),
  ).toBeVisible();
  await page.goBack();
  await expect(minimum).toHaveValue("4");
  await page.goForward();
  await expect(minimum).toHaveValue("42");
  await summary.press("Enter");
  await expect(minimum).toBeHidden();
  await summary.press("Enter");
  await expect(minimum).toBeVisible();
});

test("a shared range without season data stays available until focus leaves its fields", async ({
  page,
}) => {
  await page.goto("/event-players?unranked=1&rankMin=7");
  const minimum = page.getByRole("textbox", {
    name: "Global rank minimum (number)",
  });
  const maximum = page.getByRole("textbox", {
    name: "Global rank maximum (number)",
  });
  await minimum.press("End");
  await page.keyboard.press("Backspace");
  await expect(minimum).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(maximum).toBeFocused();
  await page.getByRole("searchbox", { name: "Search players" }).focus();
  await expect(minimum).toHaveCount(0);
});

test("a shared rank sort stays selected in a season without ranks", async ({
  page,
}) => {
  await page.goto("/event-players?unranked=1&group=list&sort=pp-desc");
  const sort = page.getByRole("combobox", { name: "Sort players" });
  const rankOptions = sort.locator('option[value^="rank-"]');
  const rows = page.locator(".event-player-row h3");
  await expect(sort).toHaveValue("rank-asc");
  await expect(rankOptions).toHaveCount(1);
  await expect(
    page.getByRole("list", { name: "Applied filters" }),
  ).toContainText("Global rank: best first");
  await expect(rows).toHaveText(["Subset Player 001", "Subset Player 002"]);

  await sort.selectOption("default");
  await expect(rankOptions).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Applied filters" })).toHaveCount(
    0,
  );
  await expect(rows).toHaveText(["Subset Player 002", "Subset Player 001"]);
  await page.goBack();
  await expect(sort).toHaveValue("rank-asc");
  await expect(rows).toHaveText(["Subset Player 001", "Subset Player 002"]);
});

test("scrolling appends successive batches and retains the existing player rows", async ({
  page,
}) => {
  await page.goto("/event-players?group=list");
  const rows = page.locator(".event-player-row");
  await expect(rows).toHaveCount(40);
  await rows.first().evaluate((row) => {
    row.dataset.retained = "yes";
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(80);
  await expect(rows.first()).toHaveAttribute("data-retained", "yes");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(105);
  await expect(
    page.getByRole("button", { name: "Show more players" }),
  ).toHaveCount(0);
  expect(new Set(await rows.locator("h3").allTextContents()).size).toBe(105);
  await page.getByRole("button", { name: "Team groups", exact: true }).click();
  await expect(rows).toHaveCount(40);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(80);
  await expect(
    page.getByRole("heading", { name: "Synthetic Team A", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Synthetic Team B", exact: true }),
  ).toHaveCount(1);
});

test("search and sorting reset the batch while applying to the complete directory", async ({
  page,
}) => {
  await page.goto("/event-players?group=list");
  const rows = page.locator(".event-player-row");
  await expect(rows).toHaveCount(40);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(80);
  await page.getByRole("searchbox", { name: "Search players" }).fill("Subset");
  await expect(rows).toHaveCount(40);
  await expect(
    page.getByRole("status").filter({ hasText: "65 / 105 Players" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Sort players" })
    .selectOption("name-desc");
  await expect(rows.first().locator("h3")).toHaveText("Subset Player 065");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(65);
  await expect(
    page.getByRole("button", { name: "Show more players" }),
  ).toHaveCount(0);
  const sort = page.getByRole("combobox", { name: "Sort players" });
  // selectOption also operates off-screen; bring the control into view as a
  // real interaction would before asserting that the visible batch resets.
  await sort.scrollIntoViewIfNeeded();
  await sort.selectOption("name-asc");
  await expect(rows).toHaveCount(40);
  await expect(rows.first().locator("h3")).toHaveText("Subset Player 001");
});

test("the manual button still appends players using the keyboard when automatic observation does not fire", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Observer = window.IntersectionObserver;
    window.IntersectionObserver = class extends Observer {
      observe(target: Element) {
        if (!target.classList.contains("event-player-more"))
          super.observe(target);
      }
    };
  });
  await page.goto("/event-players?group=list");
  const rows = page.locator(".event-player-row");
  const more = page.getByRole("button", { name: "Show more players" });
  await expect(rows).toHaveCount(40);
  await more.focus();
  await more.press("Enter");
  await expect(rows).toHaveCount(80);
  await expect(more).toBeFocused();
  await more.press("Enter");
  await expect(rows).toHaveCount(105);
  await expect(more).toHaveCount(0);
});

test("preview continues to show every synthetic player at once", async ({
  page,
}) => {
  await page.goto("/event-players?preview&group=list");
  await expect(page.locator(".event-player-row")).toHaveCount(105);
  await expect(
    page.getByRole("button", { name: "Show more players" }),
  ).toHaveCount(0);
});
