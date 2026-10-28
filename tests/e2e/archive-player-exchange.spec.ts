import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { editionRevisions, historicalStatistics } from "../../src/db/schema";
import {
  publicArchiveStatistics,
  statisticsArchiveKey,
} from "../../src/lib/archive-statistics";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import {
  exchangeArchive,
  exchangeSource,
  exchangeExclusions,
} from "../fixtures/archive-player-exchange";
import { seedSession } from "./session";

test.describe("confirmed historical player exchange", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("confirms an exchange while preserving a guest-visible statistics release", async ({
    page,
    context,
    isMobile,
  }, info) => {
    await context.addCookies([
      await seedSession(isMobile ? 70001 : 60001),
      { name: "oclr-theme", value: "light", domain: "127.0.0.1", path: "/" },
    ]);
    await db()
      .delete(historicalStatistics)
      .where(eq(historicalStatistics.editionSlug, "s6"));
    await db()
      .delete(editionRevisions)
      .where(eq(editionRevisions.editionSlug, "s6"));
    const archive = exchangeArchive();
    await seedEditions([
      {
        ...edition,
        slug: "s6",
        name: "Synthetic S6 exchange",
        status: "completed",
        registration: null,
        published: true,
        archive,
      },
    ]);
    const snapshot = {
      archiveKey: statisticsArchiveKey(archive),
      source: exchangeSource(),
      poolId: "final",
      included: [1, 2],
      excludedScores: exchangeExclusions,
    };
    const publishedAt = new Date("2020-01-03T00:00:00Z");
    await db().insert(historicalStatistics).values({
      editionSlug: "s6",
      fixtureId: "one",
      mpId: 999177,
      draft: snapshot,
      published: snapshot,
      version: 3,
      publishedAt,
    });
    const before = await publicArchiveStatistics("s6");
    await page.goto("/admin/tournaments/s6/archive");
    await page
      .locator("summary")
      .filter({ hasText: "Exchange historical players" })
      .click();
    const form = page.locator("details").filter({
      has: page.getByRole("button", {
        name: "Exchange historical players",
        exact: true,
      }),
    });
    await expect(
      form.getByLabel("Second player", { exact: true }),
    ).toBeDisabled();
    await expect(
      form.getByRole("button", {
        name: "Exchange historical players",
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await form.getByLabel("First player").locator("option").allTextContents(),
    ).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Historical Captain")]),
    );
    await form
      .getByLabel("First player", { exact: true })
      .selectOption("91991");
    expect(
      await form
        .getByLabel("Second player")
        .locator("option")
        .allTextContents(),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("Synthetic Exchange Alpha"),
      ]),
    );
    await form
      .getByLabel("Second player", { exact: true })
      .selectOption("91992");
    await form
      .getByLabel("Identity confirmation source", { exact: true })
      .fill("Synthetic organizer confirmation; date unknown");
    await form
      .getByRole("button", { name: "Exchange historical players", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Exchange historical players",
      exact: true,
    });
    await expect(dialog).toContainText(
      "Synthetic Exchange Alpha · 91991: Synthetic Alpha → Synthetic Beta",
    );
    await expect(dialog).toContainText(
      "Synthetic Exchange Beta · 91992: Synthetic Beta → Synthetic Alpha",
    );
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
      ]);
      // Apply preference through a normal reload and re-open the unsaved confirmation.
      if (theme === "dark") {
        await dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await page.reload();
        await page
          .locator("summary")
          .filter({ hasText: "Exchange historical players" })
          .click();
        await form
          .getByLabel("First player", { exact: true })
          .selectOption("91991");
        await form
          .getByLabel("Second player", { exact: true })
          .selectOption("91992");
        await form
          .getByLabel("Identity confirmation source", { exact: true })
          .fill("Synthetic organizer confirmation; date unknown");
        await form
          .getByRole("button", {
            name: "Exchange historical players",
            exact: true,
          })
          .click();
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(isMobile ? 390 : 1440);
      await dialog.getByRole("button", { name: "Confirm", exact: true }).focus();
      await page.screenshot({
        path: info.outputPath(`exchange-confirm-${theme}.png`),
        fullPage: false,
      });
    }
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const after = await publicArchiveStatistics("s6");
    expect(after.plays).toEqual(before.plays);
    expect(after.fixtures).toEqual(before.fixtures);
    expect(after.publishedAt).toBe(before.publishedAt);
    const [saved] = await db()
      .select()
      .from(historicalStatistics)
      .where(eq(historicalStatistics.editionSlug, "s6"));
    expect(saved.published).toEqual({
      ...snapshot,
      archiveKey: after.archiveKey,
    });
    expect(saved.publishedAt).toEqual(publishedAt);
    expect(saved.version).toBe(4);
    const guest = await context
      .browser()!
      .newContext({ storageState: { cookies: [], origins: [] } });
    await guest.addCookies([
      { name: "oclr-locale", value: "en", domain: "127.0.0.1", path: "/" },
    ]);
    const guestPage = await guest.newPage();
    await guestPage.goto(
      new URL("/tournaments/s6/statistics", page.url()).href,
    );
    await expect(
      guestPage.locator(".statistics-summary strong").first(),
    ).toHaveText("1 / 1");
    await expect(guestPage.locator(".event-table tbody tr")).toHaveCount(4);
    await expect(
      guestPage.getByText("Synthetic organizer confirmation; date unknown", {
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (
        await guest.request.get(
          new URL("/api/admin/tournaments/s6", page.url()).href,
        )
      ).status(),
    ).toBe(401);
    await guestPage.screenshot({
      path: info.outputPath("exchange-public-statistics.png"),
      fullPage: true,
    });
    await guest.close();
  });
});
