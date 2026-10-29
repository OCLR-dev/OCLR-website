import { expect, test } from "@playwright/test";
test("all six statistics views preserve identity and same-name team filters", async ({
  page,
}) => {
  await page.goto("/event-statistics");
  const rows = page.locator("tbody tr");
  const player = (id: number) =>
    rows.filter({
      has: page.locator(`a[href='/tournaments/synthetic/players/${id}']`),
    });
  await expect(rows).toHaveCount(2);
  await expect(player(11)).toContainText("90");
  await expect(player(22)).toContainText("50");
  await expect(
    page.getByText("Players with data").locator("..").locator("strong"),
  ).toHaveText("2");
  await page
    .getByRole("button", { name: "Mappool statistics", exact: true })
    .click();
  await expect(rows).toHaveCount(1);
  await expect(player(11)).toHaveCount(1);
  await expect(rows.locator("td").nth(10)).toHaveText("100"); // best team; never 150
  await page
    .getByRole("button", { name: "Individual leaderboard", exact: true })
    .click();
  await expect(rows).toHaveCount(3);
  await expect(player(11)).toHaveCount(2);
  await expect(player(22)).toHaveCount(1);
  await page
    .getByRole("button", { name: "Team leaderboard", exact: true })
    .click();
  await expect(player(22).locator("td").nth(7)).toHaveText("50");
  await page
    .getByRole("button", { name: "Team placements", exact: true })
    .click();
  await expect(rows).toHaveCount(2);
  await page
    .getByRole("button", { name: "Solo placements", exact: true })
    .click();
  await expect(rows).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption("Y");
  await expect(rows).toHaveCount(1);
  await expect(player(22)).toContainText("50");
  await expect(rows.locator("td").nth(2)).toHaveText("2"); // full comparison population
  await page
    .getByRole("button", { name: "Performance scores", exact: true })
    .click();
  await expect(rows).toHaveCount(1);
  await expect(player(22)).toContainText("50");
  await page
    .getByRole("button", { name: "Mappool statistics", exact: true })
    .click();
  await expect(player(22)).toHaveCount(1);
  await expect(rows.locator("td").nth(10)).toHaveText("50");
});

test("statistics notification opens below title and closes with Escape", async ({
  page,
}) => {
  await page.goto("/event-statistics");
  const trigger = page.getByRole("button", { name: "Notes", exact: true });
  const panel = page.getByRole("region", { name: "Notes", exact: true });
  await expect(panel).toBeHidden();
  const heading = await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .boundingBox();
  expect((await trigger.boundingBox())!.y).toBeGreaterThanOrEqual(
    heading!.y + heading!.height,
  );
  await trigger.click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Missing data is not zero");
  await panel.getByText("Match coverage", { exact: true }).click();
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});
