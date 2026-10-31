import { test, expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { teams } from "../../src/db/schema";
import { seedSession } from "./session";
import { seedBrowserEditions } from "./setup";
import { seedResultReview } from "../fixtures/results";
import { seedPublicDirectory } from "../fixtures/players";
import { assertTestDatabase } from "../database";
const origin = process.env.OCLR_TEST_ORIGIN || "http://127.0.0.1:3100";
test.describe("count-first group assignment", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterEach(seedBrowserEditions);
  test.afterAll(closeDb);
  test("generates two cards, saves team choices and safely reduces the group count", async ({
    page,
    context,
    isMobile,
  }, info) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const admin = isMobile ? 70001 : 60001;
    await context.addCookies([await seedSession(admin)]);
    await seedSession(60101);
    const seeded = await seedResultReview(admin, 60101, 5510000);
    const c = await seedPublicDirectory(5510100),
      d = await seedPublicDirectory(5510200);
    await db()
      .update(teams)
      .set({ identityPublished: false, rosterPublished: false })
      .where(eq(teams.id, d.teamId));
    let writes = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/matches"))
        writes++;
    });
    await page.goto("/admin/tournaments/test-cup/teams");
    await expect(
      page.getByRole("table", { name: "Team management", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#captains")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Configure captain teams",
        exact: true,
      }),
    ).toHaveCount(0);
    const board = page.locator(".group-assignment");
    await expect(
      board.getByLabel("Group count", { exact: true }).locator("option"),
    ).toHaveText(["Choose group count", "No groups", "1", "2", "3", "4"]);
    await board.getByLabel("Group count", { exact: true }).selectOption("2");
    await board
      .getByRole("button", { name: "Generate groups", exact: true })
      .click();
    const a = board.getByRole("article", { name: "Group A", exact: true }),
      b = board.getByRole("article", { name: "Group B", exact: true });
    await a.getByRole("combobox").selectOption(seeded.home.teamId);
    await a.getByRole("combobox").selectOption(seeded.away.teamId);
    await b.getByRole("combobox").selectOption(c.teamId);
    await b.getByRole("combobox").selectOption(d.teamId);
    expect(writes).toBe(0);
    await expect(b.getByText("Unpublished", { exact: true })).toBeVisible();
    await board
      .getByRole("button", { name: "Save group assignments", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await expect(board.locator(".group-assignment-card")).toHaveCount(2);
    const aBox = await a.boundingBox(),
      bBox = await b.boundingBox();
    expect(aBox).not.toBeNull();
    expect(bBox).not.toBeNull();
    if (!isMobile) expect(Math.abs(aBox!.y - bBox!.y)).toBeLessThan(2);
    else expect(bBox!.y).toBeGreaterThan(aBox!.y);
    const before = await (
      await context.request.get("/api/admin/tournaments/test-cup/matches")
    ).json();
    const stage = before.stages.find(
      (s: { kind: string }) => s.kind === "group",
    );
    expect(stage.groupsPublishedAt).toBeNull();
    expect(
      stage.groupConfiguration.groups.map(
        (g: { teamIds: string[] }) => g.teamIds,
      ),
    ).toEqual([
      [seeded.home.teamId, seeded.away.teamId],
      [c.teamId, d.teamId],
    ]);
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, url: origin },
      ]);
      await page.reload();
      await page.getByRole("heading", { level: 1 }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`groups-${theme}.png`),
        fullPage: true,
      });
    }
    for (const locale of ["zh-Hans", "zh-Hant"]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, url: origin },
      ]);
      await page.reload();
      await board.screenshot({ path: info.outputPath(`groups-${locale}.png`) });
      await expect(board).not.toContainText("Choose the number of groups");
    }
    await context.addCookies([
      { name: "oclr-locale", value: "en", url: origin },
    ]);
    await page.reload();
    await board.getByLabel("Group count", { exact: true }).selectOption("1");
    await board
      .getByRole("button", { name: "Apply group count", exact: true })
      .click();
    await expect(board.getByRole("alert")).toContainText(
      "Teams in removed groups",
    );
    await board
      .getByRole("alert")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(board.locator(".group-assignment-card")).toHaveCount(2);
    await board.getByLabel("Group count", { exact: true }).selectOption("1");
    await board
      .getByRole("button", { name: "Apply group count", exact: true })
      .click();
    await board
      .getByRole("alert")
      .getByRole("button", { name: "Apply group count", exact: true })
      .click();
    expect(writes).toBe(1);
    const unchanged = await (
      await context.request.get("/api/admin/tournaments/test-cup/matches")
    ).json();
    expect(
      unchanged.stages.find((s: { kind: string }) => s.kind === "group")
        .groupConfiguration.groups,
    ).toHaveLength(2);
    await expect(
      board
        .getByRole("region", { name: "Unassigned teams", exact: true })
        .locator(".group-team-card"),
    ).toHaveCount(2);
    await board
      .getByRole("button", { name: "Save group assignments", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    const after = await (
      await context.request.get("/api/admin/tournaments/test-cup/matches")
    ).json();
    const final = after.stages.find(
      (s: { kind: string }) => s.kind === "group",
    );
    expect(final.groupConfiguration.groups).toEqual([
      stage.groupConfiguration.groups[0],
    ]);
    expect(final.version).toBe(stage.version + 1);
    expect(final.groupsPublishedAt).toBeNull();
    expect(writes).toBe(2);
  });
});
