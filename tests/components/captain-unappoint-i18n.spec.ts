import { expect, test } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import hans from "../../messages/zh-Hans.json" with { type: "json" };
import hant from "../../messages/zh-Hant.json" with { type: "json" };

for (const [locale, messages] of [
  ["en", en],
  ["zh-Hans", hans],
  ["zh-Hant", hant],
] as const) {
  for (const team of [false, true]) {
    test(`${locale}: unappoint confirmation ${team ? "with" : "without"} a team`, async ({
      page,
    }) => {
      let writes = 0;
      await page.route("**/api/admin/**", async (route) => {
        writes += 1;
        await route.fulfill({ json: {} });
      });
      await page.goto(
        `/captain-manager?unappoint&count=0&locale=${locale}${team ? "&team" : ""}`,
      );
      // The literal player identity is retained in all locales.
      await page
        .locator(".captain-card-actions")
        .getByRole("button")
        .last()
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const title = messages.ui.m20788d709bb0.replace(
        "{value0}",
        "Synthetic Captain",
      );
      const description = messages.ui.me60e7849e601
        .replace("{value0}", "Synthetic Captain")
        .replace("{value1}", team ? messages.ui.m8e8f79c1d2df : "");
      await expect(dialog.getByRole("heading")).toHaveText(title);
      await expect(
        dialog.getByText(description, { exact: true }),
      ).toBeVisible();
      if (!team)
        await expect(dialog).not.toContainText(
          messages.ui.m8e8f79c1d2df.trim(),
        );
      expect(writes).toBe(0);
    });
  }
}
