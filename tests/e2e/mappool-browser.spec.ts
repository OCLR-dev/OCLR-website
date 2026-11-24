import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
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
  test("shows one released pool, switches pools locally, and preserves private-data boundaries", async ({
    page,
    context,
    isMobile,
  }) => {
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
              mode: "osu" as const,
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
    await context.route("**/api/osu-images/{cover,list}/*", (route) =>
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
    const firstRound = await round("group", "Group Round 1", 1);
    const first = await pool(firstRound, "Opening pool", 6);
    expect(
      (await context.cookies()).filter(
        (cookie) => !isAutomaticPreferenceCookie(cookie),
      ),
    ).toEqual([]);
    await page.goto(index);
    await expect(
      page.getByRole("heading", { name: "Opening pool", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Mappools", exact: true }),
    ).toHaveCount(0);
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
    await dialog.getByRole("button", { name: "Next map", exact: true }).click();
    await expect(
      dialog.getByRole("link", { name: "osu!direct", exact: true }),
    ).toHaveAttribute("href", "osu://b/830002");
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
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
    const tabs = page.getByRole("tablist", { name: "Mappools", exact: true });
    expect(await tabs.getByRole("tab").allTextContents()).toEqual([
      "Opening pool · 6",
      "Supplement pool · 2",
      "Second round pool · 1",
      "Later pool · 1",
      "Final pool · 2",
    ]);
    await expect(page.locator(".mappool-browse")).toHaveCount(1);
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
    let navigations = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest()) navigations++;
    });
    const opening = tabs.getByRole("tab").first();
    await opening.focus();
    await page.keyboard.press("End");
    await expect(tabs.getByRole("tab").last()).toBeFocused();
    await expect(page.locator(".map-browse-card")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    await expect(page.locator(`#pool-${knockout}-maps-NM`)).toBeVisible();
    await tabs.getByRole("tab").last().focus();
    await page.keyboard.press("Home");
    await expect(opening).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const supplementTab = tabs.getByRole("tab").nth(1);
    await expect(supplementTab).toBeFocused();
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    const filters = page.getByRole("tablist", {
      name: "Supplement pool: mod filter",
      exact: true,
    });
    await filters.getByRole("tab", { name: "HD", exact: true }).click();
    await expect(page.locator(`#pool-${supplement}-maps-HD`)).toBeVisible();
    await expect(page.locator(`#pool-${supplement}-maps-NM`)).toHaveCount(0);
    const toggle = page.getByRole("switch", {
      name: "Enable modded difficulty",
    });
    await toggle.check();
    const hd = page.locator(`#pool-${supplement}-maps-HD`);
    await expect(hd).toContainText("Not calculated");
    await hd
      .getByRole("button", {
        name: "View HD1: Supplement pool map 2",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText("180");
    await expect(page.getByRole("dialog")).toContainText("9 / 8 / 4 / 6");
    await page.keyboard.press("Escape");
    await toggle.uncheck();
    await filters.getByRole("tab", { name: "All mods", exact: true }).click();
    await expect(page.locator(`#pool-${supplement}-maps-NM`)).toBeVisible();
    expect(navigations).toBe(0);
    await expect(page).toHaveURL(index);
    const mobileDetails = page.locator(".mappool-mobile-details").first();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width <= 768) await expect(mobileDetails).toBeVisible();
      else await expect(mobileDetails).not.toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await opening.click();
    await page
      .getByRole("link", { name: "Mappool: Opening pool ↗", exact: true })
      .click();
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
