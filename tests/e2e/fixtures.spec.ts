import { englishStorage } from "../fixtures/preferences";
import { selectTimeZone } from "./time-zone";
import { openTournamentTool } from "./navigation";
import { captureResponsiveLayout } from "./responsive";
import { assertTestDatabase } from "../database";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  fixtureReferees,
  staffRoles,
  resultAuditEvents,
} from "../../src/db/schema";
import { seedSession } from "./session";
import { seedPublicDirectory } from "../fixtures/players";
import { mappoolCommand } from "../../src/lib/mappools";
test.describe("staff fixtures and referee assignments over HTTP", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("admin schedules, configures rules and assigns a referee without exposing private fixture data", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const url = process.env.TEST_DATABASE_URL!;
    assertTestDatabase(url);
    process.env.DATABASE_URL = url;
    await db().execute(sql`TRUNCATE tournament_stages CASCADE`);
    const adminId = isMobile ? 70001 : 60001;
    const refId = isMobile ? 275102 : 275002;
    const mapperId = refId + 1;
    const base = isMobile ? 270101 : 270001;
    const home = await seedPublicDirectory(base);
    const away = await seedPublicDirectory(base + 10);
    await context.addCookies([await seedSession(adminId)]);
    const refCookie = await seedSession(refId);
    const mapperCookie = await seedSession(mapperId);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: refId,
          role: "referee",
          editionSlug: "test-cup",
          grantedBy: adminId,
        },
        {
          userId: mapperId,
          role: "mappooler",
          editionSlug: "test-cup",
          grantedBy: adminId,
        },
      ]);
    process.env.ADMIN_OSU_IDS = String(adminId);
    let maps = await mappoolCommand(
      { osuId: adminId, username: "Synthetic Admin" },
      "test-cup",
      {
        action: "round_create",
        stage: "group",
        name: `Synthetic Fixture Round ${base}`,
        position: isMobile ? 802 : 801,
        confirmed: true,
      },
    );
    const round = maps.rounds.find(
      (r) => r.name === `Synthetic Fixture Round ${base}`,
    )!;
    maps = await mappoolCommand(
      { osuId: adminId, username: "Synthetic Admin" },
      "test-cup",
      {
        action: "pool_create",
        roundId: round.id,
        name: `Synthetic Fixture Pool ${base}`,
        confirmed: true,
      },
    );
    const pool = maps.pools.find((p) => p.roundId === round.id)!;
    const referee = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const guest = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const mapper = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    await referee.addCookies([refCookie]);
    await mapper.addCookies([mapperCookie]);
    const endpoint = "/api/admin/tournaments/test-cup/matches";
    const headers = { origin: "http://127.0.0.1:3100" };
    try {
      expect((await guest.request.get(endpoint)).status()).toBe(401);
      expect((await mapper.request.get(endpoint)).status()).toBe(403);
      expect(
        (
          await referee.request.post(endpoint, {
            headers,
            data: { confirmed: true },
          })
        ).status(),
      ).toBe(403);
      expect(
        (await (await referee.request.get(endpoint)).json()).fixtures,
      ).toEqual([]);
      await openTournamentTool(
        page,
        "test-cup",
        "Fixtures & results",
        isMobile,
      );
      await page.getByText("Create a fixture", { exact: true }).click();
      await page
        .getByLabel("Fixture label", { exact: true })
        .fill(`Synthetic HTTP Fixture ${base}`);
      await page
        .getByRole("combobox", { name: /^Competition round/ })
        .selectOption(round.id);
      await page
        .getByRole("combobox", { name: /^Home team/ })
        .selectOption(home.teamId);
      await page
        .getByRole("combobox", { name: /^Away team/ })
        .selectOption(away.teamId);
      await expect(
        page.getByRole("combobox", { name: "Associated mappool", exact: true }),
      ).toBeVisible();
      await captureResponsiveLayout(page, info, "minimal-fixture");
      await expect(
        page.getByText("Match options", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Fixture order within round", { exact: true }),
      ).toHaveValue("1");
      await page
        .getByRole("combobox", { name: /^Associated mappool/ })
        .selectOption(pool.id);
      await page
        .getByRole("button", { name: "Create fixture", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: `Synthetic HTTP Fixture ${base}`,
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Assign Referee", exact: true })
        .click();
      const assignmentDialog = page.getByRole("dialog");
      await assignmentDialog
        .getByRole("searchbox", { name: "Search referees", exact: true })
        .fill(String(refId));
      await assignmentDialog
        .getByRole("checkbox", { name: new RegExp(String(refId)) })
        .check();
      await assignmentDialog
        .getByRole("button", { name: "Save assignments", exact: true })
        .click();
      await expect(assignmentDialog).not.toBeVisible();
      await expect(
        page.getByText(`Assigned referees: Synthetic Player ${refId}`, {
          exact: false,
        }),
      ).toBeVisible();
      const tabs = page
        .getByRole("tab", { name: "Groups", exact: true })
        .locator("..");
      await expect(tabs).toHaveAttribute("data-appearance", "line");
      await expect(tabs).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await page.getByRole("tab", { name: "Groups", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Unassigned group", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: `Synthetic HTTP Fixture ${base}`,
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Groups", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByRole("tab", { name: "Bracket", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByText("No knockout fixtures yet.", { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("tab", { name: "Bracket", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: "Schedule", exact: true }).click();
      const data = await (await context.request.get(endpoint)).json();
      const fixture = data.fixtures.find(
        (f: { label: string }) => f.label === `Synthetic HTTP Fixture ${base}`,
      );
      await page
        .getByRole("button", { name: "Create a fixture", exact: true })
        .click();
      const next = page.getByRole("dialog");
      await next
        .getByRole("combobox", { name: /^Competition round/ })
        .selectOption(round.id);
      await next.getByText("Match options", { exact: true }).click();
      await expect(
        next.getByLabel("Fixture order within round", { exact: true }),
      ).toHaveValue("2");
      await next.getByRole("button", { name: "Close", exact: true }).click();
      expect(fixture.scheduledAt).toBeNull();
      expect(fixture.publishedAt).toBeNull();
      expect(fixture.result).toBeNull();
      expect(fixture.assignmentRevision).toBe(1);
      expect(fixture.version).toBe(0);
      const assignUrl = `${endpoint}/${fixture.id}/referees`;
      for (const [client, status] of [
        [guest, 401],
        [mapper, 403],
        [referee, 403],
      ] as const)
        expect(
          (
            await client.request.patch(assignUrl, {
              headers,
              data: { expectedAssignmentRevision: 1, refereeIds: [] },
            })
          ).status(),
        ).toBe(status);
      expect(
        (
          await context.request.patch(assignUrl, {
            headers: { origin: "https://evil.example" },
            data: { expectedAssignmentRevision: 1, refereeIds: [] },
          })
        ).status(),
      ).toBe(403);
      expect(
        (await referee.request.get(`${endpoint}/${fixture.id}`)).status(),
      ).toBe(200);
      expect(
        (await mapper.request.get(`${endpoint}/${fixture.id}`)).status(),
      ).toBe(403);
      expect(
        (await guest.request.get(`${endpoint}/${fixture.id}`)).status(),
      ).toBe(401);
      const operation = {
        requestKey: randomUUID(),
        expectedVersion: 0,
        expectedFixtureVersion: fixture.version,
        confirmed: true,
      };
      const reportUrl = `${endpoint}/${fixture.id}/results`;
      const importUrl = `${endpoint}/${fixture.id}/imports`;
      expect((await guest.request.get(reportUrl)).status()).toBe(401);
      expect((await mapper.request.get(reportUrl)).status()).toBe(403);
      expect((await referee.request.get(reportUrl)).status()).toBe(200);
      expect(
        (
          await guest.request.post(importUrl, {
            headers,
            data: { ...operation, match: "999001" },
          })
        ).status(),
      ).toBe(401);
      expect(
        (
          await mapper.request.post(importUrl, {
            headers,
            data: { ...operation, match: "999001" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await referee.request.post(reportUrl, {
            headers,
            data: { ...operation, action: "approve", revision: 1 },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await referee.request.post(importUrl, {
            headers,
            data: { ...operation, match: "999001" },
          })
        ).status(),
      ).toBe(502); // Test transport supplies an unavailable provider; credentials are configured.
      const afterUnavailable = await (
        await referee.request.get(reportUrl)
      ).json();
      expect(afterUnavailable.context.result).toBeNull();
      expect(afterUnavailable.source).toBeNull();
      await page
        .getByRole("tab", { name: "Competition configuration", exact: true })
        .click();
      const rules = page
        .locator("section.settings-card")
        .filter({
          has: page.getByRole("heading", {
            name: `${round.name}: approved competition rules`,
            exact: true,
          }),
        })
        .last();
      await rules.getByLabel("Configure approved scoring rules").check();
      await expect(
        rules.getByLabel("Approved scoring rules version"),
      ).toHaveCount(0);
      await rules
        .getByRole("combobox", { name: /^Game mode/ })
        .selectOption("osu");
      await rules
        .getByRole("combobox", { name: /^Multiplayer team mode/ })
        .selectOption("team-vs");
      await rules
        .getByRole("combobox", { name: /^Scoring type/ })
        .selectOption("score");
      await rules
        .getByRole("combobox", { name: /^Team score aggregation/ })
        .selectOption("sum");
      await rules.getByLabel("Players per team per game").fill("2");
      await rules
        .getByRole("combobox", { name: /^Series format/ })
        .selectOption("first_to");
      await rules.getByLabel("Map wins required").fill("2");
      await rules
        .getByRole("combobox", { name: /^Failed player scores/ })
        .selectOption("include");
      await rules
        .getByRole("combobox", { name: /^Tied map policy/ })
        .selectOption("require_replay");
      await rules
        .getByRole("combobox", { name: /^Understrength teams/ })
        .selectOption("false");
      await rules
        .getByRole("combobox", { name: /^Substitution policy/ })
        .selectOption("false");
      await rules
        .getByRole("button", { name: "Save approved round rules" })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const review = await (
        await referee.request.get(`${endpoint}/${fixture.id}`)
      ).json();
      expect(review.round.scoringRules).toMatchObject({
        version: expect.stringMatching(/^release-/),
        series: { type: "first_to", wins: 2 },
        playersPerTeam: 2,
      });
      // Route content can arrive before Next.js finishes streaming metadata.
      await expect(page).toHaveTitle("Competition fixtures");
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
      await page.getByRole("tab", { name: "Schedule", exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await captureResponsiveLayout(page, info, "fixtures");
      await page.screenshot({
        path: info.outputPath("fixtures.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Manage fixture", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Publish fixture", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByText("Published fixture", { exact: true }),
      ).toBeVisible();
      expect(
        (
          await context.request.post(endpoint, {
            data: {
              action: "publish",
              fixtureId: fixture.id,
              expectedVersion: 1,
              published: false,

              confirmed: true,
            },
          })
        ).status(),
      ).toBe(403);
      const koRounds = [];
      for (const [position, name] of [
        [1, "Quarterfinal"],
        [2, "Final"],
      ] as const) {
        const workspace = await mappoolCommand(
          { osuId: adminId, username: "Synthetic Admin" },
          "test-cup",
          {
            action: "round_create",
            stage: "knockout",
            name,
            position,
            confirmed: true,
          },
        );
        koRounds.push(
          workspace.rounds.find(
            (r) => r.stage === "knockout" && r.position === position,
          )!,
        );
      }
      const makeFixture = async (
        roundId: string,
        label: string,
        source: string | null,
      ) => {
        const response = await context.request.post(endpoint, {
          headers,
          data: {
            action: "create",
            label,
            roundId,
            homeTeamId: home.teamId,
            awayTeamId: away.teamId,
            mappoolId: null,
            position: 1,
            scheduledAt: null,
            timeZone: "UTC",
            status: "scheduled",
            homeSourceId: source,
            homeSourceOutcome: source ? "winner" : null,
            awaySourceId: null,
            awaySourceOutcome: null,
            confirmed: true,
          },
        });
        expect(response.status()).toBe(200);
        return (await response.json()).fixtures.find(
          (f: { label: string }) => f.label === label,
        );
      };
      const qf = await makeFixture(koRounds[0].id, "QF1", null);
      await makeFixture(koRounds[1].id, "F1", qf.id);
      await page.reload();
      await page.getByRole("tab", { name: "Bracket", exact: true }).click();
      await expect(
        page.getByRole("tab", { name: "Bracket", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("heading", { name: "QF1", exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-match-id]")).toHaveCount(2);
      await expect(page.locator(".bracket-connectors path")).toHaveCount(1);
      expect(
        await page
          .locator("#fixture-views-panel")
          .evaluate((node) => node.getBoundingClientRect().right <= innerWidth),
      ).toBe(true);
      await expect(
        page.getByRole("heading", {
          name: `Synthetic HTTP Fixture ${base}`,
          exact: true,
        }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Route content can arrive before Next.js finishes streaming metadata.
      await expect(page).toHaveTitle("Competition fixtures");
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath("fixture-bracket.png"),
        fullPage: true,
      });
      const refPage = await referee.newPage();
      await refPage.goto("/admin/tournaments/test-cup/matches");
      await expect(
        refPage.getByRole("heading", {
          name: "My assigned matches",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        refPage.getByRole("heading", {
          name: `Synthetic HTTP Fixture ${base}`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        refPage.getByRole("button", { name: "Assign Referee", exact: true }),
      ).toHaveCount(0);
      await expect(
        refPage.getByRole("heading", { name: "QF1", exact: true }),
      ).toHaveCount(0);
      await refPage.close();
      await db()
        .delete(fixtureReferees)
        .where(eq(fixtureReferees.fixtureId, fixture.id));
      expect(
        (await referee.request.get(`${endpoint}/${fixture.id}`)).status(),
      ).toBe(403);
      expect(
        (await (await referee.request.get(endpoint)).json()).fixtures,
      ).toEqual([]);
    } finally {
      await referee.close();
      await guest.close();
      await mapper.close();
    }
  });
  test("plans TBD matches and assigns multiple referees before teams exist, without enabling result imports", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const adminId = isMobile ? 70001 : 60001;
    const refId = isMobile ? 278102 : 278002;
    await context.addCookies([await seedSession(adminId)]);
    const firstCookie = await seedSession(refId);
    const secondCookie = await seedSession(refId + 1);
    await db()
      .insert(staffRoles)
      .values(
        [refId, refId + 1].map((userId) => ({
          userId,
          role: "referee" as const,
          editionSlug: "test-cup",
          grantedBy: adminId,
        })),
      );
    process.env.ADMIN_OSU_IDS = String(adminId);
    await mappoolCommand(
      { osuId: adminId, username: "Synthetic Admin" },
      "test-cup",
      {
        action: "round_create",
        stage: "knockout",
        name: "Planned final",
        position: 1,
        confirmed: true,
      },
    );
    const referee = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const second = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const guest = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    await referee.addCookies([firstCookie]);
    await second.addCookies([secondCookie]);
    const endpoint = "/api/admin/tournaments/test-cup/matches";
    const headers = { origin: "http://127.0.0.1:3100" };
    try {
      await page.goto("/admin/tournaments/test-cup/matches");
      await page
        .getByRole("button", { name: "Create a fixture", exact: true })
        .click();
      const create = page.getByRole("dialog");
      await create
        .getByLabel("Fixture label", { exact: true })
        .fill("Planned final");
      await create.getByText("Match options", { exact: true }).click();
      await selectTimeZone(create, "UTC");
      await create
        .getByLabel("Scheduled date and time: date", { exact: true })
        .fill("2026-11-02");
      await create
        .getByLabel("Scheduled date and time: time (HH:mm)", { exact: true })
        .fill("12:00");
      await create
        .getByRole("button", { name: "Create fixture", exact: true })
        .click();
      await expect(create).not.toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Planned final", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Team TBD", { exact: true })).toHaveCount(2);
      await page
        .getByRole("button", { name: "Assign Referee", exact: true })
        .click();
      const assignment = page.getByRole("dialog");
      for (const id of [refId, refId + 1]) {
        await assignment
          .getByRole("searchbox", { name: "Search referees" })
          .fill(String(id));
        await assignment
          .getByRole("checkbox", { name: new RegExp(String(id)) })
          .check();
      }
      await assignment
        .getByRole("button", { name: "Save assignments", exact: true })
        .click();
      await expect(assignment).not.toBeVisible();
      let workspace = await (await context.request.get(endpoint)).json();
      const fixture = workspace.fixtures[0];
      expect(fixture.refereeIds).toEqual([refId, refId + 1]);
      expect(fixture.homeTeamId).toBeNull();
      expect(fixture.awayTeamId).toBeNull();
      expect(fixture.version).toBe(0);
      const matchUrl = `${endpoint}/${fixture.id}`;
      // Another operator changes the assignments while this dialog still has revision 1.
      await page
        .getByRole("button", { name: "Assign Referee", exact: true })
        .click();
      expect(
        (
          await context.request.patch(`${matchUrl}/referees`, {
            headers,
            data: { expectedAssignmentRevision: 1, refereeIds: [refId] },
          })
        ).status(),
      ).toBe(200);
      await assignment
        .getByRole("button", { name: "Save assignments", exact: true })
        .click();
      await expect(assignment.getByRole("alert")).toContainText(
        "Referee assignments changed",
      );
      await assignment
        .getByRole("button", { name: "Reload assignments", exact: true })
        .click();
      await assignment
        .getByRole("searchbox", { name: "Search referees" })
        .fill(String(refId + 1));
      await expect(
        assignment.getByRole("checkbox", {
          name: new RegExp(String(refId + 1)),
        }),
      ).not.toBeChecked();
      await assignment
        .getByRole("checkbox", { name: new RegExp(String(refId + 1)) })
        .check();
      await assignment
        .getByRole("button", { name: "Save assignments", exact: true })
        .click();
      await expect(assignment).not.toBeVisible();
      for (const client of [referee, second]) {
        expect((await client.request.get(matchUrl)).status()).toBe(409);
        expect(
          (
            await client.request.post(`${matchUrl}/imports`, {
              headers,
              data: {
                match: "999001",
                requestKey: randomUUID(),
                expectedFixtureVersion: 0,
                expectedVersion: 0,
                confirmed: true,
              },
            })
          ).status(),
        ).toBe(409);
      }
      const refPage = await referee.newPage();
      await refPage.goto("/admin/tournaments/test-cup/matches");
      await expect(
        refPage.getByRole("heading", {
          name: "My assigned matches",
          exact: true,
        }),
      ).toBeVisible();
      await refPage
        .getByRole("link", { name: "Open match", exact: true })
        .click();
      await expect(
        refPage.getByText("Reporting needs two finalized, published teams.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        refPage.getByRole("button", { name: /import/i }),
      ).toHaveCount(0);
      await refPage.close();
      const publicUrl = `/api/tournaments/test-cup/matches/${fixture.id}`;
      expect((await guest.request.get(publicUrl)).status()).toBe(404);
      await page
        .getByRole("button", { name: "Manage fixture", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Publish fixture", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByText("Published fixture", { exact: true }),
      ).toBeVisible();
      const published = await (await guest.request.get(publicUrl)).json();
      expect(published).toMatchObject({
        confirmed: false,
        result: null,
        home: { team: null },
        away: { team: null },
        scheduledAt: "2026-11-02T12:00:00.000Z",
      });
      expect(JSON.stringify(published)).not.toContain("referee");
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, refId + 1));
      expect((await second.request.get(endpoint)).status()).toBe(403);
      expect((await second.request.get(matchUrl)).status()).toBe(403);
      await page.reload();
      await page
        .getByRole("button", { name: "Assign Referee", exact: true })
        .click();
      await assignment
        .getByRole("searchbox", { name: "Search referees" })
        .fill(String(refId + 1));
      await expect(assignment.getByText(/Role no longer active/)).toBeVisible();
      await assignment
        .getByRole("checkbox", { name: new RegExp(String(refId + 1)) })
        .uncheck();
      await assignment
        .getByRole("button", { name: "Save assignments", exact: true })
        .click();
      await expect(assignment).not.toBeVisible();
      workspace = await (await context.request.get(endpoint)).json();
      expect(workspace.fixtures[0].refereeIds).toEqual([refId]);
      expect(workspace.fixtures[0].version).toBe(1); // Only fixture publication changed this version.
      expect(workspace.fixtures[0].assignmentRevision).toBe(4);
      await page.getByRole("tab", { name: "Bracket", exact: true }).click();
      await expect(
        page.getByRole("tab", { name: "Bracket", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      // Route content can arrive before Next.js finishes streaming metadata.
      await expect(page).toHaveTitle("Competition fixtures");
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: info.outputPath("planned-fixture.png"),
        fullPage: true,
      });
      expect(
        (
          await db()
            .select()
            .from(resultAuditEvents)
            .where(eq(resultAuditEvents.action, "fixture_referees"))
        ).length,
      ).toBe(4);
    } finally {
      await referee.close();
      await second.close();
      await guest.close();
    }
  });
});
