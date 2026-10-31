import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db, closeDb } from "../../src/db";
import {
  captains,
  fixtures,
  memberships,
  staffRoles,
  teams,
  tournamentRounds,
  tournamentStages,
} from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { seedSession } from "./session";
import { englishStorage } from "../fixtures/preferences";
test.describe("Schedule requests #591", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("players fill slots and captains obtain independent staff approval", async ({
    page,
    context,
    browser,
    isMobile,
    baseURL,
  }, info) => {
    test.setTimeout(150000);
    const actorBase = 59100000000 + parseInt(randomUUID().slice(0, 8), 16) * 10,
      adminId = actorBase + 3;
    const [playerCookie, aCookie, bCookie, adminCookie] = await Promise.all(
      [actorBase, actorBase + 1, actorBase + 2, adminId].map(seedSession),
    );
    const slug = `schedule-${isMobile ? "mobile" : "desktop"}-${randomUUID().slice(0, 8)}-test`;
    await seedEditions([{ ...edition, slug }]);
    await db().insert(staffRoles).values({
      userId: adminId,
      role: "admin",
      editionSlug: slug,
      grantedBy: adminId,
    });
    await db()
      .insert(captains)
      .values([
        {
          editionSlug: slug,
          userId: actorBase + 1,
          position: 1,
          published: true,
        },
        {
          editionSlug: slug,
          userId: actorBase + 2,
          position: 2,
          published: true,
        },
      ]);
    const teamRows = await db()
      .insert(teams)
      .values(
        [1, 2].map((n) => ({
          editionSlug: slug,
          captainId: actorBase + n,
          name: `Synthetic team ${n} ${"Long name 中文隊伍 ".repeat(5)}`,
          identityPublished: true,
          rosterPublished: true,
          finalizedAt: new Date(),
        })),
      )
      .returning();
    await db()
      .insert(memberships)
      .values(
        [0, 1, 2].map((n) => ({
          editionSlug: slug,
          teamId: teamRows[n === 2 ? 1 : 0].id,
          userId: actorBase + n,
          origin: "draft",
        })),
      );
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: slug, kind: "group" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: slug,
        stageId: stage.id,
        name: "Schedule test round",
        position: 1,
      })
      .returning();
    const [f] = await db()
      .insert(fixtures)
      .values({
        editionSlug: slug,
        roundId: round.id,
        label: "Synthetic schedule fixture",
        homeTeamId: teamRows[0].id,
        awayTeamId: teamRows[1].id,
        timeZone: "Asia/Taipei",
        scheduledAt: new Date("2090-01-01T12:00:00Z"),
        position: 1,
        publishedAt: new Date(),
      })
      .returning();
    await context.addCookies([playerCookie]);
    const route = `/tournaments/${slug}/schedule/requests`,
      endpoint = `/api/tournaments/${slug}/schedule/requests`;
    const b = await browser.newContext({
        baseURL,
        storageState: englishStorage,
      }),
      staff = await browser.newContext({
        baseURL,
        storageState: englishStorage,
      }),
      guest = await browser.newContext({ baseURL });
    await b.addCookies([bCookie]);
    await staff.addCookies([adminCookie]);
    try {
      expect((await guest.request.get(endpoint)).status()).toBe(401);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(route);
      await expect(page.locator(".schedule-calendar-root")).toBeVisible();
      const timeGrid = page.locator(".schedule-time-scroller");
      await expect(timeGrid).toBeVisible();
      const scrollBefore = await timeGrid.evaluate((el) => el.scrollTop);
      await timeGrid.focus();
      await page.keyboard.press("PageUp");
      await expect
        .poll(() => timeGrid.evaluate((el) => el.scrollTop))
        .toBeLessThan(scrollBefore);
      if (!isMobile) {
        const box = (await timeGrid.boundingBox())!;
        const column = (await page
          .locator(".schedule-day-lane")
          .first()
          .boundingBox())!;
        const x = column.x + column.width / 2,
          y = box.y + 100;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, y + 60, { steps: 8 });
        await page.mouse.up();
        await expect(page.locator(".schedule-slots li")).toHaveCount(1);
        await page.getByRole("button", { name: "Remove", exact: true }).click();
      }
      await page
        .getByLabel("Available from: date", { exact: true })
        .fill("2090-01-02");
      await page
        .getByLabel("Available from: time (HH:mm)", { exact: true })
        .fill("19:00");
      await page
        .getByLabel("Available until: date", { exact: true })
        .fill("2090-01-02");
      await page
        .getByLabel("Available until: time (HH:mm)", { exact: true })
        .fill("22:00");
      await page
        .getByRole("button", { name: "Add time slot", exact: true })
        .click();
      const save = page.waitForResponse(
        (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Save availability", exact: true })
        .click();
      expect((await save).status()).toBe(200);
      await page.reload();
      await expect(page.locator(".schedule-slots li")).toHaveCount(1);
      const snapshot = await (await page.request.get(endpoint)).json();
      const own = snapshot.fixtures.find((x: { id: string }) => x.id === f.id);
      expect(
        (
          await page.request.post(endpoint, {
            headers: { origin: baseURL! },
            data: {
              action: "availability",
              fixtureId: f.id,
              expectedFixtureVersion: own.version,
              expectedVersion: own.ownAvailability.version,
              requestKey: randomUUID(),
              intervals: own.ownAvailability.intervals,
            },
          })
        ).status(),
      ).toBe(200);
      const staleReply = page.waitForResponse(
        (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Save availability", exact: true })
        .click();
      expect((await staleReply).status()).toBe(409);
      await expect(
        page.locator(".schedule-tool").getByRole("alert"),
      ).toContainText("Reload before continuing");
      const reloadReply = page.waitForResponse(
        (r) => r.url().endsWith(endpoint) && r.request().method() === "GET",
      );
      await page
        .getByRole("button", { name: "Reload schedule", exact: true })
        .click();
      await reloadReply;
      await expect(
        page.locator(".schedule-tool").getByRole("alert"),
      ).toHaveCount(0);
      await page
        .locator(".schedule-slots")
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await page
        .getByLabel("Available from: time (HH:mm)", { exact: true })
        .fill("19:30");
      await page
        .getByRole("button", { name: "Update time slot", exact: true })
        .click();
      await page
        .getByLabel("Available from: date", { exact: true })
        .fill("2090-01-02");
      await page
        .getByLabel("Available from: time (HH:mm)", { exact: true })
        .fill("23:30");
      await page
        .getByLabel("Available until: date", { exact: true })
        .fill("2090-01-03");
      await page
        .getByLabel("Available until: time (HH:mm)", { exact: true })
        .fill("01:00");
      await page
        .getByRole("button", { name: "Add time slot", exact: true })
        .click();
      await expect(page.locator(".schedule-slots li")).toHaveCount(2);
      const modifiedReply = page.waitForResponse(
        (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Save availability", exact: true })
        .click();
      expect((await modifiedReply).status()).toBe(200);
      await page.reload();
      await expect(page.locator(".schedule-slots li")).toHaveCount(2);
      const savedSlots = (
        await (await page.request.get(endpoint)).json()
      ).fixtures.find((x: { id: string }) => x.id === f.id).ownAvailability
        .intervals;
      expect(savedSlots).toEqual([
        { start: "2090-01-02T11:30:00.000Z", end: "2090-01-02T14:00:00.000Z" },
        { start: "2090-01-02T15:30:00.000Z", end: "2090-01-02T17:00:00.000Z" },
      ]);
      await page
        .locator(".schedule-slots li")
        .last()
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      const removedReply = page.waitForResponse(
        (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Save availability", exact: true })
        .click();
      expect((await removedReply).status()).toBe(200);
      await page.reload();
      await expect(page.locator(".schedule-slots li")).toHaveCount(1);
      expect(errors).toEqual([]);
      await expect(
        page.getByRole("button", { name: "Send time proposal", exact: true }),
      ).toHaveCount(0);
      const rival = await (await b.request.get(endpoint)).json();
      expect(JSON.stringify(rival)).not.toContain("2090-01-02T11:00:00.000Z");
      await context.addCookies([aCookie]);
      await page.goto(route);
      await expect(
        page.getByRole("heading", { name: "Team availability", exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Proposed start: date", { exact: true })
        .fill("2090-01-02");
      await page
        .getByLabel("Proposed start: time (HH:mm)", { exact: true })
        .fill("20:00");
      await page
        .getByRole("button", { name: "Send time proposal", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(page.locator(".schedule-proposal-box .badge")).toBeVisible();
      const before = await (await staff.request.get(endpoint)).json();
      expect(before.fixtures[0].scheduledAt).toBe("2090-01-01T12:00:00.000Z");
      const rivalPage = await b.newPage();
      await rivalPage.goto(route);
      await rivalPage
        .getByRole("button", { name: "Agree and submit to staff", exact: true })
        .click();
      await rivalPage
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(
        rivalPage.locator(".schedule-proposal-box .badge"),
      ).toHaveText("Awaiting staff review");
      const staffPage = await staff.newPage();
      await staffPage.goto(
        `/admin/tournaments/${slug}/matches/schedule-requests`,
      );
      await staffPage
        .getByRole("button", { name: "Approve schedule change", exact: true })
        .click();
      const approvalReply = staffPage.waitForResponse(
        (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
      );
      await staffPage
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      expect((await approvalReply).status()).toBe(200);
      await staffPage
        .getByLabel("Request status", { exact: true })
        .selectOption("all");
      await expect(
        staffPage.locator(".schedule-editor details summary").first(),
      ).toBeVisible();
      const final = await (await staff.request.get(endpoint)).json();
      expect(final.fixtures[0].scheduledAt).toBe("2090-01-02T12:00:00.000Z");
      expect(final.requests[0].status).toBe("approved");
      await page.reload();
      await expect(page.locator(".schedule-calendar-root")).toBeVisible();
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath(`schedule-${theme}.png`),
          fullPage: true,
        });
      }
      for (const locale of ["zh-Hans", "zh-Hant"]) {
        await context.addCookies([
          {
            name: "oclr-locale",
            value: locale,
            domain: "127.0.0.1",
            path: "/",
          },
        ]);
        await page.reload();
        await expect(page.locator(".schedule-calendar-root")).toBeVisible();
        if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath(`schedule-${locale}.png`),
          fullPage: true,
        });
      }
      const a11y = await new AxeBuilder({ page })
        .include(".schedule-tool")
        .disableRules(["color-contrast"])
        .analyze();
      expect(a11y.violations).toEqual([]);
      expect(errors).toEqual([]);
      const csrf = await page.request.post(endpoint, {
        headers: { origin: "https://invalid.example" },
        data: { action: "propose", fixtureId: f.id, requestKey: randomUUID() },
      });
      expect(csrf.status()).toBe(403);
    } finally {
      await b.close();
      await staff.close();
      await guest.close();
    }
  });
});
