import { expect, test } from "@playwright/test";

for (const outcome of ["success", "failure"] as const) {
  test(`late inherited stylesheet ${outcome} retains the current edition`, async ({
    page,
  }) => {
    let release!: () => void;
    await page.route("**/appearance-styles/skyline-pop.css", async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      if (outcome === "failure") await route.abort();
      else await route.continue();
    });
    await page.goto("/appearance-navigation");
    await page.getByRole("button", { name: "Navigate to a" }).click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.locator(".appearance-trigger").click();
    await page.locator('[data-appearance-option="site"]').click();
    await page.getByRole("button", { name: "Navigate to b" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "glacier-blue",
    );
    release();
    // The menu closes only once its pending selection has finished.
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "glacier-blue",
    );
    await expect(page.locator(".appearance-trigger")).toHaveAttribute(
      "title",
      /Glacier Blue/,
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(
      (await page.context().cookies()).find(
        (c) => c.name === "oclr-appearance",
      ),
    ).toBeUndefined();
  });
}
