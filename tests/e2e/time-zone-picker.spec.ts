import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeDb } from "../../src/db";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { seedSession } from "./session";
import { captureResponsiveLayout } from "./responsive";
import { selectTimeZone } from "./time-zone";
test.describe("shared city and IANA time zone selection", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("searches without typing IDs, preserves aliases, rejects unknown text and supports keyboard/mobile", async ({
    page,
    context,
    isMobile,
  }, info) => {
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    const slug = `picker-${isMobile ? "mobile" : "desktop"}-${randomUUID().slice(0, 8)}`;
    await seedEditions([{ ...edition, slug, timeZone: "US/Eastern" }]);
    const api = `/api/admin/tournaments/${slug}`;
    const current = async () => (await context.request.get(api)).json();
    const saveState = page.locator(".general-settings .settings-save");
    async function save() {
      await expect(
        saveState.getByText("Unsaved changes", { exact: true }),
      ).toBeVisible();
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith(api) &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Save general settings", exact: true })
        .click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByRole("status")).toContainText("saved");
      // The HTTP receipt precedes router.refresh and the keyed form remount.
      await expect(
        saveState.getByText("Saved settings", { exact: true }),
      ).toBeVisible();
    }

    await page.goto(`/admin/tournaments/${slug}/settings`);
    const options = page
      .getByRole("listbox", { name: "Time zones", exact: true })
      .getByRole("option");
    const trigger = page.getByRole("button", {
      name: "Time zone",
      exact: true,
    });
    await expect(trigger).toContainText("US/Eastern");
    // Saving other metadata must preserve an existing IANA alias literally.
    await page
      .getByLabel("Tournament name", { exact: true })
      .fill("Synthetic time zone editor");
    await save();
    expect((await current()).edition.timeZone).toBe("US/Eastern");
    const before = await current();
    await trigger.focus();
    await trigger.press("ArrowDown");
    const search = page.getByRole("combobox", {
      name: "Search time zones",
      exact: true,
    });
    await expect(search).toBeFocused();
    await search.fill("hong kong");
    await expect(options).toHaveCount(1);
    await expect(options).toHaveText("Hong Kong — Asia/Hong_Kong");
    await captureResponsiveLayout(page, info, "time-zone-search");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await search.press("Enter");
    await expect(trigger).toContainText("Asia/Hong_Kong");
    await expect(trigger).toBeFocused();
    expect((await current()).revision).toBe(before.revision); // Choosing is not saving.
    await trigger.click();
    await search.fill("invalid timezone");
    await search.press("Enter");
    await expect(options).toHaveCount(0);
    await expect(trigger).toContainText("Asia/Hong_Kong");
    await search.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(search).toHaveCount(0);
    await trigger.click();
    await search.fill("europe");
    await search.press("ArrowDown");
    await expect(search).toHaveAttribute(
      "aria-activedescendant",
      (await options.nth(1).getAttribute("id")) as string,
    );
    await search.press("ArrowUp");
    await expect(search).toHaveAttribute(
      "aria-activedescendant",
      (await options.first().getAttribute("id")) as string,
    );
    await search.press("Escape");
    await selectTimeZone(page, "America/New_York");
    await save();
    expect((await current()).edition.timeZone).toBe("America/New_York");
    await trigger.click();
    await options.filter({ hasText: /^UTC$/ }).click();
    await expect(trigger).toHaveText("UTC⌄");
    await save();
    expect((await current()).edition.timeZone).toBe("UTC");
  });
});
