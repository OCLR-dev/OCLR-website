import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
import { englishStorage } from "../fixtures/preferences";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { fixtures } from "../../src/db/schema";
import { seedSession } from "./session";
import { seedResultReview } from "../fixtures/results";
test.describe("anonymous tournament competition center", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("guest reads published schedules, maps, player/team pages, results and authoritative bracket without cookies", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const adminId = isMobile ? 70001 : 60001;
    const refId = isMobile ? 307002 : 306002;
    const adminCookie = await seedSession(adminId);
    await seedSession(refId);
    const seed = await seedResultReview(
      adminId,
      refId,
      isMobile ? 309000 : 308000,
      "knockout",
      true,
    );
    const admin = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    await admin.addCookies([adminCookie]);
    const privateEndpoint = `/api/admin/tournaments/test-cup/matches/${seed.fixtureId}/results`;
    const publicEndpoint = `/api/tournaments/test-cup/matches/${seed.fixtureId}`;
    const headers = { origin: "http://127.0.0.1:3100" };
    async function command(extra: Record<string, unknown>) {
      const review = await (await admin.request.get(privateEndpoint)).json();
      const response = await admin.request.post(privateEndpoint, {
        headers,
        data: {
          ...extra,
          requestKey: randomUUID(),
          expectedVersion: review.context.result.version,
          expectedFixtureVersion: review.context.fixture.version,
          confirmed: true,
        },
      });
      expect(response.status()).toBe(200);
      return response.json();
    }
    try {
      expect(
        (await context.cookies()).filter(
          (cookie) => !isAutomaticPreferenceCookie(cookie),
        ),
      ).toEqual([]);
      const initial = await (await context.request.get(publicEndpoint)).json();
      expect(initial.pool).toMatchObject({
        id: seed.poolId,
        name: "Synthetic Released Fixture Pool",
      });

      expect(initial.result).toBeNull();
      await command({
        action: "submit",
        importId: seed.importId,
        rulesConfirmed: true,
        sourceChangesConfirmed: true,
        publicNote: "Synthetic approved public note",
        decisions: seed.source.games.map((g) => ({
          gameId: g.id,
          included: true,
          complianceConfirmed: true,
          reason: "Synthetic explicit game evidence",
          substitutions: [],
        })),
      });
      expect(
        (await (await context.request.get(publicEndpoint)).json()).result,
      ).toBeNull();
      await command({ action: "approve", revision: 1 });
      expect(
        (await (await context.request.get(publicEndpoint)).json()).result,
      ).toBeNull();
      await command({
        action: "publish",
        revision: 1,
        progressionAcknowledged: true,
      });
      for (const route of [
        "/tournaments/test-cup/players",
        "/tournaments/test-cup/mappools",
        "/tournaments/test-cup/schedule",
        "/tournaments/test-cup/results",
        "/tournaments/test-cup/bracket",
        "/tournaments/test-cup/participants",
        "/tournaments/test-cup/teams",
        `/tournaments/test-cup/teams/${seed.home.teamId}`,
        `/tournaments/test-cup/matches/${seed.fixtureId}`,
      ]) {
        expect((await page.goto(route))?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page).not.toHaveURL(/\/login/);
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
      }
      await expect(
        page.getByRole("link", {
          name: "Released mappool: Synthetic Released Fixture Pool",
          exact: true,
        }),
      ).toBeVisible();
      const published = await (
        await context.request.get(publicEndpoint)
      ).json();
      expect(published.result).toMatchObject({
        homeWins: 2,
        awayWins: 1,
        revision: 1,
      });
      for (const privateField of [
        "private note",
        "decisions",
        "rosterSnapshot",
        "sourceFingerprint",
        "approvedBy",
        "SYNTHETIC_PRIVATE_CONTACT",
      ])
        expect(JSON.stringify(published)).not.toContain(privateField);
      await expect(
        page.getByRole("link", {
          name: "osu! multiplayer source #999001 ↗",
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath("public-match.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.goto("/tournaments/test-cup/bracket");
      const bracket = await (
        await context.request.get("/api/tournaments/test-cup/bracket")
      ).json();
      expect(bracket.bracket.groups[0].rounds[0].matches[0].scores).toEqual([
        2, 1,
      ]);
      await expect(
        page.getByRole("link", {
          name: "Match details",
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath("database-bracket.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.goto("/tournaments/test-cup/results");
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Knockout Stage · Synthetic Review Round",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("searchbox", { name: "Search matches" })
        .fill("NO_MATCHING_TEAM");
      await expect(
        page.getByText("No published fixtures match these filters.", {
          exact: false,
        }),
      ).toBeVisible();
      await page.getByRole("searchbox", { name: "Search matches" }).fill("");
      await page
        .getByRole("button", { name: "Knockout Stage", exact: true })
        .click();
      await expect(
        page.getByRole("link", {
          name: "Synthetic Reviewed Fixture",
          exact: true,
        }),
      ).toBeVisible();
      await command({ action: "unpublish" });
      expect(
        (await (await context.request.get(publicEndpoint)).json()).result,
      ).toBeNull();
      await page.reload();
      await expect(
        page.getByText("Published result", { exact: true }),
      ).toHaveCount(0);
      expect((await context.request.get(privateEndpoint)).status()).toBe(401);
      expect(
        (
          await context.request.post(privateEndpoint, {
            headers,
            data: { action: "publish", confirmed: true },
          })
        ).status(),
      ).toBe(401);
      expect(
        (
          await context.request.post(publicEndpoint, {
            data: { action: "publish" },
          })
        ).status(),
      ).toBe(405);
      await db()
        .update(fixtures)
        .set({ publishedAt: null })
        .where(eq(fixtures.id, seed.fixtureId));
      expect((await context.request.get(publicEndpoint)).status()).toBe(404);
      expect(
        (
          await page.goto(`/tournaments/test-cup/matches/${seed.fixtureId}`)
        )?.status(),
      ).toBe(404);
      expect(
        (
          await context.request.get("/api/tournaments/private-test-cup/matches")
        ).status(),
      ).toBe(404);
      expect(
        (await context.cookies()).filter(
          (cookie) => !isAutomaticPreferenceCookie(cookie),
        ),
      ).toEqual([]);
    } finally {
      await admin.close();
    }
  });
});
