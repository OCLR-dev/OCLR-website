import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  editionEvents,
  users,
  registrations,
  userProfileCache,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { seedSession } from "./session";
test.describe("automatic staff auditing", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("saves captain order, teams and draft setup without reason fields or routine dialogs", async ({
    page,
    context,
    isMobile,
  }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    const adminId = isMobile ? 70001 : 60001;
    const base = isMobile ? 341101 : 341001;
    await context.addCookies([await seedSession(adminId)]);
    await db()
      .insert(users)
      .values(
        [0, 1, 2].map((i) => ({
          osuId: base + i,
          username: `Synthetic Setup ${i}`,
        })),
      );
    await db()
      .insert(registrations)
      .values(
        [0, 1, 2].map((i) => ({
          editionSlug: "test-cup",
          userId: base + i,
          status: "accepted" as const,
          rulesVersion: "test-v1",
          answers: {},
        })),
      );
    await context.route("**/api/osu-images/avatar/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#704594"/></svg>',
      }),
    );
    await db()
      .insert(userProfileCache)
      .values(
        [0, 1, 2].map((i) => ({
          osuId: base + i,
          mode: "osu",
          profile: normalizeOsuProfile(
            {
              ...profileResponse,
              id: base + i,
              username: `Synthetic Setup ${i}`,
            },
            base + i,
            "osu",
          ),
          attemptedAt: new Date(),
          retryAt: new Date(),
        })),
      );
    const captainPage = "/admin/tournaments/test-cup/captains";
    await page.goto("/admin/tournaments/test-cup/teams");
    await expect(
      page.getByRole("heading", { name: "No teams yet", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Save team configuration",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Appoint captains", exact: true })
      .click();
    await expect(page).toHaveURL(/\/teams#captains$/);
    await expect(
      page.getByRole("img", { name: "Taiwan flag", exact: true }),
    ).toHaveCount(3);
    await expect(
      page.locator('.captain-player-identity img[src^="/api/osu-images/avatar/"]'),
    ).toHaveCount(3);
    for (const id of [base, base + 1]) {
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/admin/tournaments/test-cup/captains") &&
          r.request().method() === "POST",
      );
      if (!isMobile && id === base)
        await page
          .locator(`[data-player-id="${id}"]`)
          .dragTo(
            page.getByLabel("Captain appointment area", { exact: true }),
            { sourcePosition: { x: 12, y: 12 } },
          );
      else
        await page
          .getByRole("button", {
            name: `Appoint Synthetic Setup ${id - base} as captain`,
            exact: true,
          })
          .click();
      expect((await response).status()).toBe(200);
      await expect(page.locator(`[data-captain-id="${id}"]`)).toHaveCount(1);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const unappointed = page.locator(`[data-captain-id="${base + 1}"]`);
    await unappointed
      .getByRole("button", { name: "Unappoint", exact: true })
      .click();
    const removal = page.getByRole("dialog", {
      name: "Unappoint Synthetic Setup 1?",
      exact: true,
    });
    await expect(removal).toBeVisible();
    await removal.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(unappointed).toHaveCount(1);
    expect(await db().select().from(editionEvents)).toHaveLength(2);
    await unappointed
      .getByRole("button", { name: "Unappoint", exact: true })
      .click();
    await removal.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(unappointed).toHaveCount(0);
    const returned = page.locator(`[data-player-id="${base + 1}"]`);
    await expect(returned).toBeVisible();
    await returned
      .getByRole("button", {
        name: "Appoint Synthetic Setup 1 as captain",
        exact: true,
      })
      .click();
    await expect(unappointed).toHaveCount(1);
    await page.goto("/admin/tournaments/test-cup/teams");
    await expect(page.getByRole("textbox", { name: /reason/i })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "No teams yet", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Configure captain teams",
        exact: true,
      }),
    ).toBeVisible();
    const names = page.getByLabel("Approved team name");
    await names.nth(0).fill("Synthetic Setup Team A");
    await names.nth(1).fill("Synthetic Setup Team B");
    await page.getByRole("button", { name: "Save team configuration" }).click();
    await expect(
      page.getByRole("row", {
        name: /Synthetic Setup Team A/,
      }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(captainPage);
    const first = page.locator(`[data-captain-id="${base}"]`),
      second = page.locator(`[data-captain-id="${base + 1}"]`);
    if (isMobile) {
      await page
        .getByRole("list", { name: "Captain selection order", exact: true })
        .scrollIntoViewIfNeeded();
      const handle = (await first
          .locator(".captain-drag-handle")
          .boundingBox())!,
        target = (await second.boundingBox())!;
      expect(target.y + target.height / 2).toBeLessThan(
        page.viewportSize()!.height,
      );
      const touch = await context.newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
        ],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: target.x + target.width / 2, y: target.y + target.height / 2 },
        ],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
    } else await first.dragTo(second, { sourcePosition: { x: 6, y: 6 } });
    await expect(
      page.getByText("Unsaved captain order.", { exact: true }),
    ).toBeVisible();
    for (const card of [first, second])
      await expect(
        card.getByRole("button", { name: "Unappoint", exact: true }),
      ).toBeDisabled();
    await page
      .getByRole("button", { name: "Save captain order", exact: true })
      .click();
    await expect(
      page.getByText("Unsaved captain order.", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".captain-order > li").first()).toHaveAttribute(
      "data-captain-id",
      String(base + 1),
    );
    // Keyboard/touch buttons provide the same ordering controls without requiring dragging.
    await page
      .getByRole("button", { name: "Move Synthetic Setup 1 down", exact: true })
      .click();
    await expect(page.locator(".captain-order > li").first()).toHaveAttribute(
      "data-captain-id",
      String(base),
    );
    await page
      .getByRole("button", { name: "Reset order", exact: true })
      .click();
    await expect(page.locator(".captain-order > li").first()).toHaveAttribute(
      "data-captain-id",
      String(base + 1),
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .getByRole("button", { name: "Lock draft setup", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Lock draft setup", exact: true })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByText("Setup locked", { exact: false }),
    ).toBeVisible();
    await expect(page.locator('.captain-board [draggable="true"]')).toHaveCount(
      0,
    );
    for (const card of [first, second])
      await expect(
        card.getByRole("button", { name: "Unappoint", exact: true }),
      ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Save captain order", exact: true }),
    ).toHaveCount(0);
    await page.goto("/admin/tournaments/test-cup/teams");
    await expect(page.getByRole("status")).toContainText(
      "Roster capacity is locked for the draft",
    );
    await expect(
      page.getByRole("button", {
        name: "Save team configuration",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Open live draft", exact: true })
      .click();
    await expect(page).toHaveURL(/\/test-cup\/draft$/);
    await expect(page.getByRole("textbox", { name: /reason/i })).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Order mode", exact: true })
      .selectOption("custom");
    await page.getByRole("button", { name: "Append captain order" }).click();
    await page.getByRole("button", { name: "Remove turn 2" }).click();
    await page
      .getByRole("button", { name: "Save draft configuration" })
      .click();
    await expect(
      page.getByRole("button", { name: "Start draft" }),
    ).toBeEnabled();
    const events = await db().select().from(editionEvents);
    expect(events).toHaveLength(8);
    for (const event of events) {
      expect(event.actorId).toBe(adminId);
      expect(event.reason).toBeNull();
      expect(event.createdAt).toBeInstanceOf(Date);
      expect(event.detail).toHaveProperty("entity");
      expect(event.detail).toHaveProperty("before");
      expect(event.detail).toHaveProperty("after");
    }
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining([
        "captain_appoint",
        "captain_revoke",
        "team_configure",
        "captain_order",
        "captain_lock",
        "draft_configure",
      ]),
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
  test("loads missing country identities only for visible cards and preserves unavailable states", async ({
    page,
    context,
    isMobile,
  }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    const base = isMobile ? 342101 : 342001;
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await db()
      .insert(users)
      .values(
        [0, 1].map((i) => ({
          osuId: base + i,
          username: `Synthetic Lazy ${i}`,
        })),
      );
    await db()
      .insert(registrations)
      .values(
        [0, 1].map((i) => ({
          editionSlug: "test-cup",
          userId: base + i,
          status: "accepted" as const,
          rulesVersion: null,
          answers: {},
        })),
      );
    const calls = new Map<number, number>();
    await context.route("**/api/admin/profiles", async (route) => {
      const id = Number(route.request().postDataJSON().input);
      calls.set(id, (calls.get(id) ?? 0) + 1);
      if (id === base + 1)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic provider outage" }),
        });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profile: normalizeOsuProfile({ ...profileResponse, id }, id, "osu"),
        }),
      });
    });
    const unavailableResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/profiles") &&
        response.request().method() === "POST" &&
        Number(response.request().postDataJSON().input) === base + 1,
    );
    await page.goto("/admin/tournaments/test-cup/captains");
    const available = page.locator(`[data-player-id="${base}"]`);
    await available.scrollIntoViewIfNeeded();
    await expect(
      available.getByRole("img", { name: "Taiwan flag", exact: true }),
    ).toBeVisible();
    const unavailable = page.locator(`[data-player-id="${base + 1}"]`);
    await unavailable.scrollIntoViewIfNeeded();
    expect((await unavailableResponse).status()).toBe(503);
    await expect(
      unavailable.getByText("Country unavailable", { exact: true }),
    ).toBeVisible();
    await expect(unavailable.getByRole("img")).toHaveCount(0);
    expect(calls.get(base)).toBe(1);
    expect(calls.get(base + 1)).toBe(1);
  });
});
