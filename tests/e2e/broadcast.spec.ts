import { englishStorage } from "../fixtures/preferences";
import { assertTestDatabase } from "../database";
import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { createSession } from "../../src/lib/auth/sessions";
import { prepareDraft } from "../fixtures/draft";
import type { DraftBoard } from "../../src/lib/draft-types";

const testUrl = process.env.TEST_DATABASE_URL;
test.describe("published OBS browser-source rehearsal", () => {
  test.skip(!testUrl, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  const actors: BrowserContext[] = [];
  test.beforeAll(() => {
    assertTestDatabase(testUrl);
    process.env.DATABASE_URL = testUrl;
    process.env.ADMIN_OSU_IDS = "110001,120001";
  });
  test.beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  });
  test.afterEach(async () => {
    for (const actor of actors.splice(0)) await actor.close();
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  });
  test.afterAll(async () => closeDb());
  test("both pick modes publish safely, recover, correct and finalize without replay or mutations from viewers", async ({
    page,
    browser,
    context,
    isMobile,
  }) => {
    const slug = isMobile ? "draft-mobile-test" : "draft-desktop-test";
    const fixture = await prepareDraft(slug, isMobile ? 120001 : 110001, 4);
    const origin = "http://127.0.0.1:3100";
    const endpoint = `/api/tournaments/${slug}/draft`;
    const adminEndpoint = `/api/admin/tournaments/${slug}/draft`;
    const overlay = `/tournaments/${slug}/draft/overlay`;
    async function actor(userId: number) {
      const next = await browser.newContext({
        storageState: englishStorage,
        baseURL: origin,
      });
      actors.push(next);
      const session = await createSession(userId);
      await next.addCookies([
        {
          name: "oclr_session",
          value: session.token,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      return next;
    }
    const staff = await actor(fixture.staff.osuId);
    const captain = await actor(fixture.a.osuId);
    async function state() {
      return (await staff.request.get(adminEndpoint)).json();
    }
    async function command(action: string) {
      const { session } = await state();
      const response = await staff.request.post(adminEndpoint, {
        headers: { origin },
        data: {
          command: { action },
          expectedVersion: session.version,
          confirmed: true,
        },
      });
      expect(response.status()).toBe(200);
    }
    async function pick(caller: BrowserContext, playerId: number) {
      const { session } = await state();
      const response = await caller.request.post(`${endpoint}/picks`, {
        headers: { origin },
        data: {
          sessionId: session.id,
          turnIndex: session.turnIndex,
          candidateId: playerId,
          expectedVersion: session.version,
          idempotencyKey: randomUUID(),
        },
      });
      expect(response.status()).toBe(200);
    }
    const initial: DraftBoard = await (
      await context.request.get(endpoint)
    ).json();
    if (!isMobile) await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const response = await page.goto(overlay);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    const selection = page.getByRole("region", {
      name: "Latest published selection",
    });
    const current = page.getByRole("region", {
      name: "Current published captain turn",
    });
    await expect(current).toContainText(
      fixture.teamRows.find(({ captainId }) => captainId === fixture.a.osuId)!
        .name,
    );
    await expect(page.locator(".site-header")).toBeHidden();
    await expect(page.getByRole("button")).toHaveCount(0);
    expect(
      await page
        .locator("[data-broadcast]")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(9, 12, 23)");
    await expect(selection).toContainText(
      "Selections appear here when published.",
    );
    await pick(captain, fixture.players[0].osuId);
    await page.waitForResponse(
      (res) => new URL(res.url()).pathname === endpoint && res.status() === 200,
    );
    await expect(selection).toContainText(fixture.players[0].username);
    const withheld = await (await context.request.get(overlay)).text();
    expect(withheld).toContain(fixture.players[0].username);
    expect(withheld).not.toContain(fixture.staff.username);
    expect(withheld).not.toContain(fixture.players[7].username);
    await expect(
      selection.getByRole("heading", {
        name: fixture.players[0].username,
        exact: true,
      }),
    ).toBeVisible();
    await expect(selection).toContainText(
      fixture.teamRows.find(({ captainId }) => captainId === fixture.a.osuId)!
        .name,
    );
    await expect(current).toContainText(
      fixture.teamRows.find(({ captainId }) => captainId === fixture.b.osuId)!
        .name,
    );

    // A lagging response must never rewind the already displayed published turn.
    await page.route(`**${endpoint}*`, (route) =>
      route.fulfill({ json: initial }),
    );
    await page.waitForResponse(
      (res) => new URL(res.url()).pathname === endpoint,
    );
    await expect(selection).toContainText(fixture.players[0].username);
    await page.unroute(`**${endpoint}*`);
    await page.reload();
    expect(await selection.evaluate((el) => el.getAnimations().length)).toBe(0);
    await context.setOffline(true);
    await expect(page.getByRole("status")).toContainText("Reconnecting");
    await expect(selection).toContainText(fixture.players[0].username);
    await pick(staff, fixture.players[1].osuId);
    await context.setOffline(false);
    await expect(page.getByRole("status")).toContainText("Connected");
    await expect(selection).toContainText(fixture.players[1].username);
    await expect(
      selection.getByRole("heading", {
        name: fixture.players[1].username,
        exact: true,
      }),
    ).toBeVisible();
    await expect(selection).toContainText(
      fixture.teamRows.find(({ captainId }) => captainId === fixture.b.osuId)!
        .name,
    );
    await expect(page.locator("[data-broadcast]")).not.toContainText(
      fixture.staff.username,
    );
    await expect(current).toContainText(
      fixture.teamRows.find(({ captainId }) => captainId === fixture.a.osuId)!
        .name,
    ); // Explicit repeating order, A → B → A → B.

    await command("pause");
    await expect(page.locator("[data-state]")).toHaveText("Paused");
    await command("undo");
    await page.waitForResponse(
      (res) => new URL(res.url()).pathname === endpoint,
    );
    await expect(
      selection.getByRole("heading", {
        name: fixture.players[0].username,
        exact: true,
      }),
    ).toBeVisible();
    expect(await selection.evaluate((el) => el.getAnimations().length)).toBe(0); // Correction does not re-reveal an old pick.
    await command("resume");
    await pick(staff, fixture.players[1].osuId);
    await expect(
      selection.getByRole("heading", {
        name: fixture.players[1].username,
        exact: true,
      }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await pick(captain, fixture.players[2].osuId);
    await expect(
      selection.getByRole("heading", {
        name: fixture.players[2].username,
        exact: true,
      }),
    ).toBeVisible();
    expect(await selection.evaluate((el) => el.getAnimations().length)).toBe(0);
    await pick(staff, fixture.players[3].osuId);
    await expect(page.locator("[data-state]")).toHaveText("Draft completed");
    await command("finalize");
    await expect(page.locator("[data-state]")).toHaveText("Rosters finalized");
    await expect(current).toContainText("Teams assembled.");
    await expect(
      page.getByRole("region", { name: "Draft results" }).getByRole("listitem"),
    ).toHaveCount(4);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    if (!isMobile)
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBe(1080);
    const before = (await state()).session;
    await page.goto(`${overlay}?background=transparent`);
    expect(
      await page
        .locator("[data-broadcast]")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      ),
    ).toBe("rgba(0, 0, 0, 0)");
    await page.reload();
    expect(await selection.evaluate((el) => el.getAnimations().length)).toBe(0);
    const body = await page.content();
    for (const privateValue of [
      fixture.staff.username,
      fixture.players[7].username,
      "Synthetic private broadcast approval/recovery reason.",
      "staff_on_behalf",
      "actorId",
      "requestKey",
    ])
      expect(body).not.toContain(privateValue);
    expect((await state()).session).toEqual(before);
    expect(
      (await context.cookies()).filter((c) => c.name.includes("session")),
    ).toHaveLength(0);
    for (const width of isMobile ? [320, 390] : [768, 1280, 1920]) {
      await page.setViewportSize({
        width,
        height: width === 1920 ? 1080 : 900,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    // Revoked publication must clear both an already-open overlay and its HTML.
    const teamEndpoint = `/api/admin/tournaments/${slug}/teams`;
    const setup = await (await staff.request.get(teamEndpoint)).json();
    const hidden = await staff.request.post(teamEndpoint, {
      headers: { origin },
      data: {
        command: {
          action: "publish",
          teamId: setup.teams[0].id,
          identityPublished: false,
          rosterPublished: false,
        },
        expectedVersion: setup.version,
        confirmed: true,
      },
    });
    expect(hidden.status()).toBe(200);
    await expect(
      selection.getByRole("heading", {
        name: "The stage is ready.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Player ratings" }).getByRole("figure"),
    ).toHaveCount(0);
    const retracted = await (await context.request.get(overlay)).text();
    for (const player of fixture.players)
      expect(retracted).not.toContain(player.username);
  });
});
