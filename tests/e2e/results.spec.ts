import { englishStorage } from "../fixtures/preferences";
import { openTournamentTool } from "./navigation";
import { createHash, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { and, eq } from "drizzle-orm";
import { matchImports, matchGames } from "../../src/db/schema";
import { db, closeDb } from "../../src/db";
import { seedSession } from "./session";
import { seedResultReview } from "../fixtures/results";
test.describe("private referee review and Admin publication", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("reviewed synthetic games require Admin approve-and-publish, with persistent audit", async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
    const adminId = isMobile ? 70001 : 60001;
    const refereeId = isMobile ? 302002 : 301002;
    const adminCookie = await seedSession(adminId);
    const refCookie = await seedSession(refereeId);
    const seed = await seedResultReview(
      adminId,
      refereeId,
      isMobile ? 304000 : 303000,
    );
    // Synthetic ambiguous provider colors still have authoritative roster identities.
    // Inclusion requires a substantive review explanation, while ordinary games do not.
    const source = structuredClone(seed.source);
    source.games[0].scores[0].team = null;
    source.fingerprint = createHash("sha256")
      .update(JSON.stringify(source.games))
      .digest("hex");
    await db().transaction(async (tx) => {
      await tx
        .update(matchImports)
        .set({ source, fingerprint: source.fingerprint })
        .where(eq(matchImports.id, seed.importId));
      await tx
        .update(matchGames)
        .set({ data: source.games[0] })
        .where(
          and(
            eq(matchGames.importId, seed.importId),
            eq(matchGames.externalGameId, source.games[0].id),
          ),
        );
    });
    await context.addCookies([refCookie]);
    const endpoint = `/api/admin/tournaments/test-cup/matches/${seed.fixtureId}/results`;
    const route = `/admin/tournaments/test-cup/matches/${seed.fixtureId}`;
    const headers = { origin: "http://127.0.0.1:3100" };
    const guest = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      expect((await guest.request.get(endpoint)).status()).toBe(401);
      const publicEndpoint = `/api/tournaments/test-cup/matches/${seed.fixtureId}`;
      const beforePublication = await (
        await guest.request.get(publicEndpoint)
      ).json();
      expect(beforePublication.result).toBeNull();
      expect(JSON.stringify(beforePublication)).not.toContain("999001");
      expect(
        (
          await guest.request.post(publicEndpoint, {
            data: { action: "publish" },
          })
        ).status(),
      ).toBe(405);

      await openTournamentTool(
        page,
        "test-cup",
        "Fixtures & results",
        isMobile,
      );
      await page.locator(`a[href="${route}"]`).click();
      await expect(
        page.getByLabel("osu! MP link or match ID", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("Select all games", { exact: true }).check();
      await page
        .getByRole("button", {
          name: "Include eligible games and confirm rules (2)",
        })
        .click();
      await page.getByText(/^Game 1 · Synthetic Map 1/).click();
      await page
        .getByRole("combobox", { name: "Game 1 decision" })
        .selectOption("true");
      await page
        .getByRole("textbox", { name: "Game 1 scoring decision explanation" })
        .fill("Synthetic roster evidence resolves the missing provider color.");
      await page
        .getByLabel(
          "Game 1: I verified mods and the approved tournament rules",
          { exact: true },
        )
        .check();
      await page.getByLabel("Select game 1", { exact: true }).uncheck();

      await page.getByLabel("Select game 2", { exact: true }).check();
      await page
        .getByLabel("Shared exclusion reason")
        .fill("Reviewing a possible rematch.");
      await page
        .getByRole("button", { name: "Exclude selected games" })
        .click();
      await page.getByText(/^Game 2 · Synthetic Map 2/).click();
      await expect(
        page.getByRole("textbox", { name: "Game 2 exclusion explanation" }),
      ).toHaveValue("Reviewing a possible rematch.");
      await page.getByLabel("Select game 2", { exact: true }).check();
      await page
        .getByRole("button", {
          name: "Include eligible games and confirm rules (1)",
        })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Game 2 exclusion explanation" }),
      ).toHaveCount(0);
      await page
        .getByLabel(
          "I verified the configured scoring rules against the approved OCLR rules",
          { exact: true },
        )
        .check();
      await page
        .getByLabel(
          "I reviewed the current source snapshot and all reported changes",
          { exact: true },
        )
        .check();
      await expect(
        page.getByRole("button", {
          name: "Submit proposed result",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);

      await page
        .getByRole("button", { name: "Submit proposed result", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByText("Pending approval · Not published"),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Approve & publish result" }),
      ).toHaveCount(0);
      let review = await (await context.request.get(endpoint)).json();
      const command = {
        requestKey: randomUUID(),
        expectedVersion: review.context.result.version,
        expectedFixtureVersion: review.context.fixture.version,
        confirmed: true,
        action: "approve",
        revision: 1,
      };
      expect(
        (
          await context.request.post(endpoint, { headers, data: command })
        ).status(),
      ).toBe(403);
      expect(
        (
          await guest.request.post(endpoint, { headers, data: command })
        ).status(),
      ).toBe(401);
      await context.addCookies([adminCookie]);
      await page.reload();
      await page
        .getByLabel(
          "I reviewed the effect on dependent fixtures and public standings or brackets",
          { exact: true },
        )
        .check();
      await page
        .getByRole("button", { name: "Approve & publish result", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByText("Approved result · Published result"),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText("Approved result · Published result"),
      ).toBeVisible();
      review = await (await context.request.get(endpoint)).json();
      const published = await (await guest.request.get(publicEndpoint)).json();
      expect(published.result).toMatchObject({
        homeWins: 2,
        awayWins: 1,
        revision: 1,
        mpId: 999001,
      });
      const publicText = JSON.stringify(published);
      for (const secret of [
        "private audit note",
        "Synthetic roster evidence",
        "SYNTHETIC_PRIVATE_CONTACT",
        "rosterSnapshot",
        "decisions",
        "sourceFingerprint",
        "approvedBy",
      ])
        expect(publicText).not.toContain(secret);
      expect(review.published.proposal.decisions[0].reason).toBe(
        "Synthetic roster evidence resolves the missing provider color.",
      );
      expect(review.published.proposal.series).toMatchObject({
        homeWins: 2,
        awayWins: 1,
      });
      expect(
        (
          await (
            await page.request.get(
              "/api/admin/audit?edition=test-cup&module=results",
            )
          ).json()
        ).rows.map((e: { action: string }) => e.action),
      ).toEqual(
        expect.arrayContaining(["result_submit", "result_approve_publish"]),
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
      const publicPage = await guest.newPage();
      await publicPage.goto("/news");
      await publicPage
        .getByRole("link", {
          name: /Result published: Synthetic Reviewed Fixture/,
        })
        .click();
      await expect(publicPage.locator(".page-heading")).toContainText("2–1");
      await expect(publicPage.locator(".page-heading")).not.toContainText(
        /revision|version/i,
      );
      await expect(
        publicPage.locator(
          `a[href="/tournaments/test-cup/matches/${seed.fixtureId}"]`,
        ),
      ).toBeVisible();
    } finally {
      await guest.close();
    }
  });
});
