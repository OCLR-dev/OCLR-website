import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { mappoolEntries } from "../../src/db/schema";
import { mappoolCommand } from "../../src/lib/mappools";
import { seedSession } from "./session";
import { assertTestDatabase } from "../database";

test.describe("anonymous inline mappool browser", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("shows maps immediately, switches stages in place, and scopes every pool anchor", async ({
    page,
    context,
    isMobile,
  }, info) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    const adminId = isMobile ? 70001 : 60001;
    await seedSession(adminId);
    process.env.ADMIN_OSU_IDS = String(adminId);
    await db().execute(sql`TRUNCATE tournament_stages CASCADE`);
    const actor = { osuId: adminId, username: "Synthetic Mappool Admin" };
    const command = (input: Record<string, unknown>) =>
      mappoolCommand(actor, "test-cup", { ...input, confirmed: true });
    async function round(
      stage: "group" | "knockout",
      name: string,
      position: number,
    ) {
      const data = await command({
        action: "round_create",
        stage,
        name,
        position,
      });
      return data.rounds.find((r) => r.stage === stage && r.name === name)!.id;
    }
    async function pool(
      roundId: string,
      name: string,
      count: number,
      published = true,
      categories: ("NM" | "HD")[] = ["NM"],
    ) {
      const data = await command({ action: "pool_create", roundId, name });
      const id = data.pools.find((p) => p.name === name)!.id;
      await db()
        .insert(mappoolEntries)
        .values(
          Array.from({ length: count }, (_, i) => ({
            poolId: id,
            category: categories[i % categories.length],
            position: Math.floor(i / categories.length) + 1,
            beatmapId: 830001 + i,
            metadata: {
              setId: 42 + i,
              artist: "Synthetic Artist",
              title: `${name} map ${i + 1}`,
              difficulty: "Expert",
              mapper: "Synthetic Mapper",
              stars: 6.01,
              bpm: 180,
              duration: 123,
              ar: 9,
              od: 8,
              cs: 4,
              hp: 6,
            },
          })),
        );
      if (published)
        await command({
          action: "pool_publish",
          poolId: id,
          expectedVersion: 0,
          published: true,
        });
      return id;
    }
    await context.route("https://assets.ppy.sh/beatmaps/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="48"><rect width="72" height="48" fill="#593776"/></svg>',
      }),
    );
    const index = "/tournaments/test-cup/mappools";
    await page.goto(index);
    await expect(
      page.getByRole("heading", { name: "No mappools published", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Mappool stages" }),
    ).toHaveCount(0);
    const firstRound = await round("group", "Group Round 1", 1);
    const first = await pool(firstRound, "Opening pool", 6);
    expect(
      (await context.cookies()).filter((c) => c.name !== "oclr-locale"),
    ).toEqual([]);
    await page.goto(index);
    await expect(
      page.getByRole("tablist", { name: "Mappool stages" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Group Stage · Group Round 1 · Opening pool",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    for (let i = 1; i <= 6; i++)
      await expect(
        page.getByRole("rowheader", { name: `NM${i}`, exact: true }),
      ).toBeVisible();
    await expect(page.locator(".mappool-base-sr").first()).toContainText(
      "6.01",
    );
    await expect(page.getByText("Unconfigured", { exact: true })).toHaveCount(
      0,
    );
    const opener = page.getByRole("button", {
      name: "View NM1: Opening pool map 1",
      exact: true,
    });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("link", { name: "Open on osu!", exact: true }),
    ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/830001");
    await expect(
      dialog.getByRole("link", { name: "osu!direct", exact: true }),
    ).toHaveAttribute("href", "osu://b/830001");
    await expect(dialog.locator('a[href*="/download"]')).toHaveCount(0);
    await dialog.getByRole("button", { name: "Next map", exact: true }).click();
    await expect(
      dialog.getByRole("link", { name: "osu!direct", exact: true }),
    ).toHaveAttribute("href", "osu://b/830002");
    await expect(dialog.locator(".beatmap-cover img")).toHaveAttribute(
      "src",
      "https://assets.ppy.sh/beatmaps/43/covers/cover.jpg",
    );
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    await expect(
      page.locator(".mappool-map-identity img").first(),
    ).toBeVisible();
    const thirdRound = await round("group", "Group Round 3", 3);
    await pool(thirdRound, "Later pool", 1);
    const secondRound = await round("group", "Group Round 2", 2);
    await pool(secondRound, "Second round pool", 1);
    const supplement = await pool(firstRound, "Supplement pool", 2, true, [
      "NM",
      "HD",
    ]);
    const knockoutRound = await round("knockout", "Final round", 1);
    const knockout = await pool(knockoutRound, "Final pool", 2);
    const hiddenRound = await round("knockout", "PRIVATE_ROUND", 2);
    const hidden = await pool(hiddenRound, "PRIVATE_POOL", 1, false);
    await page.reload();
    for (const button of await page
      .getByRole("button", { name: "Compact table", exact: true })
      .all())
      await button.click();
    const tabs = page.getByRole("tablist", {
      name: "Mappool stages",
      exact: true,
    });
    const group = tabs.getByRole("tab", { name: "Group Stage", exact: true });
    const ko = tabs.getByRole("tab", { name: "Knockout Stage", exact: true });
    await expect(group).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    expect(
      await page
        .locator(".mappool-round-group")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label"))),
    ).toEqual(["Group Round 1", "Group Round 2", "Group Round 3"]);
    await expect(page.locator(".mappool-public-round")).toHaveCount(0);
    await expect(page.locator(`#pool-${first}-maps-NM`)).toBeVisible();
    await expect(page.locator(`#pool-${supplement}-maps-HD`)).toBeVisible();
    await expect(page.locator(`#pool-${knockout}-maps-NM`)).toHaveCount(0);
    expect(await page.content()).not.toMatch(/PRIVATE_ROUND|PRIVATE_POOL/);
    expect(
      (
        await context.request.get(
          `/api/tournaments/test-cup/mappools/${hidden}`,
        )
      ).status(),
    ).toBe(404);
    const ids = await page
      .locator("[id]")
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
    await expect(page.locator(".mappool-category-links")).toHaveCount(0);
    let navigations = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest()) navigations++;
    });
    await group.focus();
    await page.keyboard.press("ArrowRight");
    await expect(ko).toBeFocused();
    await expect(ko).toHaveAttribute("aria-selected", "true");
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    await expect(page.locator(`#pool-${knockout}-maps-NM`)).toBeVisible();
    await expect(page.locator(`#pool-${first}-maps-NM`)).toHaveCount(0);
    await ko.focus();
    await page.keyboard.press("Home");
    await expect(group).toBeFocused();
    await page.keyboard.press("End");
    await expect(ko).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(group).toBeFocused();
    for (const button of await page
      .getByRole("button", { name: "Compact table", exact: true })
      .all())
      await button.click();
    expect(navigations).toBe(0);
    await expect(page).toHaveURL(index);
    await expect(page.locator(".mappool-public-round")).toHaveCount(0);
    await expect(page.locator(`#pool-${first}-maps-NM`)).toBeVisible();
    await expect(page).toHaveTitle(/Published mappools/);
    const supplementFilters = page.getByRole("group", {
      name: "Supplement pool: mod filter",
      exact: true,
    });
    await supplementFilters
      .getByRole("button", { name: "HD", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(`#pool-${supplement}-maps-HD`)).toBeVisible();
    await expect(page.locator(`#pool-${supplement}-maps-NM`)).toHaveCount(0);
    await supplementFilters
      .getByRole("button", { name: "All mods", exact: true })
      .click();
    await expect(page.locator(`#pool-${supplement}-maps-NM`)).toBeVisible();
    await expect(page).toHaveURL(index);
    const mobileDetails = page
      .locator(`#pool-${first}-maps-NM .mappool-mobile-details`)
      .first();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width <= 768) await expect(mobileDetails).toBeVisible();
      else await expect(mobileDetails).not.toBeVisible();
      if (width === 320) {
        await mobileDetails.locator("summary").first().focus();
        await page.keyboard.press("Enter");
        await expect(mobileDetails).toHaveAttribute("open", "");
        await expect(
          mobileDetails.getByText("AR", { exact: true }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const columnWidths = await page
        .locator(".mappool-sheet")
        .evaluateAll((tables) =>
          tables.map((table) =>
            Array.from(
              table.querySelectorAll("thead th"),
              (cell) =>
                Math.round(cell.getBoundingClientRect().width * 100) / 100,
            ),
          ),
        );
      expect(columnWidths.length).toBeGreaterThan(1);
      for (const columns of columnWidths)
        expect(columns).toEqual(columnWidths[0]);
      const actionBounds = await page
        .locator(".mappool-actions-cell .beatmap-actions")
        .first()
        .locator("a")
        .evaluateAll((links) =>
          links.map((link) => {
            const box = link.getBoundingClientRect();
            return { x: box.x, y: box.y, bottom: box.bottom };
          }),
        );
      expect(actionBounds).toHaveLength(2);
      expect(actionBounds[0].x).toBeCloseTo(actionBounds[1].x, 1);
      expect(actionBounds[1].y).toBeGreaterThanOrEqual(actionBounds[0].bottom);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.mouse.move(0, 0);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      await page.screenshot({
        path: info.outputPath(`inline-mappools-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      if (width === 320) await mobileDetails.locator("summary").first().click();
    }
    await page.getByRole("link", { name: "Opening pool", exact: true }).click();
    await expect(page).toHaveURL(`${index}/${first}`);
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    await expect(
      page.getByRole("rowheader", { name: "NM6", exact: true }),
    ).toBeVisible();
    await page.goto(`${index}/${hidden}`);
    await expect(page.getByText("PRIVATE_POOL")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Off the beat.", exact: true }),
    ).toBeVisible();
  });
});
