import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db, closeDb } from "../../src/db";
import { historicalStatistics } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics";
import { eventMapKey } from "../../src/lib/event-statistics-model";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";

test("pool denominators, ban-only maps, sorting and team filters", async ({
  page,
  context,
}, info) => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  const archive = structuredClone(statisticsArchive);
  archive.pools[0].maps.push({
    ...archive.pools[0].maps[0],
    slot: "NM3",
    beatmapId: 10003,
    title: "Synthetic ban-only map",
  });
  archive.pools.push({
    ...archive.pools[0],
    id: "second",
    name: "Synthetic second pool",
    maps: archive.pools[0].maps.map((m) => ({
      ...m,
      beatmapId: m.beatmapId! + 10,
    })),
  });
  Object.assign(archive.matches[0], {
    poolId: "final",
    bansA: "NM3",
    bansB: "NM2",
  });
  archive.matches.push({
    ...archive.matches[0],
    id: "two",
    poolId: "second",
    bansA: "NM1",
    mpUrls: ["https://osu.ppy.sh/community/matches/999178"],
  });
  await seedEditions([
    {
      ...edition,
      slug: "s7",
      published: true,
      status: "completed",
      registration: null,
      archive,
    },
  ]);
  await db()
    .delete(historicalStatistics)
    .where(eq(historicalStatistics.editionSlug, "s7"));
  for (const [index, fixture] of archive.matches.entries()) {
    const source = statisticsSource();
    source.match.id += index;
    source.games = source.games.slice(0, 2).map((g) => ({
      ...g,
      id: g.id + index * 10,
      beatmapId: g.beatmapId! + index * 10,
    }));
    const snapshot = {
      archiveKey: statisticsArchiveKey(archive),
      source,
      poolId: fixture.poolId!,
      included: source.games.map((g) => g.id),
    };
    await db().insert(historicalStatistics).values({
      editionSlug: "s7",
      fixtureId: fixture.id,
      mpId: source.match.id,
      version: 1,
      draft: snapshot,
      published: snapshot,
      publishedAt: new Date(),
    });
  }
  for (const theme of ["light", "dark"]) {
    await context.addCookies([
      { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
    ]);
    await page.goto("/tournaments/s7/statistics");
    await page
      .getByRole("button", { name: "Mappool statistics", exact: true })
      .click();
    await expect(page.locator(".event-table tbody tr")).toHaveCount(6);
    const map = (slot: string, mapId: number) =>
      eventMapKey({ round: archive.matches[0].stage, slot, mapId, title: "" });
    const mapFilter = page.getByRole("combobox", { name: /^Map/ });
    async function value(column: string) {
      const headers = await page
        .locator(".event-table thead th")
        .allTextContents();
      const index = headers.findIndex(
        (h) => h.replace(/[↓↑]/g, "").trim() === column,
      );
      return page
        .locator(".event-table tbody tr")
        .first()
        .locator("td")
        .nth(index);
    }
    await mapFilter.selectOption(map("NM1", 10001));
    await expect(await value("Picks")).toHaveText("1");
    await expect(await value("Pick rate")).toHaveText("100%");
    await expect(await value("Applicable matches")).toHaveText("1");
    await expect(await value("Bans")).toHaveText("0");
    await mapFilter.selectOption(map("NM3", 10003));
    await expect(await value("Picks")).toHaveText("0");
    await expect(await value("Bans")).toHaveText("1");
    await expect(await value("Ban rate")).toHaveText("100%");
    await expect(await value("Score")).toHaveText("—");
    await page
      .getByRole("combobox", { name: /^Team/ })
      .selectOption("Synthetic Beta");
    await expect(await value("Bans")).toHaveText("0");
    await page.getByRole("combobox", { name: /^Team/ }).selectOption("");
    await mapFilter.selectOption("");
    await page.getByRole("button", { name: "Bans", exact: true }).click();
    await expect(await value("Bans")).toHaveText("1");
    await page.getByLabel("Search", { exact: true }).fill("10003");
    await expect(page.locator(".event-table tbody tr")).toHaveCount(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({
      path: info.outputPath(`mappool-${theme}.png`),
      fullPage: true,
    });
    await page.locator(".event-table-scroll").evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await page.screenshot({
      path: info.outputPath(`mappool-coverage-${theme}.png`),
      fullPage: true,
    });
  }
});
test.afterAll(async () => closeDb());
