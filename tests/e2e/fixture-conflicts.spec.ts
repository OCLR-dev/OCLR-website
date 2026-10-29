import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import { fixtureCommand } from "../../src/lib/fixtures";
import { mappoolCommand } from "../../src/lib/mappools";
import { assertTestDatabase } from "../database";
import { seedSession } from "./session";
import { englishStorage } from "../fixtures/preferences";

const endpoint = "/api/admin/tournaments/test-cup/matches";
const headers = { origin: "http://127.0.0.1:3100" };
const actor = { osuId: 60001, username: "Synthetic fixture Admin" };
const initial = {
  label: "Synthetic conflict fixture",
  homeTeamId: null,
  awayTeamId: null,
  mappoolId: null,
  position: 1,
  scheduledAt: null,
  timeZone: "UTC",
  status: "scheduled",
  homeSourceId: null,
  homeSourceOutcome: null,
  awaySourceId: null,
  awaySourceOutcome: null,
  confirmed: true,
};
const editor = (page: Page) => page.locator("dialog.fixture-editor-dialog");
const button = (page: Page, name: string) =>
  editor(page).getByRole("button", { name, exact: true });
async function openEditor(page: Page) {
  await page.goto("/admin/tournaments/test-cup/matches");
  await page
    .getByRole("button", { name: "Manage fixture", exact: true })
    .click();
}
async function post(context: BrowserContext, data: Record<string, unknown>) {
  const response = await context.request.post(endpoint, { headers, data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
}

test.describe("fixture editor snapshot recovery", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  let fixtureId: string, roundId: string;
  test.beforeEach(async ({ context }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ADMIN_OSU_IDS = String(actor.osuId);
    await db().execute(sql`TRUNCATE tournament_stages CASCADE`);
    await context.addCookies([await seedSession(actor.osuId)]);
    const pools = await mappoolCommand(actor, "test-cup", {
      action: "round_create",
      stage: "group",
      name: "Synthetic conflict round",
      position: 1,
      confirmed: true,
    });
    roundId = pools.rounds[0].id;
    const workspace = await fixtureCommand(actor, "test-cup", {
      ...initial,
      action: "create",
      roundId,
    });
    fixtureId = workspace.fixtures[0].id;
  });
  test.afterAll(async () => closeDb());

  test("409 preserves the draft, then explicitly reloads all fields and publication before saving", async ({
    page,
    context,
    browser,
  }, info) => {
    const other = await browser.newContext({ storageState: englishStorage });
    await other.addCookies([await seedSession(70001)]);
    try {
      await openEditor(page);
      await editor(page)
        .getByLabel("Fixture label", { exact: true })
        .fill("My unsaved draft");
      await post(other, {
        ...initial,
        action: "edit",
        fixtureId,
        roundId,
        expectedVersion: 0,
        label: "Other operator's update",
        status: "cancelled",
        position: 7,
        scheduledAt: "2026-11-04T08:30:00.000Z",
        timeZone: "Asia/Taipei",
      });
      await post(other, {
        action: "publish",
        fixtureId,
        expectedVersion: 1,
        published: true,
        confirmed: true,
      });
      const conflict = page.waitForResponse(
        (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
      );
      await button(page, "Save fixture amendment").click();
      expect((await conflict).status()).toBe(409);
      await expect(
        editor(page)
          .getByRole("alert")
          .filter({ hasText: "Your unsaved draft" }),
      ).toBeVisible();
      await expect(
        editor(page).getByLabel("Fixture label", { exact: true }),
      ).toHaveValue("My unsaved draft");
      for (const name of [
        "Save fixture amendment",
        "Publish fixture",
        "Delete fixture",
      ])
        await expect(button(page, name)).toBeDisabled();
      await expect(
        editor(page)
          .getByRole("alert")
          .filter({ hasText: "Your unsaved draft" }),
      ).toBeFocused();
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          colorScheme,
        );
        expect(
          await editor(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`fixture-conflict-${colorScheme}.png`),
          fullPage: true,
        });
      }
      await button(page, "Load latest fixture version").click();
      await expect(
        editor(page).getByLabel("Fixture label", { exact: true }),
      ).toHaveValue("Other operator's update");
      await expect(
        editor(page).getByRole("combobox", {
          name: "Fixture status",
          exact: true,
        }),
      ).toHaveValue("cancelled");
      await expect(
        editor(page).getByLabel("Fixture order within round", { exact: true }),
      ).toHaveValue("7");
      await expect(button(page, "Unpublish fixture")).toBeEnabled();
      await expect(button(page, "Delete fixture")).toBeDisabled();
      await expect(editor(page).getByRole("alert")).toHaveCount(0);
      await editor(page)
        .getByLabel("Fixture label", { exact: true })
        .fill("Reviewed amendment");
      const saved = page.waitForResponse(
        (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
      );
      await button(page, "Save fixture amendment").click();
      const response = await saved;
      expect(response.request().postDataJSON()).toMatchObject({
        expectedVersion: 2,
        label: "Reviewed amendment",
        status: "cancelled",
        position: 7,
        scheduledAt: "2026-11-04T08:30:00.000Z",
        timeZone: "Asia/Taipei",
      });
      expect(response.status()).toBe(200);
      await expect(editor(page)).not.toBeVisible();
      const workspace = await (await context.request.get(endpoint)).json();
      expect(workspace.fixtures[0]).toMatchObject({
        label: "Reviewed amendment",
        version: 3,
        status: "cancelled",
      });
      expect(workspace.fixtures[0].publishedAt).not.toBeNull();
    } finally {
      await other.close();
    }
  });

  test("publication conflicts close stale confirmations and reload the current action", async ({
    page,
    context,
  }) => {
    await openEditor(page);
    await button(page, "Publish fixture").click();
    await post(context, {
      action: "publish",
      fixtureId,
      expectedVersion: 0,
      published: true,
      confirmed: true,
    });
    await confirm(page);
    await expect(button(page, "Load latest fixture version")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm", exact: true }),
    ).toHaveCount(0);
    await button(page, "Load latest fixture version").click();
    await button(page, "Unpublish fixture").click();
    const saved = page.waitForResponse(
      (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
    );
    await confirm(page);
    const response = await saved;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({
      expectedVersion: 1,
      published: false,
    });
    await expect(editor(page)).not.toBeVisible();
  });

  test("deletion reloads assignment revisions even when the fixture version is unchanged", async ({
    page,
    context,
  }) => {
    await openEditor(page);
    await button(page, "Delete fixture").click();
    const assigned = await context.request.patch(
      `${endpoint}/${fixtureId}/referees`,
      {
        headers,
        data: { expectedAssignmentRevision: 0, refereeIds: [actor.osuId] },
      },
    );
    expect(assigned.status()).toBe(200);
    await confirm(page);
    await expect(button(page, "Load latest fixture version")).toBeVisible();
    await expect(button(page, "Delete fixture")).toBeDisabled();
    await button(page, "Load latest fixture version").click();
    await button(page, "Delete fixture").click();
    const deleted = page.waitForResponse(
      (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
    );
    await confirm(page);
    const response = await deleted;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({
      expectedVersion: 0,
      expectedAssignmentRevision: 1,
    });
    await expect(editor(page)).not.toBeVisible();
    await expect(
      page.getByText("Fixture deleted.", { exact: true }),
    ).toBeVisible();
  });

  test("a deleted fixture disables the retained draft and allows safely closing it", async ({
    page,
    context,
  }) => {
    await openEditor(page);
    await post(context, {
      action: "delete",
      fixtureId,
      expectedVersion: 0,
      expectedAssignmentRevision: 0,
      confirmed: true,
    });
    await button(page, "Save fixture amendment").click();
    await expect(
      editor(page).getByText("This fixture is no longer available.", {
        exact: true,
      }),
    ).toBeVisible();
    for (const name of [
      "Save fixture amendment",
      "Publish fixture",
      "Delete fixture",
    ])
      await expect(button(page, name)).toBeDisabled();
    await expect(button(page, "Load latest fixture version")).toHaveCount(0);
    await button(page, "Close").click();
    await expect(editor(page)).not.toBeVisible();
  });

  test("revoked management access cannot confirm an already open mutation", async ({
    page,
    context,
  }) => {
    const staffId = 60444;
    await context.clearCookies();
    await context.addCookies([await seedSession(staffId)]);
    await db().insert(staffRoles).values({
      userId: staffId,
      role: "admin",
      editionSlug: "test-cup",
      grantedBy: actor.osuId,
    });
    await openEditor(page);
    await button(page, "Publish fixture").click();
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, staffId));
    const denied = page.waitForResponse(
      (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
    );
    await confirm(page);
    expect((await denied).status()).toBe(403);
    await expect(editor(page)).not.toBeVisible();
    const rows = await db().execute(
      sql`SELECT version, published_at FROM fixtures WHERE id = ${fixtureId}`,
    );
    expect(rows.rows[0]).toMatchObject({ version: 0, published_at: null });
  });
});
