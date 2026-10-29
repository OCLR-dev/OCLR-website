import { test, expect } from "@playwright/test";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { seedSession } from "./session";
import { randomUUID } from "node:crypto";
import { closeDb } from "../../src/db";
import { mkdirSync } from "node:fs";

test.describe("competition times and overview synchronization #430", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(() => closeDb());
  test("saves zoned intervals, reloads and updates both public sections", async ({
    page,
    context,
    isMobile,
  }) => {
    const slug = `timeline-${isMobile ? "mobile" : "desktop"}-${randomUUID()}`;
    await seedEditions([
      {
        ...edition,
        slug,
        registration: {
          ...edition.registration!,
          closesAt: "2026-10-01T00:00:00Z",
          withdrawUntil: null,
        },
        schedule: [],
      },
    ]);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.goto(`/admin/tournaments/${slug}/settings?section=schedule`);
    await page.getByRole("tab", { name: "Milestones", exact: true }).click();
    await page
      .getByRole("button", { name: "Add milestone", exact: true })
      .click();
    await page.getByLabel("Milestone 1 label").fill("Synthetic group");
    await page.getByLabel("Phase type", { exact: true }).selectOption("group");
    await page
      .getByLabel("Start time: date", { exact: true })
      .fill("2027-02-01");
    await page
      .getByLabel("Start time: time (HH:mm)", { exact: true })
      .fill("20:00");
    await page.getByLabel("End time: date", { exact: true }).fill("2027-02-02");
    await page
      .getByLabel("End time: time (HH:mm)", { exact: true })
      .fill("22:00");
    await page
      .getByRole("button", { name: "Add milestone", exact: true })
      .click();
    await page.getByLabel("Milestone 2 label").fill("Synthetic knockout");
    await page
      .getByLabel("Phase type", { exact: true })
      .nth(1)
      .selectOption("knockout");
    await page
      .getByRole("button", { name: "Save milestones", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "milestones saved." }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Start time: time (HH:mm)", { exact: true }).first(),
    ).toHaveValue("20:00");
    await expect(
      page.getByLabel("End time: date", { exact: true }).first(),
    ).toHaveValue("2027-02-02");
    await page
      .getByRole("heading", { name: "Competition times and milestones" })
      .click();
    await page.evaluate(() => window.scrollTo(0, 0));
    mkdirSync("docs/verification/issue-430", { recursive: true });
    await page.screenshot({
      path: `docs/verification/issue-430/settings-${isMobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page.goto(`/tournaments/${slug}`);
    const rows = page.locator("#schedule tbody tr");
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: "Synthetic group" })).toContainText(
      "20:00",
    );
    await expect(rows.filter({ hasText: "Synthetic knockout" })).toContainText(
      "TBA",
    );
    await expect(
      page.locator("#stages li").filter({ hasText: "Synthetic group" }),
    ).toContainText("20:00");
    await expect(
      page.locator("#stages li").filter({ hasText: "Synthetic knockout" }),
    ).toContainText("TBA");
    await expect(page.locator("#stages [aria-current=step]")).toHaveCount(0);
    await page
      .locator("#stages li")
      .filter({ hasText: "Synthetic group" })
      .getByRole("link")
      .focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `docs/verification/issue-430/overview-${isMobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
          {
            name: "oclr-appearance",
            value: appearance,
            url: "http://127.0.0.1:3100",
          },
        ]);
        await page.reload();
        await expect(rows.filter({ hasText: "Synthetic group" })).toContainText(
          "20:00",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (appearance === "default" && theme === "dark")
          await page.screenshot({
            path: `docs/verification/issue-430/overview-dark-${isMobile ? "mobile" : "desktop"}.png`,
            fullPage: true,
          });
      }
    }
  });
});
