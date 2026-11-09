import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { tournamentRounds } from "../../src/db/schema";
import { syntheticScoringRules } from "../fixtures/match";
import { seedSession } from "./session";
import { seedResultReview } from "../fixtures/results";
import { expectWorkflowFits } from "./responsive";

const origin = process.env.OCLR_TEST_ORIGIN || "http://127.0.0.1:3100";

test.describe("open exhibition editing and reviewed publication", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("edits side names without choosing official teams and publishes MP players with per-game sides", async ({
    page,
    context,
    isMobile,
  }, testInfo) => {
    const adminId = isMobile ? 70001 : 60001;
    const refereeId = isMobile ? 890302 : 890301;
    const adminCookie = await seedSession(adminId);
    await seedSession(refereeId);
    const seeded = await seedResultReview(
      adminId,
      refereeId,
      isMobile ? 890400 : 890500,
      "exhibition",
      true,
      true,
    );
    await db()
      .update(tournamentRounds)
      .set({ scoringRules: { ...syntheticScoringRules, playersPerTeam: 3 } })
      .where(eq(tournamentRounds.id, seeded.context.round.id));
    await context.addCookies([adminCookie]);
    const endpoint = `/api/admin/tournaments/test-cup/matches/${seeded.fixtureId}/results`;
    await page.goto("/admin/tournaments/test-cup/matches");
    await page
      .getByRole("button", { name: "Create a fixture", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByLabel("Red Team", { exact: true }),
    ).toHaveJSProperty("tagName", "INPUT");
    await expect(dialog.getByLabel("Red Team", { exact: true })).toHaveValue(
      "Red Team",
    );
    await expect(dialog.getByLabel("Blue Team", { exact: true })).toHaveValue(
      "Blue Team",
    );
    await dialog
      .getByLabel("Fixture label", { exact: true })
      .fill("Synthetic open exhibition");
    await dialog.getByLabel("Red Team", { exact: true }).fill("紅色新星");
    await dialog.getByLabel("Blue Team", { exact: true }).fill("藍色流星");
    await expectWorkflowFits(page);
    await page.screenshot({ path: testInfo.outputPath("exhibition-form.png") });
    await dialog
      .getByRole("button", { name: "Create fixture", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const workspace = await (
      await context.request.get("/api/admin/tournaments/test-cup/matches")
    ).json();
    const created = workspace.fixtures.find(
      (f: { label: string }) => f.label === "Synthetic open exhibition",
    );
    expect(created).toMatchObject({
      homeTeamId: null,
      awayTeamId: null,
      exhibitionSides: { redName: "紅色新星", blueName: "藍色流星" },
    });
    // The seeded MP snapshot contains unregistered players, a changed player and per-map side switches.
    await page.goto(`/admin/tournaments/test-cup/matches/${seeded.fixtureId}`);
    await expect(
      page.getByRole("heading", {
        name: "Exhibition sides",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("No published roster", { exact: true }),
    ).toHaveCount(0);
    for (let i = 1; i <= 3; i++) {
      await page
        .getByText(new RegExp(`^Game ${i} · Synthetic Map ${i}`))
        .click();
      await page
        .getByRole("combobox", { name: new RegExp(`^Game ${i} decision`) })
        .selectOption("true");
    }
    await expect(
      page.getByText("Synthetic Open Player 9901001", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /verified.*approved.*rules/i }),
    ).toHaveCount(0);
    await page
      .getByLabel(
        "I reviewed the current source snapshot and all reported changes",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", { name: "Submit proposed result", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByText("Pending approval · Not published"),
    ).toBeVisible();
    const publicEndpoint = `/api/tournaments/test-cup/matches/${seeded.fixtureId}`;
    expect(
      (await (await context.request.get(publicEndpoint)).json()).result,
    ).toBeNull();
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
    const review = await (await context.request.get(endpoint)).json();
    expect(review.published.proposal.rulesSnapshot).toBeNull();
    expect(
      review.published.proposal.games[1].attribution.find(
        (s: { osuId: number }) => s.osuId === 9901001,
      ).teamId,
    ).toBe(seeded.context.fixture.homeTeamId);
    await page.goto("/tournaments/test-cup/schedule");
    await expect(
      page.getByRole("button", { name: "Exhibition", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const fixtureName = "Synthetic Reviewed Fixture";
    const card = page.getByRole("article").filter({ hasText: fixtureName });
    await expect(card.locator(".event-match-side b")).toHaveText(["1", "2"]);
    const summary = page.getByRole("table");
    await expect(
      summary.getByRole("columnheader", { name: "Match result" }),
    ).toBeVisible();
    const row = summary.getByRole("row").filter({ hasText: fixtureName });
    await expect(
      row.getByRole("cell", { name: "1 : 2", exact: true }),
    ).toBeVisible();
    const result = row.getByRole("link", { name: fixtureName, exact: true });
    const resultPath = `/tournaments/test-cup/matches/${seeded.fixtureId}`;
    await expect(result).toHaveAttribute("href", resultPath);
    await expect(row).not.toContainText(seeded.fixtureId);
    await expectWorkflowFits(page);
    await result.click();
    await expect(page).toHaveURL(`${origin}${resultPath}`);
    await expect(
      page.getByText(
        "Exhibition results do not count toward official standings or career history.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Included in official result", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator(
        `a[href="/tournaments/test-cup/teams/${seeded.context.fixture.homeTeamId}"]`,
      ),
    ).toHaveCount(0);
    await expect(
      page.locator('a[href="https://osu.ppy.sh/users/9901005"]'),
    ).toBeVisible();
    await expectWorkflowFits(page);
    await page.screenshot({
      path: testInfo.outputPath("exhibition-result.png"),
    });
    // Keep an HTTP revision check in the real journey; no browser-only permission bypass.
    const stale = await context.request.post(endpoint, {
      headers: { origin },
      data: {
        action: "approve_publish",
        confirmed: true,
        requestKey: randomUUID(),
        expectedVersion: 0,
        expectedFixtureVersion: 0,
        revision: 1,
        progressionAcknowledged: true,
      },
    });
    expect(stale.status()).toBe(409);
  });
});
