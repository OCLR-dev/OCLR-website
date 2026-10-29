import { expect, test } from "@playwright/test";

test("S8 shows every recorded knockout match and appearance connector", async ({
  page,
}) => {
  await page.goto("/archive-bracket");
  await expect(page.locator("[data-match-id]")).toHaveCount(14);
  await expect(page.locator(".bracket-connectors path")).toHaveCount(16);
  for (const card of await page.locator("[data-match-id]").all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    expect(
      await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 2),
    ).toBe(true);
    await expect(
      card.getByRole("link", { name: "Match details" }),
    ).toBeVisible();
  }
  expect(
    await page.locator(".bracket-frame").evaluate((el) => {
      const svg = el.querySelector("svg")!;
      return (
        Number(svg.getAttribute("width")) >= el.scrollWidth &&
        Number(svg.getAttribute("height")) >= el.scrollHeight
      );
    }),
  ).toBe(true);
});
