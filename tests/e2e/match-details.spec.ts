import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { historicalStatistics, users } from "../../src/db/schema";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { seedAwardReview } from "../fixtures/awards";

test.describe("published match details", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("historical technical result, multi-MP scores and rating across locales, themes and appearances", async ({
    page,
    context,
  }, info) => {
    test.setTimeout(180000);
    const archive = structuredClone(statisticsArchive);
    archive.editionSlug = "s10";
    const fixture = archive.matches[0];
    fixture.id = "match-2";
    fixture.score = [2, 1];
    fixture.mpUrls.push("https://osu.ppy.sh/community/matches/999178");
    archive.players[0].username =
      "Synthetic long player name for responsive match details";
    await seedEditions([
      {
        ...edition,
        slug: "s10",
        name: "Synthetic S10",
        status: "completed",
        registration: null,
        published: true,
        archive,
      },
    ]);
    await db()
      .delete(historicalStatistics)
      .where(eq(historicalStatistics.editionSlug, "s10"));
    for (const index of [0, 1]) {
      const source = statisticsSource();
      source.match.id += index;
      source.games = source.games.filter((g) =>
        index === 0 ? g.id === 1 || g.id === 3 : g.id === 2 || g.id === 4,
      );
      const missingMods = source.games.find((g) => g.id === 3);
      if (missingMods) {
        missingMods.problems.push("Game mod data is unavailable.");
        missingMods.scores[0].problems.push("Player mod data is unavailable.");
      }
      const snapshot = {
        archiveKey: statisticsArchiveKey(archive),
        source,
        poolId: "final",
        included: [index + 1],
        technicalAdjudication: true,
      };
      await db().insert(historicalStatistics).values({
        editionSlug: "s10",
        fixtureId: "match-2",
        mpId: source.match.id,
        version: 3,
        draft: snapshot,
        published: snapshot,
        publishedAt: new Date(),
      });
    }
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
        for (const theme of ["light", "dark"]) {
          await context.addCookies(
            [
              ["oclr-locale", locale],
              ["oclr-appearance", appearance],
              ["oclr-theme", theme],
            ].map(([name, value]) => ({
              name,
              value,
              url: "http://127.0.0.1:3100",
            })),
          );
          await page.goto("/tournaments/s10/matches/match-2");
          await expect(page.locator("article[id^='game-']")).toHaveCount(4);
          await expect(page.locator("#game-1 tbody tr")).toHaveCount(4);
          await expect(page.locator("#game-2 tbody tr")).toHaveCount(4);
          await expect(page.locator("#game-1 tbody th").first()).toHaveCSS(
            "text-transform",
            "none",
          );
          expect(
            (await page.locator("#game-1 tbody td").first().boundingBox())!
              .width,
          ).toBeGreaterThanOrEqual(120);
          await expect(
            page.locator("#game-3 > details").first(),
          ).not.toHaveAttribute("open");
          await expect(
            page.locator(".archive-score-team strong").first(),
          ).toHaveText("2");
          await expect(
            page.locator(".archive-score-team strong").last(),
          ).toHaveText("1");
          await expect(
            page.getByRole("columnheader", { name: "MRA", exact: true }),
          ).toBeVisible();
          if (locale === "en") {
            await expect(page.locator("#game-1")).toContainText("NM");
            await expect(page.locator("#game-3")).toContainText("Not recorded");
            await page.locator("#game-3 > details > summary").click();
            await expect(
              page.locator("#game-3 tbody tr").first().locator("td").nth(7),
            ).toHaveText("Not recorded");
            await page.locator("#game-3 > details > summary").click();
          }
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <=
                document.documentElement.clientWidth,
            ),
          ).toBe(true);
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
          );
          await page.screenshot({
            path: info.outputPath(
              `match-details-${locale}-${appearance}-${theme}.png`,
            ),
            fullPage: true,
          });
        }
    await page.locator("#game-1 .table-scroll").first().focus();
    await expect(page.locator("#game-1 .table-scroll").first()).toBeFocused();
    await db()
      .update(historicalStatistics)
      .set({ published: null, publishedAt: null })
      .where(eq(historicalStatistics.editionSlug, "s10"));
    await page.reload();
    await expect(page.locator("article[id^='game-']")).toHaveCount(0);
    await expect(
      page.getByRole("columnheader", { name: "MRA", exact: true }),
    ).toHaveCount(0);
  });
  test("ordinary result exposes saved player data with the same published rating", async ({
    page,
    context,
  }, info) => {
    await seedEditions();
    await db()
      .insert(users)
      .values([
        { osuId: 60001, username: "Synthetic Admin" },
        { osuId: 60101, username: "Synthetic Referee" },
      ])
      .onConflictDoNothing();
    const before = process.env.ADMIN_OSU_IDS;
    process.env.ADMIN_OSU_IDS = "60001";
    let seeded;
    try {
      seeded = await seedAwardReview();
    } finally {
      if (before === undefined) delete process.env.ADMIN_OSU_IDS;
      else process.env.ADMIN_OSU_IDS = before;
    }
    await context.addCookies([
      { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
    ]);
    await page.goto(`/tournaments/test-cup/matches/${seeded.fixtureId}`);
    await expect(page.locator("article[id^='game-']")).toHaveCount(6);
    await expect(
      page.locator("article[id^='game-']").first().locator("tbody tr"),
    ).toHaveCount(4);
    await expect(
      page.getByRole("columnheader", { name: "MRA", exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath("ordinary-match-details.png"),
      fullPage: true,
    });
  });
});
