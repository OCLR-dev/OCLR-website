import { expect, test } from "@playwright/test";

test("statistics notification opens below heading and update round coverage", async ({
  page,
}) => {
  await page.goto("/statistics-explorer");
  const notes = page.getByRole("region", { name: "Notes", exact: true });
  await expect(notes).toContainText("Missing data is not zero");
  await expect(notes).toContainText(
    "Some matches include confirmed technical adjudication",
  );
  await expect(page.locator(".statistics-summary")).not.toContainText(
    "Missing data",
  );
  await page.keyboard.press("Escape");
  await page.locator(".statistics-player").first().click();
  await expect(page.locator(".statistics-detail")).toBeVisible();
  const summary = notes.getByText("Match coverage", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(notes.locator(".statistics-coverage li")).toHaveCount(2);
  await expect(
    notes.getByRole("link", { name: "Synthetic Final · Final" }),
  ).toHaveAttribute("href", "/tournaments/synthetic/matches/one");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Semi", exact: true }).click();
  await expect(notes.locator(".statistics-coverage li")).toHaveCount(1);
  await expect(notes).toContainText("Not yet covered");
  await expect(notes).not.toContainText(
    "Some matches include confirmed technical adjudication",
  );
  const method = notes.getByText("Statistics calculation", { exact: true });
  await method.focus();
  await page.keyboard.press("Space");
  await expect(notes).toContainText("Forfeits without games are excluded.");
});
