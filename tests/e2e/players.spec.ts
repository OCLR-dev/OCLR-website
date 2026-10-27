import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { captains } from "../../src/db/schema";
import { seedPublicDirectory } from "../fixtures/players";
test.describe("anonymous published player directory", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("browses and searches public rosters while private registrations remain inaccessible", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const base = isMobile ? 240101 : 240001;
    const fixture = await seedPublicDirectory(base);
    expect(
      (await context.cookies()).filter(
        (cookie) => !isAutomaticPreferenceCookie(cookie),
      ),
    ).toEqual([]);
    const query = new URLSearchParams({
      q: `Synthetic Directory ${base}`,
      edition: "test-cup",
    });
    const response = await context.request.get(`/api/players?${query}`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.rows.map((p: { osuId: number }) => p.osuId).sort()).toEqual([
      base,
      base + 1,
      base + 3,
    ]);
    expect(JSON.stringify(data)).not.toMatch(
      /PRIVATE_CONTACT|INTERNAL_REASON|answers|statusReason|registrationId/,
    );
    expect(
      data.rows.find((p: { osuId: number }) => p.osuId === base + 3),
    ).toMatchObject({ participation: "accepted", captain: false, team: null });
    await page.goto(
      `/tournaments/test-cup/players?q=${encodeURIComponent(query.get("q")!)}`,
    );
    await expect(
      page.getByRole("heading", { name: "Players", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("3 Players", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: `Synthetic Directory ${base} Captain`,
        exact: true,
      }),
    ).toHaveAttribute("href", `https://osu.ppy.sh/users/${base}`);
    await expect(
      page.getByText("Private Applicant", { exact: false }),
    ).toHaveCount(0);
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Tournament navigation" })
        .getByRole("link", { name: "Players", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel("Tournament", { exact: true })).toHaveCount(0);
    expect((await context.request.get("/api/players")).status()).toBe(400);
    expect(
      (
        await context.request.get("/api/tournaments/private-test-cup/players")
      ).status(),
    ).toBe(200);
    expect(
      (
        await (
          await context.request.get("/api/tournaments/private-test-cup/players")
        ).json()
      ).rows,
    ).toEqual([]);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: isMobile ? 390 : 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("players.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.goto("/tournaments/test-cup/teams");
    await page
      .getByRole("link", {
        name: `Synthetic Directory Team ${base}`,
        exact: true,
      })
      .first()
      .click();
    await expect(
      page.getByRole("heading", {
        name: `Synthetic Directory Team ${base}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(
      `/tournaments/test-cup/players?q=${encodeURIComponent(query.get("q")!)}`,
    );
    await page.getByLabel("Search players").fill(String(base + 1));
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("1 Players", { exact: true })).toBeVisible();
    await page.getByLabel("Search players").fill(String(fixture.privateId));
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("0 Players", { exact: true })).toBeVisible();
    for (const url of ["/api/registrations", "/api/admin/registrations"])
      expect((await context.request.get(url)).status()).toBe(401);
    expect(
      (await context.request.get(`/api/players/${fixture.privateId}`)).status(),
    ).toBe(404);
    expect(
      (
        await context.request.get(`/api/players?userId=${fixture.privateId}`)
      ).status(),
    ).toBe(400);
    expect(
      (
        await context.request.post(
          `/api/registrations/${fixture.privateRegistrationId}/withdraw`,
          {
            headers: { origin: "http://127.0.0.1:3100" },
            data: { confirmed: true },
          },
        )
      ).status(),
    ).toBe(401);
    await db()
      .update(captains)
      .set({ published: false })
      .where(eq(captains.userId, base));
    expect(
      (await (await context.request.get(`/api/players?${query}`)).json()).rows,
    ).toMatchObject([
      { captain: false, team: null },
      { captain: false, team: null },
      { captain: false, team: null },
    ]);
  });
});
