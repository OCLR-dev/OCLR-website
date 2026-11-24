import { expect, test } from "@playwright/test";

for (const reset of [false, true]) {
  test(`MRA changes direction on the first click after ${reset ? "resetting another sort" : "opening the leaderboard"}`, async ({
    page,
  }) => {
    await page.route("**/api/osu-images/avatar/*", (route) => route.abort());
    await page.goto("/player-leaderboard");
    const cards = page.locator('[aria-label^="#"]');
    const mra = page
      .getByRole("toolbar")
      .getByRole("button", { name: "MRA v4", exact: true });
    const pp = page
      .getByRole("toolbar")
      .getByRole("button", { name: "pp", exact: true });
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toHaveAttribute("aria-label", "#1 Synthetic 3");
    if (reset) {
      await pp.click();
      await pp.click();
      await expect(cards.first()).toHaveAttribute(
        "aria-label",
        "#3 Synthetic 1",
      );
      await pp.click();
      await expect(mra).toHaveAttribute("aria-pressed", "true");
      await expect(cards.first()).toHaveAttribute(
        "aria-label",
        "#1 Synthetic 3",
      );
    }
    await mra.click();
    await expect(cards.first()).toHaveAttribute("aria-label", "#3 Synthetic 1");
    await mra.click();
    await expect(cards.first()).toHaveAttribute("aria-label", "#1 Synthetic 3");
    // Selecting MRA from a different active column still starts descending.
    await pp.click();
    await pp.click();
    await expect(cards.first()).toHaveAttribute("aria-label", "#3 Synthetic 1");
    await mra.click();
    await expect(cards.first()).toHaveAttribute("aria-label", "#1 Synthetic 3");
    await mra.focus();
    await page.keyboard.press("Enter");
    await expect(cards.first()).toHaveAttribute("aria-label", "#3 Synthetic 1");
  });
}
