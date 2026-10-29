import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  test(`notes remain visible in separate boxes (${theme})`, async ({
    page,
  }) => {
    await page.goto("/info-note");
    await page
      .locator("html")
      .evaluate((el, value) => el.setAttribute("data-theme", value), theme);
    await expect(page.getByText("Supplementary explanation")).toBeVisible();
    await expect(page.getByText("Coverage details")).toBeVisible();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Notes", exact: true }),
    ).toHaveCount(0);
    for (const note of await page.getByRole("note").all()) {
      const box = await note.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    }
  });
}
