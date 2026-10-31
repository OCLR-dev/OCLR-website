import { test, expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { teams, fixtures, editionState } from "../../src/db/schema";
import { seedSession } from "./session";
import { seedBrowserEditions } from "./setup";
import { seedResultReview } from "../fixtures/results";
import { assertTestDatabase } from "../database";
const origin = process.env.OCLR_TEST_ORIGIN || "http://127.0.0.1:3100";
test.describe("team configuration batch #543–#546", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterEach(seedBrowserEditions);
  test.afterAll(closeDb);
  test("configures coaching and groups in teams, and saves unpublished opponents privately", async ({
    page,
    context,
    isMobile,
  }, info) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const adminId = isMobile ? 70001 : 60001;
    await context.addCookies([await seedSession(adminId)]);
    await seedSession(60101);
    const seeded = await seedResultReview(adminId, 60101, 1570000);
    await db().execute(sql`TRUNCATE fixtures CASCADE`);
    await db()
      .update(teams)
      .set({ identityPublished: false, rosterPublished: false })
      .where(eq(teams.id, seeded.home.teamId));
    await page.goto("/admin/tournaments/test-cup/settings");
    const coaching = page.getByRole("checkbox", {
      name: "Enable coaches for this tournament",
      exact: true,
    });
    await expect(coaching).toBeChecked();
    await coaching.uncheck();
    await page
      .getByRole("button", { name: "Save general settings", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "saved" }),
    ).toContainText("saved");
    await page.reload();
    await expect(coaching).not.toBeChecked();
    await page.goto("/admin/tournaments/test-cup/teams");
    await expect(page.getByLabel("Coach osu! ID", { exact: true })).toHaveCount(
      0,
    );
    const groups = page.locator(".team-group-manager").first();
    await groups.getByLabel("Group count", { exact: true }).selectOption("1");
    await groups
      .getByRole("button", { name: "Generate groups", exact: true })
      .click();
    await groups
      .getByLabel("Group name 1", { exact: true })
      .fill("Synthetic group A");
    const picker = groups.getByRole("combobox", { name: /^Add team to/ });
    await picker.selectOption(seeded.home.teamId);
    await picker.selectOption(seeded.away.teamId);
    await groups
      .getByRole("button", { name: "Save group assignments", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await expect(
      groups.getByLabel("Group name 1", { exact: true }),
    ).toHaveValue("Synthetic group A");
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, url: origin },
      ]);
      await page.reload();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("heading", { level: 1 }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`teams-${theme}.png`),
        fullPage: true,
      });
    }
    await page.goto("/admin/tournaments/test-cup/matches");
    await page.goto("/admin/tournaments/test-cup/rounds");
    await page
      .getByRole("button", { name: "Edit round", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Add group", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "Configure groups in team management",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/admin/tournaments/test-cup/matches");
    await page
      .getByRole("button", { name: "Create a fixture", exact: true })
      .click();
    await page
      .getByLabel("Fixture label", { exact: true })
      .fill("Synthetic private matchup");
    await page
      .getByRole("combobox", { name: /^Red Team/ })
      .selectOption(seeded.home.teamId);
    await page
      .getByRole("combobox", { name: /^Blue Team/ })
      .selectOption(seeded.away.teamId);
    await expect(
      page
        .getByRole("combobox", { name: /^Red Team/ })
        .locator("option:checked"),
    ).toContainText("Unpublished");
    await page
      .getByRole("button", { name: "Create fixture", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Synthetic private matchup",
        exact: true,
      }),
    ).toBeVisible();
    const saved = await db().select().from(fixtures);
    expect(saved[0]).toMatchObject({
      homeTeamId: seeded.home.teamId,
      awayTeamId: seeded.away.teamId,
      publishedAt: null,
    });
    const state = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, "test-cup"));
    expect(state[0].configuration).toMatchObject({ coachesEnabled: false });
    await page.goto("/admin/tournaments/test-cup/settings");
    await coaching.check();
    await page
      .getByRole("button", { name: "Save general settings", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "saved" }),
    ).toContainText("saved");
    await page.goto("/admin/tournaments/test-cup/teams");
    await expect(page.getByLabel("Coach osu! ID", { exact: true })).toHaveCount(
      2,
    );
    await page.getByRole("heading", { level: 1 }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("teams-coaching-enabled.png"),
      fullPage: true,
    });
  });
});
