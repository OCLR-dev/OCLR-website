import { test, expect } from "@playwright/test";

for (const sort of ["stars", "title"]) {
  test(`compact view preserves ${sort} order and detail navigation`, async ({
    page,
  }) => {
    await page.route("https://assets.ppy.sh/**", (route) => route.abort());
    await page.goto("/mappool-sort");
    const sorting = page.getByRole("combobox", { name: "Sort Exhibition 1" });
    await sorting.selectOption(sort);
    const expected = [
      "map-entry-0-1",
      "map-entry-0-3",
      "map-entry-0-2",
      "map-entry-0-0",
    ];
    await expect(page.locator(".map-browse-card")).toHaveCount(4);
    expect(
      await page
        .locator(".map-browse-card")
        .evaluateAll((nodes) => nodes.map((n) => n.id)),
    ).toEqual(expected);
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    expect(
      await page
        .locator("tbody tr")
        .evaluateAll((nodes) => nodes.map((n) => n.id)),
    ).toEqual(expected);
    await page.locator("tbody tr").first().getByRole("button").first().click();
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
      "Alpha",
    );
    await page.getByRole("button", { name: "Next map", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
      "Beta",
    );
    await page.getByRole("button", { name: "Close map details" }).click();
    const ids = await page
      .locator("[id]")
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
    await sorting.selectOption("slot");
    expect(
      await page
        .locator("tbody tr")
        .evaluateAll((nodes) => nodes.map((n) => n.id)),
    ).toEqual([
      "map-entry-0-0",
      "map-entry-0-1",
      "map-entry-0-2",
      "map-entry-0-3",
    ]);
    await sorting.selectOption(sort);
    await page.getByRole("tab", { name: "NM", exact: true }).click();
    expect(
      await page
        .locator("tbody tr")
        .evaluateAll((nodes) => nodes.map((n) => n.id)),
    ).toEqual(["map-entry-0-1", "map-entry-0-0"]);
    await page.getByRole("searchbox").fill("Zeta");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toHaveAttribute(
      "id",
      "map-entry-0-0",
    );
  });
}

test("modded SR updates compact order and FM restrictions remain visible", async ({
  page,
}) => {
  await page.route("https://assets.ppy.sh/**", (route) => route.abort());
  await page.goto("/mappool-sort?fm");
  await page
    .getByRole("combobox", { name: "Sort Exhibition 1" })
    .selectOption("stars");
  await page
    .getByRole("button", { name: "Compact table", exact: true })
    .click();
  await expect(page.locator("tbody tr").first()).toHaveAttribute(
    "id",
    "map-entry-0-1",
  );
  await page.getByRole("switch").check();
  await expect(page.locator("tbody tr").first()).toHaveAttribute(
    "id",
    "map-entry-0-3",
  );
  await expect(page.locator(".mappool-fm-note")).toContainText(
    "Synthetic restriction: HD or HR",
  );
  await page.getByRole("switch").uncheck();
  await expect(page.locator("tbody tr").first()).toHaveAttribute(
    "id",
    "map-entry-0-1",
  );
});
