import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { registrations, users, userProfileCache } from "../../src/db/schema";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { seedPublicDirectory } from "../fixtures/players";
import { profileResponse } from "../fixtures/osu-profile";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
const base = 1221000,
  path = "/tournaments/test-cup/players";
async function addPlayers(ids: number[]) {
  await db()
    .insert(users)
    .values(
      ids.map((osuId) => ({ osuId, username: `Visible Player ${osuId}` })),
    );
  await db()
    .insert(registrations)
    .values(
      ids.map((userId) => ({
        userId,
        editionSlug: "test-cup",
        status: "accepted" as const,
        rulesVersion: null,
        answers: { private: "PRIVATE_DIRECTORY_ANSWER" },
      })),
    );
}
test.describe("compact public player statistics", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async ({ context }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedPublicDirectory(base);
    await db().execute(
      sql`UPDATE users SET username = CASE osu_id WHEN ${base} THEN 'S11 Captain' WHEN ${base + 1} THEN 'S11 Member' ELSE 'Hidden Captain' END WHERE osu_id IN (${base}, ${base + 1}, ${base + 3})`,
    );
    await db().execute(
      sql`UPDATE teams SET name = 'Sample Team' WHERE captain_id = ${base}`,
    );
    await addPlayers(Array.from({ length: 5 }, (_, i) => base + 10 + i));
    const ids = [
      base,
      base + 1,
      base + 3,
      ...Array.from({ length: 5 }, (_, i) => base + 10 + i),
    ];
    await db()
      .insert(userProfileCache)
      .values(
        ids.map((osuId, i) => {
          const profile = normalizeOsuProfile(
            { ...profileResponse, id: osuId },
            osuId,
            "osu",
            "2026-10-23T00:00:00Z",
          );
          profile.statistics.globalRank =
            i === 1 || i === 6 ? null : i === 7 ? 0 : 12345;
          profile.statistics.pp = i === 2 || i === 6 ? null : 7890.45;
          return {
            osuId,
            mode: "osu" as const,
            profile,
            attemptedAt: new Date(),
            retryAt: new Date(Date.now() + 3600000),
            errorStatus: i === 3 ? 404 : i === 4 ? 429 : i === 5 ? 503 : null,
          };
        }),
      );
    await context.route("**/api/osu-images/avatar/*", (route) => route.abort());
  });
  test.afterEach(async () => {
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);
  test("renders all accepted identities with cached statistics across locales and themes", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(120000);
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        await page.setViewportSize({
          width: isMobile ? 320 : 1440,
          height: 900,
        });
        await page.goto(path);
        const rows = page.locator(".event-player-row");
        await expect(rows).toHaveCount(8);
        const captain = rows.filter({
          has: page.locator(`a[href="https://osu.ppy.sh/users/${base}"]`),
        });
        await expect(captain.locator("dd")).toHaveText(["#12,345", "7,890.45"]);
        await expect(captain.locator("time")).toHaveAttribute(
          "datetime",
          "2026-10-23T00:00:00Z",
        );
        await expect(
          captain.locator(`a[href="/players/${base}?edition=test-cup"]`),
        ).toBeVisible();
        await expect(
          captain.locator(".event-player-identity .muted"),
        ).toHaveText("Captain · Sample Team");
        const hidden = rows.filter({
          has: page.locator(`a[href="https://osu.ppy.sh/users/${base + 3}"]`),
        });
        await expect(
          hidden.locator(".event-player-identity .muted"),
        ).toHaveCount(0);
        await expect(hidden.locator('a[href*="/teams/"]')).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
  test("keeps missing fields and provider failures independent without hiding identities", async ({
    page,
  }) => {
    await page.goto(path);
    const rows = page.locator(".event-player-row");
    for (const [id, values] of [
      [base + 1, ["—", "7,890.45"]],
      [base + 3, ["#12,345", "—"]],
      [base + 10, ["—", "—"]],
      [base + 13, ["—", "—"]],
      [base + 14, ["—", "7,890.45"]],
    ] as const)
      await expect(
        rows
          .filter({
            has: page.locator(`a[href="https://osu.ppy.sh/users/${id}"]`),
          })
          .locator("dd"),
      ).toHaveText([...values]);
    for (const id of [base + 11, base + 12])
      await expect(
        rows.filter({
          has: page.locator(`a[href="https://osu.ppy.sh/users/${id}"]`),
        }),
      ).toContainText("#12,345");
    expect(await page.content()).not.toMatch(
      /PRIVATE_DIRECTORY_ANSWER|SYNTHETIC_PRIVATE_CONTACT|SYNTHETIC_INTERNAL_REASON/,
    );
    expect(
      (await page.goto("/tournaments/private-test-cup/players"))?.status(),
    ).toBe(404);
  });
  test("legacy view and page links retain every accepted player without pagination", async ({
    page,
  }) => {
    await addPlayers(Array.from({ length: 17 }, (_, i) => base + 20 + i));
    for (const query of ["", "?view=list", "?view=cards&page=2"]) {
      await page.goto(path + query);
      await expect(page.locator(".event-player-row")).toHaveCount(25);
      await expect(
        page.getByRole("navigation", { name: "Player directory pages" }),
      ).toHaveCount(0);
    }
  });
  test("native search handles literal text and invalid filters without exposing private registrations", async ({
    page,
  }) => {
    const search = "名单 + & English";
    await db().execute(
      sql`UPDATE users SET username = ${search} WHERE osu_id = ${base}`,
    );
    await page.goto(path);
    await page.getByRole("textbox", { name: "Search players" }).fill(search);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".event-player-row")).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("q")).toBe(search);
    await page
      .getByRole("textbox", { name: "Search players" })
      .fill("not-a-visible-player");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".event-player-row")).toHaveCount(0);
    for (const invalid of [
      "view=other",
      "view=list&view=cards",
      "page=zero",
      "private=true",
    ]) {
      await page.goto(`${path}?${invalid}`);
      await expect(
        page.getByRole("link", { name: "Clear filters", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".event-player-row")).toHaveCount(0);
    }
  });
  test("server-rendered identities and search work without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      await context.addCookies([
        { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
      ]);
      await context.route("**/api/osu-images/avatar/*", (route) => route.abort());
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:3100" + path);
      await expect(page.locator(".event-player-row")).toHaveCount(8);
      await page
        .getByRole("textbox", { name: "Search players" })
        .fill(String(base));
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page.locator(".event-player-row")).toHaveCount(1);
    } finally {
      await context.close();
    }
  });
  test("long identities remain in bounds and profile links support keyboard navigation", async ({
    page,
  }) => {
    await db().execute(
      sql`UPDATE users SET username = ${"中文與EnglishVeryLongUsername".repeat(4)} WHERE osu_id=${base}`,
    );
    await page.goto(`${path}?q=${base}`);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".event-player-row")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const link = page.locator(
      `.event-player-row a[href="/players/${base}?edition=test-cup"]`,
    );
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      `http://127.0.0.1:3100/players/${base}?edition=test-cup`,
    );
  });
});
