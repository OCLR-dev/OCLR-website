import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { editionState } from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { captureResponsiveLayout } from "./responsive";
import { projectPublicNews } from "../../src/lib/public-news-model";
test.describe("derived public content", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("Home and News reflect confirmed dates without publishing private plans or asserting completion", async ({
    page,
    context,
  }, info) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const published = {
      ...edition,
      season: "12",
      name: "Synthetic Season 12",
      rules: null,
      eligibility: null,
      schedule: [
        { label: "Captain draft", at: "2098-11-01T12:00:00Z" },
        { label: "Past planned final", at: "2026-01-01T12:00:00Z" },
      ],
    };
    const privateEdition = {
      ...published,
      slug: "private-plans",
      published: false,
      name: "PRIVATE_EDITION_NEWS",
      schedule: [{ label: "PRIVATE_SCHEDULE", at: "2026-10-01T12:00:00Z" }],
    };
    await seedEditions([published, privateEdition]);
    try {
      expect(
        (await context.cookies()).filter(
          (cookie) => !isAutomaticPreferenceCookie(cookie),
        ),
      ).toEqual([]);
      await page.goto("/tournaments/test-cup/rules");
      await expect(
        page.getByRole("heading", { name: "Rules to be announced" }),
      ).toBeVisible();
      await expect(
        page.getByText(/Registration remains unavailable|before applying/),
      ).toHaveCount(0);
      await page
        .getByRole("link", { name: "View registration", exact: false })
        .click();
      await expect(
        page.getByRole("heading", { name: "Sign in before applying" }),
      ).toBeVisible();
      await page.goto("/");
      await expect(page.locator(".home-information-link")).toHaveAttribute(
        "href",
        "/tournaments/test-cup",
      );
      await expect(page.locator(".home-registration-link")).toHaveAttribute(
        "href",
        "/tournaments/test-cup/register",
      );
      await expect(page.locator("main")).not.toContainText(
        "PRIVATE_EDITION_NEWS",
      );
      await captureResponsiveLayout(page, info, "home-entry-links");
      await page.goto("/news");
      await expect(page.locator(".news-list")).not.toContainText(/[→↗]/);
      await expect(page.locator(".news-list")).toContainText("(UTC+8)");
      await expect(page.locator(".news-list")).not.toContainText("Asia/Taipei");
      await captureResponsiveLayout(page, info, "news-headlines-list");
      await page
        .getByRole("link", {
          name: "Scheduled: Captain draft — Synthetic Season 12",
          exact: true,
        })
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Scheduled: Captain draft — Synthetic Season 12",
      );
      await expect(page.locator(".page-heading .eyebrow")).toContainText(
        "Scheduled for",
      );
      await expect(page.getByText(/plan, not confirmation/)).toBeVisible();
      await page
        .getByRole("link", { name: "View Synthetic Season 12", exact: true })
        .click();
      await expect(page).toHaveURL(/\/tournaments\/test-cup\/schedule$/);
      await page.goto("/news");
      await page
        .getByRole("link", { name: /Scheduled: Past planned final/ })
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Scheduled: Past planned final — Synthetic Season 12",
      );
      await expect(page.getByText(/plan, not confirmation/)).toBeVisible();
      const privateSlug = projectPublicNews(
        [
          {
            edition: { ...privateEdition, published: true },
            registrationPaused: false,
          },
        ],
        [],
        [],
        true,
      ).find((i) => i.kind === "schedule")!.slug;
      expect((await page.goto(`/news/${privateSlug}`))?.status()).toBe(404);
      await db()
        .update(editionState)
        .set({
          configuration: {
            ...published,
            schedule: [{ label: "Updated plan", at: "2098-12-02T12:00:00Z" }],
          },
        })
        .where(eq(editionState.slug, published.slug));
      await page.goto("/news");
      await expect(
        page.getByRole("link", { name: /Scheduled: Updated plan/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Scheduled: Captain draft/ }),
      ).toHaveCount(0);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath("automatic-news.png"),
        fullPage: true,
      });
      await db()
        .update(editionState)
        .set({ configuration: { ...published, published: false } })
        .where(eq(editionState.slug, published.slug));
      await page.goto("/");
      await expect(
        page.getByText("The next edition has not been announced yet."),
      ).toBeVisible();
      await page.goto("/news");
      await expect(
        page.getByText("Synthetic Season 12", { exact: false }),
      ).toHaveCount(0);
    } finally {
      await seedEditions([edition]);
    }
  });
});
