import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  editionState,
  fixtures,
  historicalStatistics,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import { seedResultReview } from "../fixtures/results";
import { seedSession } from "./session";

test.describe("PR 191 public data regressions", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.beforeEach(async ({ page, isMobile }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedEditions([edition]);
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 960 });
  });
  test.afterAll(closeDb);
  test("renders truthful registration and unpublished staff across themes and appearances", async ({
    page,
    context,
  }) => {
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            url: "http://127.0.0.1:3100",
          },
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto("/");
        const banner = page.locator(".home-registration-link");
        await expect(banner).toHaveAttribute(
          "href",
          "/tournaments/test-cup/register",
        );
        await expect(banner).toContainText("2099");
        await expect(banner).toContainText("UTC+8");
        await expect(banner).not.toContainText("11.23");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          (
            await new AxeBuilder({ page })
              .include(".home-redesign")
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.goto("/about");
        await expect(
          page.getByText(/Public staff profiles have not been announced/),
        ).toBeVisible();
        await expect(page.locator(".public-staff-list > li")).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    for (const locale of ["zh-Hans", "zh-Hant"]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
      ]);
      await page.goto("/");
      await expect(page.locator(".home-registration-link")).toContainText(
        "2099",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.goto("/about");
      await expect(
        page.locator(".organizer-directory > p.muted"),
      ).toBeVisible();
      await expect(page.locator(".public-staff-list > li")).toHaveCount(0);
    }
    await context.addCookies([
      { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
    ]);
    await db()
      .update(editionState)
      .set({ registrationPausedAt: new Date() })
      .where(eq(editionState.slug, edition.slug));
    await page.goto("/");
    await expect(page.locator(".home-registration-link")).toContainText(
      "Registration closed",
    );
    await expect(page.locator(".home-registration-link")).toHaveAttribute(
      "href",
      "/tournaments/test-cup",
    );
    await db()
      .update(editionState)
      .set({ configuration: { ...edition, status: "completed" } })
      .where(eq(editionState.slug, edition.slug));
    await page.reload();
    await expect(page.locator(".home-registration-link")).toContainText(
      "The next edition has not been announced yet.",
    );
  });
  test("marks cancelled fixtures and withholds unconfigured standings", async ({
    page,
    isMobile,
  }) => {
    const adminId = isMobile ? 70001 : 60001,
      refereeId = isMobile ? 695002 : 694002;
    await seedSession(adminId);
    await seedSession(refereeId);
    const seed = await seedResultReview(
      adminId,
      refereeId,
      isMobile ? 697000 : 696000,
    );
    await db()
      .update(fixtures)
      .set({
        status: "cancelled",
        scheduledAt: new Date("2026-12-01T12:00:00Z"),
      })
      .where(eq(fixtures.id, seed.fixtureId));
    await page.goto("/tournaments/test-cup/schedule");
    await expect(
      page.getByRole("article", { name: "Synthetic Reviewed Fixture" }),
    ).toContainText("Cancelled");
    await expect(
      page.locator('.event-matches tr[data-status="cancelled"]'),
    ).toContainText("Cancelled");
    await expect(
      page.getByText(
        "Groups and ranking rules await publication. No ranking is assumed.",
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
  test("keeps cross-round beatmaps separate in statistics, filters and both placement views", async ({
    page,
  }) => {
    const archive = structuredClone(statisticsArchive);
    archive.matches[0].score = [1, 0];
    archive.pools[0].maps = [archive.pools[0].maps[0]];
    archive.pools.push({
      ...structuredClone(archive.pools[0]),
      id: "semi",
      name: "Semi",
      maps: [
        {
          ...archive.pools[0].maps[0],
          beatmapId: 10002,
          title: "Synthetic second-round map",
        },
      ],
    });
    archive.pools[0].maps.push({
      ...archive.pools[0].maps[0],
      slot: "NM2",
      beatmapId: 10003,
      title: "Synthetic alternate map",
    });
    archive.matches.push({
      ...structuredClone(archive.matches[0]),
      id: "two",
      stage: "Semi",
      mpUrls: ["https://osu.ppy.sh/community/matches/999178"],
    });
    archive.matches.push({
      ...structuredClone(archive.matches[0]),
      id: "three",
      mpUrls: ["https://osu.ppy.sh/community/matches/999179"],
    });
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        name: "Synthetic statistics regression",
        status: "completed",
        registration: null,
        archive,
      },
    ]);
    const key = statisticsArchiveKey(archive);
    for (const [index, fixtureId] of ["one", "two", "three"].entries()) {
      const source = statisticsSource();
      source.match.id += index;
      source.games.forEach((game) => {
        game.id += index * 100;
        game.beatmapId = 10001 + index;
      });
      const snapshot = {
        archiveKey: key,
        source,
        poolId: index === 1 ? "semi" : "final",
        included: [1 + index * 100],
      };
      await db().insert(historicalStatistics).values({
        editionSlug: "s7",
        mpId: source.match.id,
        fixtureId,
        version: 1,
        draft: snapshot,
        published: snapshot,
        publishedAt: new Date(),
      });
    }
    await page.goto("/tournaments/s7/statistics");
    await page
      .getByRole("button", { name: "Mappool statistics", exact: true })
      .click();
    const rows = page.locator(".event-table tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(
      rows.filter({ hasText: "Synthetic statistics map 1" }),
    ).toHaveCount(1);
    await expect(
      rows.filter({ hasText: "Synthetic second-round map" }),
    ).toHaveCount(1);
    const maps = page.getByRole("combobox", { name: /^Map/ });
    await expect(maps.locator("option")).toHaveCount(4);
    await maps.selectOption({ label: "Final · NM1 · 10001" });
    await expect(rows).toHaveCount(1);
    await expect(
      rows.getByRole("cell", { name: "50%", exact: true }),
    ).toBeVisible();
    await maps.selectOption({ label: "Semi · NM1 · 10002" });
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Synthetic second-round map");
    await maps.selectOption("");
    for (const view of ["Team placements", "Solo placements"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect(
        page.getByRole("button", {
          name: "Final · NM1 · 10001 Score",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Semi · NM1 · 10002 Score",
          exact: true,
        }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
});
