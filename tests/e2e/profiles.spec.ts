import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
import { englishStorage } from "../fixtures/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  registrations,
  staffRoles,
  userProfileCache,
} from "../../src/db/schema";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { seedPublicDirectory } from "../fixtures/players";
import { seedSession } from "./session";
test.describe("published osu! profiles", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("reads dated standard snapshots anonymously and enforces private lookup permissions", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const base = isMobile ? 261101 : 261001;
    const fixture = await seedPublicDirectory(base);
    await db().delete(userProfileCache).where(eq(userProfileCache.osuId, base));
    {
      const mode = "osu";
      const profile = normalizeOsuProfile(
        {
          ...profileResponse,
          id: base,
          cover: null,
          username: `Synthetic Profile ${base}`,
          statistics: {
            ...profileResponse.statistics,
            pp: 1234.56,
          },
        },
        base,
        mode,
      );
      await db()
        .insert(userProfileCache)
        .values({
          osuId: base,
          mode,
          profile,
          attemptedAt: new Date(),
          retryAt: new Date(Date.now() + 60000),
        });
    }
    expect(
      (await context.cookies()).filter(
        (cookie) => !isAutomaticPreferenceCookie(cookie),
      ),
    ).toEqual([]);
    const response = await context.request.get(`/api/players/${base}`);
    expect(response.status()).toBe(200);
    expect(JSON.stringify(await response.json())).not.toMatch(
      /PRIVATE_CONTACT|INTERNAL_REASON|account_history|answers|statusReason/,
    );
    for (const id of [fixture.privateId, 651307])
      expect((await context.request.get(`/api/players/${id}`)).status()).toBe(
        404,
      );
    expect(
      (await context.request.get(`/api/players/${base}?mode=invalid`)).status(),
    ).toBe(400);
    expect(
      (await context.request.get(`/api/players/${base}?refresh=true`)).status(),
    ).toBe(400);
    const origin = { origin: "http://127.0.0.1:3100" };
    expect(
      (
        await context.request.post("/api/admin/profiles", {
          headers: origin,
          data: { input: String(base) },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await context.request.post(`/api/players/${base}`, {
          headers: origin,
          data: {},
        })
      ).status(),
    ).toBe(405);
    await page.goto(`/tournaments/test-cup/players?q=${base}`);
    await page.locator(`a[href="/players/${base}?edition=test-cup"]`).click();
    await expect(
      page
        .getByRole("heading", {
          name: `Synthetic Profile ${base}`,
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(page.getByText("1,234.56 pp", { exact: true })).toBeVisible();
    await expect(
      page.getByText("9,007,199,254,740,993", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Last updated/)).toBeVisible();
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
    await page.screenshot({
      path: info.outputPath("profile.png"),
      fullPage: true,
      animations: "disabled",
    });
    await expect(
      page.getByRole("link", { name: "← Tournament players", exact: true }),
    ).toHaveAttribute("href", "/tournaments/test-cup/players");
    await expect(
      page.getByRole("heading", { name: "Published participation" }),
    ).toBeVisible();
    const operator = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      await operator.addCookies([await seedSession(base + 10)]);
      const lookup = () =>
        operator.request.post("/api/admin/profiles", {
          headers: origin,
          data: { input: String(base) },
        });
      expect((await lookup()).status()).toBe(403);
      await db()
        .insert(staffRoles)
        .values({
          userId: base + 10,
          role: "mappooler",
          editionSlug: "test-cup",
          grantedBy: base + 10,
        });
      expect((await lookup()).status()).toBe(403);
      await db()
        .insert(staffRoles)
        .values({
          userId: base + 10,
          role: "referee",
          editionSlug: "test-cup",
          grantedBy: base + 10,
        });
      expect((await lookup()).status()).toBe(403);
      await operator.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
      expect((await lookup()).status()).toBe(200);
      expect(
        (
          await operator.request.post("/api/admin/profiles", {
            headers: { origin: "https://evil.example" },
            data: { input: String(base) },
          })
        ).status(),
      ).toBe(403);
      const staffPage = await operator.newPage();
      expect((await staffPage.goto("/admin/profiles"))?.status()).toBe(404);
      await expect(
        staffPage.getByRole("button", { name: "Look up profile", exact: true }),
      ).toHaveCount(0);
      await staffPage.goto("/admin");
      await expect(
        staffPage.getByRole("link", {
          name: "osu! profile lookup",
          exact: true,
        }),
      ).toHaveCount(0);
      await staffPage.close();
    } finally {
      await operator.close();
    }
    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(eq(registrations.userId, base));
    expect((await context.request.get(`/api/players/${base}`)).status()).toBe(
      404,
    );
    const html = await (await context.request.get(`/players/${base}`)).text();
    expect(html).not.toContain("1,234.56 pp");
  });
});
