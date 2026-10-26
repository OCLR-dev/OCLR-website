import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { seedSession } from "./session";
import { closeDb } from "../../src/db";
test.describe("historical statistics review and public exploration", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterAll(async () => closeDb());
  test("imports MP, reviews warmups/replays, publishes and explores S2 and S7–S10", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const seasons = ["s7", "s2", "s8", "s9", "s10"];
    await seedEditions(
      seasons.map((slug) => ({
        ...edition,
        slug,
        name: "Synthetic " + slug.toUpperCase() + " statistics",
        status: "completed",
        registration: null,
        published: true,
        archive: {
          ...statisticsArchive,
          editionSlug: slug,
          matches: [
            ...statisticsArchive.matches,
            ...(slug === "s2"
              ? [
                  {
                    ...statisticsArchive.matches[0],
                    id: "missing-mp",
                    label: "Missing MP",
                    mpUrls: [],
                  },
                ]
              : []),
          ],
        },
      })),
    );
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    // Each project uses a fresh edition row but can share an earlier published snapshot.
    const { db } = await import("../../src/db");
    const { historicalStatistics } = await import("../../src/db/schema");
    const { inArray } = await import("drizzle-orm");
    await db()
      .delete(historicalStatistics)
      .where(inArray(historicalStatistics.editionSlug, seasons));
    await page.goto("/admin/tournaments/s7/statistics");
    await page
      .getByRole("button", { name: /Import missing MP histories/ })
      .click();
    await expect(page.getByRole("status")).toContainText("Import complete", {
      timeout: 30000,
    });
    await page.getByLabel("Match", { exact: true }).selectOption("one");
    await expect(
      page.getByRole("heading", { name: "MP 999177", exact: true }),
    ).toBeVisible();
    const guest = await context.browser()!.newContext();
    await guest.addCookies([
      { name: "oclr-locale", value: "en", domain: "127.0.0.1", path: "/" },
    ]);
    const guestPage = await guest.newPage();
    await guestPage.goto("http://127.0.0.1:3100/tournaments/s7/statistics");
    await expect(guestPage.locator(".event-table tbody tr")).toHaveCount(0);
    expect(
      (
        await guest.request.get(
          "http://127.0.0.1:3100/api/admin/tournaments/s7/statistics",
        )
      ).status(),
    ).toBe(401);
    await guest.close();
    await expect(
      page.getByRole("checkbox", { name: "Include game 3", exact: true }),
    ).toBeDisabled();
    // A referee's zero-score occupant blocks the game until explicitly reviewed.
    await expect(
      page.getByRole("checkbox", { name: "Include game 1", exact: true }),
    ).toBeDisabled();
    await page
      .locator(".statistics-review tbody tr")
      .first()
      .locator("summary")
      .click();
    await page
      .getByRole("checkbox", { name: "Exclude score 1 · 999999", exact: true })
      .check();
    await expect(
      page.getByRole("button", { name: "Select eligible games", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Include game 1", exact: true }),
    ).toBeEnabled();
    await page
      .locator(".statistics-review tbody tr")
      .first()
      .locator("summary")
      .click();
    await expect(
      page.getByRole("checkbox", {
        name: "Exclude score 1 · 999999",
        exact: true,
      }),
    ).toBeChecked();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath("zero-score-review.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Select eligible games", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Statistics draft saved.",
    );
    await expect(
      page.getByRole("button", {
        name: "Approve & publish statistics",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", { name: "Include game 4", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Approve & publish statistics",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", {
        name: "Approve & publish statistics",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    // Publish the same synthetic evidence through the authenticated, origin-protected API for each remaining edition.
    for (const slug of seasons.slice(1)) {
      const api = "/api/admin/tournaments/" + slug + "/statistics";
      const headers = { Origin: "http://127.0.0.1:3100" };
      expect(
        (
          await context.request.post(api, {
            headers,
            data: { action: "import", mpId: 999177, expectedVersion: 0 },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await context.request.post(api, {
            headers,
            data: {
              action: "review",
              mpId: 999177,
              expectedVersion: 1,
              poolId: "final",
              included: [1, 2],
              excludedScores: [{ gameId: 1, osuId: 999999 }],
            },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await context.request.post(api, {
            headers,
            data: {
              action: "publish",
              fixtureId: "one",
              expectedVersions: { "999177": 2 },
              confirmed: true,
            },
          })
        ).ok(),
      ).toBe(true);
    }
    expect(
      (
        await context.request.post("/api/admin/tournaments/s7/statistics", {
          headers: { Origin: "https://wrong.example" },
          data: { action: "import", mpId: 999177, expectedVersion: 3 },
        })
      ).status(),
    ).toBe(403);
    await context.clearCookies();
    await context.addCookies([
      { name: "oclr-locale", value: "en", domain: "127.0.0.1", path: "/" },
    ]);
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 950 });
    for (const slug of seasons) {
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-appearance",
              value: appearance,
              domain: "127.0.0.1",
              path: "/",
            },
            {
              name: "oclr-theme",
              value: theme,
              domain: "127.0.0.1",
              path: "/",
            },
          ]);
          await page.goto("/tournaments/" + slug + "/statistics");
          await expect(page.locator(".event-table tbody tr")).toHaveCount(4);
          if (slug === "s2") {
            await expect(
              page.getByRole("region", { name: "Statistics coverage" }),
            ).toContainText("1 / 2");
            await page.getByText("Match coverage", { exact: true }).click();
            await expect(
              page
                .locator(".statistics-coverage li")
                .filter({ hasText: "Missing MP" }),
            ).toContainText("Not yet covered");
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(isMobile ? 390 : 1440);
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
          );
          if (slug === "s7" || slug === "s2")
            await page.screenshot({
              path: info.outputPath(
                slug + "-" + appearance + "-" + theme + ".png",
              ),
              fullPage: true,
            });
        }
    }
    await page.goto("/tournaments/s2/statistics");
    for (const view of [
      "Performance scores",
      "Mappool statistics",
      "Individual leaderboard",
      "Team leaderboard",
      "Team placements",
      "Solo placements",
    ]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: view, exact: true }),
      ).toBeVisible();
      await expect(page.locator(".event-table tbody tr")).not.toHaveCount(0);
    }
    await page
      .getByRole("button", { name: "Performance scores", exact: true })
      .click();
    await expect(
      page.locator('a[href="/tournaments/s2/players/91001"]').first(),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Team", exact: true })
      .selectOption("Synthetic Alpha");
    await expect(page.locator(".event-table tbody tr")).toHaveCount(2);
    await page
      .getByRole("combobox", { name: "Rounds", exact: true })
      .selectOption("Final");
    const map = page.getByRole("combobox", { name: "Map", exact: true });
    await map.selectOption(
      (await map.locator("option").nth(1).getAttribute("value"))!,
    );
    await expect(page.locator(".event-table tbody tr")).toHaveCount(2);
    await map.selectOption("");
    await page
      .getByRole("combobox", { name: "Team", exact: true })
      .selectOption("");
    const search = page.getByRole("textbox", { name: "Search", exact: true });
    await search.fill("NO_MATCHING_PLAYER");
    await expect(page.locator(".event-table tbody tr")).toHaveCount(0);
    await search.fill("Historical Player");
    await expect(page.locator(".event-table tbody tr")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Individual leaderboard", exact: true })
      .click();
    await expect(page.locator(".event-table tbody tr")).not.toHaveCount(0);
    for (const locale of ["zh-Hans", "zh-Hant"]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      await page.reload();
      await expect(page.locator(".event-statistics h1")).toHaveText(
        locale === "zh-Hant" ? "數據統計" : "数据统计",
      );
    }
  });
  test("reviews adjudication, wrong colors and nonzero non-participants explicitly", async ({
    page,
    context,
    isMobile,
  }, info) => {
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        name: "Synthetic adjudicated statistics",
        status: "completed",
        registration: null,
        published: true,
        archive: statisticsArchive,
      },
    ]);
    const { db } = await import("../../src/db");
    const { historicalStatistics } = await import("../../src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { statisticsArchiveKey } =
      await import("../../src/lib/archive-statistics");
    const source = statisticsSource();
    source.games[0].scores[0].team = "red";
    source.games[0].scores.push({
      ...structuredClone(source.games[0].scores[0]),
      osuId: 91005,
      total: 3,
    });
    source.games[1].scores[2].total = 999;
    await db()
      .delete(historicalStatistics)
      .where(eq(historicalStatistics.editionSlug, "s7"));
    await db()
      .insert(historicalStatistics)
      .values({
        editionSlug: "s7",
        mpId: 999177,
        fixtureId: "one",
        version: 1,
        draft: {
          archiveKey: statisticsArchiveKey(statisticsArchive),
          source,
          poolId: "final",
          included: [],
        },
      });
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.goto("/admin/tournaments/s7/statistics");
    await page.getByLabel("Match", { exact: true }).selectOption("one");
    await expect(
      page.getByRole("checkbox", { name: "Include game 1", exact: true }),
    ).toBeDisabled();
    await page
      .locator(".statistics-review tbody tr")
      .first()
      .locator("summary")
      .click();
    await expect(
      page.getByRole("checkbox", {
        name: "Exclude score 1 · 91001",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("checkbox", { name: "Exclude score 1 · 91005", exact: true })
      .check();
    await page
      .getByRole("checkbox", {
        name: "Use verified roster teams 1",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Include game 1", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("checkbox", { name: "Include game 1", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Include game 2", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Approve & publish statistics",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: /Organizer confirmed technical adjudication/,
      })
      .check();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Include game 1", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("checkbox", { name: "Include game 1", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Include game 2", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Approve & publish statistics",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", {
        name: "Approve & publish statistics",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await context.clearCookies();
    await context.addCookies([
      { name: "oclr-locale", value: "en", domain: "127.0.0.1", path: "/" },
    ]);
    await page.goto("/tournaments/s7/statistics");
    await expect(page.locator(".event-table tbody tr")).not.toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(isMobile ? 390 : 1280);
    await page.screenshot({
      path: info.outputPath("adjudicated-statistics.png"),
      fullPage: true,
    });
  });
  test("reviews a rostered bench occupant only beyond four retained teammates", async ({
    page,
    context,
    isMobile,
  }) => {
    const archive = structuredClone(statisticsArchive),
      source = statisticsSource();
    for (const uid of [91006, 91007, 91008]) {
      archive.players.push({
        ...archive.players[0],
        osuId: uid,
        username: "Synthetic teammate " + uid,
        role: "player",
        tier: null,
      });
      source.games[0].scores.push({
        ...structuredClone(source.games[0].scores[0]),
        osuId: uid,
        total: uid === 91008 ? 50 : 200,
      });
    }
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        name: "Synthetic bench review",
        status: "completed",
        registration: null,
        published: true,
        archive,
      },
    ]);
    const { db } = await import("../../src/db");
    const { historicalStatistics } = await import("../../src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { statisticsArchiveKey } =
      await import("../../src/lib/archive-statistics");
    await db()
      .delete(historicalStatistics)
      .where(eq(historicalStatistics.editionSlug, "s7"));
    await db()
      .insert(historicalStatistics)
      .values({
        editionSlug: "s7",
        mpId: 999177,
        fixtureId: "one",
        version: 1,
        draft: {
          archiveKey: statisticsArchiveKey(archive),
          source,
          poolId: "final",
          included: [],
        },
      });
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.goto("/admin/tournaments/s7/statistics");
    await page.getByLabel("Match", { exact: true }).selectOption("one");
    await page
      .locator(".statistics-review tbody tr")
      .first()
      .locator("summary")
      .click();
    await page
      .getByRole("checkbox", { name: "Exclude score 1 · 91008", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Include game 1", exact: true }),
    ).toBeEnabled();
    await page
      .locator(".statistics-review tbody tr")
      .first()
      .locator("summary")
      .click();
    await expect(
      page.getByRole("checkbox", {
        name: "Exclude score 1 · 91001",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", {
        name: "Exclude score 1 · 91008",
        exact: true,
      }),
    ).toBeChecked();
    for (const id of [1, 2])
      await page
        .getByRole("checkbox", { name: "Include game " + id, exact: true })
        .check();
    await page
      .getByRole("button", { name: "Save statistics review", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Approve & publish statistics",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", {
        name: "Approve & publish statistics",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(source.games[0].scores.at(-1)?.total).toBe(50);
  });
});
