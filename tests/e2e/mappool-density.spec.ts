import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { mappools, mappoolEntries } from "../../src/db/schema";
import { seedSession } from "./session";
import { expectWorkflowFits } from "./responsive";

test.describe("dense Admin mappool workspace", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(60000);
  test.afterAll(closeDb);
  test("keeps eighteen maps readable, saves a public reorder and protects completed-fixture pools", async ({
    page,
    context,
    isMobile,
  }) => {
    const actor = isMobile ? 70001 : 60001;
    await seedSession(actor);
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await context.addCookies([await seedSession(actor)]);
    await context.setExtraHTTPHeaders({ Origin: "http://127.0.0.1:3100" });
    await context.route("**/api/osu-images/{cover,list}/*", (route) =>
      route.abort(),
    );
    const api = "/api/admin/tournaments/test-cup/mappools";
    const command = async (body: object) => {
      const response = await context.request.post(api, {
        data: { ...body, confirmed: true },
      });
      expect(response.status()).toBe(200);
      return response.json();
    };
    const round = (
      await command({
        action: "round_create",
        stage: "group",
        name: "Synthetic Group Round",
        position: 1,
      })
    ).rounds[0];
    const pool = (
      await command({
        action: "pool_create",
        roundId: round.id,
        name: "Synthetic Eighteen Map Pool",
      })
    ).pools[0];
    await db()
      .update(mappools)
      .set({ fmMode: "free_mod" })
      .where(eq(mappools.id, pool.id));
    await db()
      .insert(mappoolEntries)
      .values(
        Array.from({ length: 18 }, (_, i) => ({
          poolId: pool.id,
          category:
            i < 12
              ? ("NM" as const)
              : i < 15
                ? ("HD" as const)
                : i < 17
                  ? ("DT" as const)
                  : ("TB" as const),
          position: i < 12 ? i + 1 : i < 15 ? i - 11 : i < 17 ? i - 14 : 1,
          beatmapId: 930000 + i,
          metadata: {
            setId: 42,
            title: `Map ${i + 1}: ${"A long synthetic song title for responsive review ".repeat(3)}`,
            artist: "Synthetic Artist",
            difficulty: "Synthetic Expert",
            mapper: "Synthetic Mapper",
            stars: 6.25,
            bpm: 180,
            duration: 125,
            ar: 9,
            od: 8,
            cs: 4,
            hp: 6,
          },
        })),
      );
    await page.goto("/admin/tournaments/test-cup/mappools");
    await expect(page.getByLabel("Selected mappool")).toContainText("18 maps");
    await expect(page.locator(".mappool-pool-heading")).not.toContainText(
      "Free Mod",
    );
    await expect(page.locator(".mappool-pool-heading")).toContainText(
      "Synthetic Group Round / Synthetic Eighteen Map Pool",
    );
    await page.getByRole("tab", { name: "Pool settings", exact: true }).click();
    await expect(page.getByLabel("Selected mappool")).toContainText("Free Mod");
    await page.getByRole("tab", { name: "Maps", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "NM (12)", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".mappool-order > li:visible")).toHaveCount(12);
    await expect(
      page.locator(".mappool-order > li:visible").first(),
    ).toContainText("6.25 ★ base");
    await expectWorkflowFits(page);
    await page.getByRole("tab", { name: "HR (0)", exact: true }).click();
    await expect(
      page.getByText("No HR slots configured.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "NM (12)", exact: true }).click();
    await expect(page).toHaveTitle(/Manage mappools/);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await command({
      action: "pool_publish",
      poolId: pool.id,
      expectedVersion: 0,
      published: true,
    });
    await page.reload();
    await expect(
      page.getByRole("switch", { name: "Publish pool", exact: true }),
    ).toBeVisible();
    const publicApi = `/api/tournaments/test-cup/mappools/${pool.id}`;
    const before = await (await context.request.get(publicApi)).json();
    await page
      .getByRole("button", { name: "Move NM1 down", exact: true })
      .click();
    await page.getByRole("button", { name: "Save order", exact: true }).click();
    await expect(
      page.getByText("NM order saved.", { exact: true }),
    ).toBeVisible();
    const after = await (await context.request.get(publicApi)).json();
    expect(after.publishedAt).toBe(before.publishedAt);
    expect(
      after.entries.filter((e: { category: string }) => e.category === "NM")[0]
        .id,
    ).toBe(before.entries[1].id);
    await db()
      .update(mappools)
      .set({ lockedAt: new Date() })
      .where(eq(mappools.id, pool.id));
    await page.reload();
    await expect(
      page.getByText(/referenced by a completed fixture/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Move NM1 down", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: "Publish pool", exact: true }),
    ).toHaveCount(0);
  });
});
