import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { mappoolEntries, mappools } from "../../src/db/schema";
import { categories, slotLabel } from "../../src/lib/mappool-model";
import { mappoolCommand } from "../../src/lib/mappools";
import { assertTestDatabase } from "../database";
import { seedSession } from "./session";
import { captureResponsiveLayout } from "./responsive";

test.describe("published mappool mainsheet", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("shows 30 saved maps in ordered compact tables, with accurate stats and private draft isolation", async ({
    page,
    context,
    isMobile,
  }, info) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    const adminId = isMobile ? 70001 : 60001;
    await seedSession(adminId);
    process.env.ADMIN_OSU_IDS = String(adminId);
    await db().execute(sql`TRUNCATE tournament_stages CASCADE`);
    const actor = { osuId: adminId, username: "Synthetic Mainsheet Admin" };
    const command = (input: Record<string, unknown>) =>
      mappoolCommand(actor, "test-cup", { ...input, confirmed: true });
    let data = await command({
      action: "round_create",
      stage: "group",
      name: "Synthetic Mainsheet Round",
      position: 1,
    });
    const roundId = data.rounds[0].id;
    data = await command({
      action: "pool_create",
      roundId,
      name: "Synthetic Released 30-Map Pool",
    });
    const poolId = data.pools[0].id;
    await command({
      action: "pool_settings",
      poolId,
      expectedVersion: 0,
      name: "Synthetic Released 30-Map Pool",
      fmMode: "free_mod",
      fmRestrictions: "Synthetic published mod restrictions.",
    });
    data = await command({
      action: "pool_create",
      roundId,
      name: "PRIVATE_MAINSHEET_POOL",
    });
    const privatePool = data.pools.find(
      (p) => p.name === "PRIVATE_MAINSHEET_POOL",
    )!.id;
    await db()
      .insert(mappoolEntries)
      .values(
        categories.flatMap((category, c) =>
          [5, 4, 3, 2, 1].map((position) => ({
            poolId,
            category,
            position,
            beatmapId: 820000 + c * 10 + position,
            metadata: {
              setId: category === "NM" && position === 1 ? 43 : 42,
              artist: "Provider Artist",
              title: `Synthetic ${slotLabel(category, position)}`,
              difficulty: "Expert",
              mapper: "Provider Mapper",
              stars: category === "NM" ? 6.01 : 4.125,
              bpm: 180.25,
              duration: 123,
              ar: position === 2 ? null : 9.2,
              od: 8.5,
              cs: 4,
              hp: 6,
              ...(category === "HD" && position === 1
                ? {
                    attributes: {
                      configuration: "HD" as const,
                      mods: ["HD"],
                      ruleset: "osu" as const,
                      stars: 4.25,
                      maxCombo: 900,
                      values: {} as Record<string, number>,
                      fetchedAt: new Date().toISOString(),
                    },
                  }
                : {}),
              ...(category === "DT" && position === 1
                ? {
                    attributes: {
                      configuration: "DT" as const,
                      mods: ["DT"],
                      ruleset: "osu" as const,
                      stars: 6.75,
                      maxCombo: 1000,
                      values: { approach_rate: 10.3 },
                      fetchedAt: new Date().toISOString(),
                    },
                  }
                : {}),
            },
          })),
        ),
      );
    await command({
      action: "pool_publish",
      poolId,
      expectedVersion: 1,
      published: true,
    });
    await context.route("https://assets.ppy.sh/beatmaps/**", (route) =>
      route.request().url().includes("/43/")
        ? route.abort()
        : route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="32"><rect width="56" height="32" fill="#593776"/></svg>',
          }),
    );
    expect(
      (await context.cookies()).filter(
        (cookie) => !isAutomaticPreferenceCookie(cookie),
      ),
    ).toEqual([]);
    expect(
      (
        await context.request.get(
          `/api/tournaments/test-cup/mappools/${privatePool}`,
        )
      ).status(),
    ).toBe(404);
    const publicUrl = `/api/tournaments/test-cup/mappools/${poolId}`;
    const beforeRead = await (await context.request.get(publicUrl)).json();
    const poolBefore = await db()
      .select()
      .from(mappools)
      .where(eq(mappools.id, poolId));
    await page.goto(`/tournaments/test-cup/mappools/${poolId}`);
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    const sheet = page.locator(".mappool-public");
    await expect(sheet.locator("tbody tr")).toHaveCount(30);
    await expect(sheet.getByText(/Unconfigured/)).toHaveCount(0);
    const nmRow = sheet.locator(`#pool-${poolId}-maps-NM tbody tr`).first();
    await expect(nmRow.locator(".mappool-base-sr").first()).toContainText(
      "6.01",
    );
    await expect(nmRow.locator(".mappool-mod-attributes")).toHaveCount(0);
    await expect(
      nmRow.locator(".mappool-mobile-details summary"),
    ).toContainText("6.01 ★ base");
    const hdRow = sheet.locator(`#pool-${poolId}-maps-HD tbody tr`).first();
    await expect(hdRow.locator(".mappool-base-sr").first()).toContainText(
      "4.13",
    );
    await expect(
      hdRow.locator(".mappool-mod-attributes").first(),
    ).toContainText("4.25");
    await expect(
      hdRow.locator(".mappool-mod-attributes small").first(),
    ).toHaveText("HD");
    await expect(
      sheet.locator(`#pool-${poolId}-maps-HD tbody tr`).nth(1),
    ).toContainText("Not calculated");

    await expect(sheet.locator(".mappool-category-links")).toHaveCount(0);
    const modFilter = page.getByRole("group", {
      name: "Synthetic Released 30-Map Pool: mod filter",
    });
    for (const category of categories)
      await expect(
        modFilter.getByRole("button", { name: category, exact: true }),
      ).toBeVisible();
    for (const c of categories)
      expect(
        await sheet
          .locator(`#pool-${poolId}-maps-${c} tbody th`)
          .allTextContents(),
      ).toEqual([1, 2, 3, 4, 5].map((p) => slotLabel(c, p)));
    await expect(
      sheet.getByText("Free Mod: Synthetic published mod restrictions."),
    ).toBeVisible();
    for (const c of ["FM", "TB"]) {
      await expect(
        sheet.locator(`#pool-${poolId}-maps-${c} .mappool-mod-attributes`),
      ).toHaveCount(0);
      await expect(
        sheet
          .locator(`#pool-${poolId}-maps-${c} .mappool-extra`)
          .filter({ hasText: "Variable" }),
      ).toHaveCount(5);
    }
    await expect(
      sheet.locator('.beatmap-cover [aria-label="Cover unavailable"]').first(),
    ).toBeVisible();
    const opener = sheet.getByRole("button", {
      name: "View NM1: Synthetic NM1",
      exact: true,
    });
    await opener.click();
    await expect(
      page.getByRole("dialog").getByRole("link", {
        name: "Open on osu!",
        exact: true,
      }),
    ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/820001");
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    if (isMobile) {
      const details = sheet
        .locator(`#pool-${poolId}-maps-DT .mappool-mobile-details`)
        .first();
      await details.locator("summary").first().focus();
      await page.keyboard.press("Enter");
      await expect(details).toHaveAttribute("open", "");
      await expect(details).toContainText("6.75");
      await expect(details).toContainText("180.25");
      await expect(details).toContainText("2:03");
      await expect(details.getByText("DT", { exact: true })).toBeVisible();
      await details.locator(".mappool-mod-attributes summary").click();
      await expect(details.getByText("1000", { exact: true })).toBeVisible();
      await details.locator(".mappool-mod-attributes summary").click();
      await details.locator("summary").first().click();
    } else {
      await expect(
        sheet
          .locator(`#pool-${poolId}-maps-DT .mappool-extra`)
          .filter({ hasText: "6.75" })
          .first(),
      ).toBeVisible();
      await expect(
        sheet
          .locator(`#pool-${poolId}-maps-NM tbody tr`)
          .nth(1)
          .locator(".mappool-extra .mappool-parameters dd")
          .first(),
      ).toHaveText("—");
      const attributes = sheet
        .locator(
          `#pool-${poolId}-maps-DT .mappool-extra .mappool-mod-attributes`,
        )
        .first();
      await attributes.locator("summary").click();
      await expect(attributes.getByText("1000", { exact: true })).toBeVisible();
      await attributes.locator("summary").click();
    }
    for (const width of [320, 390, 760, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 900 });
    if (!isMobile) {
      const region = page.getByRole("region", {
        name: "Synthetic Released 30-Map Pool: NM beatmaps",
        exact: true,
      });
      await region.focus();
      await expect(region).toBeFocused();
      expect(
        await region.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureResponsiveLayout(page, info, "mappool");
    await page.screenshot({
      path: info.outputPath("published-30-map-mainsheet.png"),
      fullPage: true,
      animations: "disabled",
    });
    expect(await (await context.request.get(publicUrl)).json()).toEqual(
      beforeRead,
    );
    expect(
      await db().select().from(mappools).where(eq(mappools.id, poolId)),
    ).toEqual(poolBefore);
    await page.goto(`/tournaments/test-cup/mappools/${privatePool}`);
    await expect(
      page.getByRole("heading", { name: "Off the beat.", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("PRIVATE_MAINSHEET_POOL")).toHaveCount(0);
  });
});
