import { test, expect } from "@playwright/test";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";

test.describe("archive map missing metadata", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("supplements a known BID in cards, compact rows and details without losing historical values", async ({
    page,
    context,
  }) => {
    const source = structuredClone(historicalArchive);
    source.editionSlug = "s4";
    source.formatVersion = 2;
    const pool = source.pools[0];
    pool.maps = [
      {
        ...pool.maps[0],
        beatmapId: 2076750,
        title: "#N/A",
        mapper: null,
        stars: 4.25,
        bpm: null,
        drainSeconds: null,
        ar: null,
        cs: null,
        od: null,
      },
    ];
    await seedEditions([
      {
        ...edition,
        slug: "s4",
        name: "Synthetic S4 metadata test",
        status: "completed",
        registration: null,
        archive: source,
      },
    ]);
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
      ]);
      await page.goto("/tournaments/s4/mappools");
      const row = page.locator(".archive-map-item").first();
      await expect(row).not.toContainText("#N/A");
      await expect(row).toContainText("[Extra]");
      await expect(row).toContainText("4.25 ★");
      const notes = page.locator(".page-notes");
      await expect(row).not.toContainText(
        "current osu! base metadata (no mods)",
      );
      await expect(notes).toContainText("NM1");
      await expect(notes).toContainText("current osu! base metadata (no mods)");
      await expect(
        notes.getByRole("link", { name: "Source", exact: true }),
      ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/2076750");
      expect(
        await notes.evaluate((node) => {
          const list = document.querySelector(
            ".archive-map-cards, .archive-map-list",
          )!;
          return !!(
            list.compareDocumentPosition(node) &
            Node.DOCUMENT_POSITION_FOLLOWING
          );
        }),
      ).toBe(true);
      await row.getByRole("button", { name: /View / }).click();
      await expect(page.getByRole("dialog")).toContainText("192");
      await page.getByRole("button", { name: "Close map details" }).click();
      await page
        .getByRole("button", { name: "Compact table", exact: true })
        .click();
      await expect(row).toContainText("[Extra]");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  });
});
