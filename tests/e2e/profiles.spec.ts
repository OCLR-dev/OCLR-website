import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
import { englishStorage } from "../fixtures/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  etxRatingCache,
  registrations,
  sipRatingCache,
  staffRoles,
  userProfileCache,
} from "../../src/db/schema";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { sipResponse } from "../fixtures/sip-response";
import { seedPublicDirectory } from "../fixtures/players";
import { seedSession } from "./session";
test.describe("published osu! profiles", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("opens saved rating breakdowns on the public player route with and without an osu! snapshot", async ({
    page,
    isMobile,
  }) => {
    const uid = isMobile ? 262801 : 262701;
    const { privateId } = await seedPublicDirectory(uid);
    await db().delete(userProfileCache).where(eq(userProfileCache.osuId, uid));
    await db()
      .insert(userProfileCache)
      .values({
        osuId: uid,
        mode: "osu",
        profile: null,
        attemptedAt: new Date(),
        retryAt: new Date(Date.now() + 600000),
      });
    await page.goto(`/players/${uid}`);
    for (const provider of ["SIP", "ETX"]) {
      const label = page.getByRole("term").filter({ hasText: provider });
      await expect(label.locator("+ dd")).toHaveText("No rating data", {
        useInnerText: true,
      });
    }
    await expect(
      page.getByRole("heading", { name: "Player ratings", exact: true }),
    ).toHaveCount(0);

    const fetchedAt = new Date("2025-02-12T12:00:00Z");
    const { modifications, skillsets } = sipResponse(uid, 0);
    await db()
      .insert(sipRatingCache)
      .values({
        osuId: uid,
        fetchedAt,
        value: null,
        snapshot: { rating: null, modifications, skillsets },
      });
    await db()
      .insert(etxRatingCache)
      .values({
        osuId: uid,
        attemptedOn: "2025-02-12",
        fetchedAt,
        rating: {
          value: 5.125,
          provisional: null,
          outdated: false,
          mods: { NM: 0, HR: 5.125 },
        },
      });
    const wire = await page.request.get(
      `/api/v1/players/${uid}/oclr-profile?ratings=2`,
    );
    expect(wire.ok()).toBeTruthy();
    expect((await wire.json()).data.ratings.etx).toMatchObject({
      source: "api",
      provisional: null,
      mods: { NM: 0, HR: 5.125 },
    });
    expect(
      (
        await page.request.get(
          `/api/v1/players/${privateId}/oclr-profile?ratings=2`,
        )
      ).status(),
    ).toBe(404);

    await page.goto(`/players/${uid}`);
    await expect(
      page.getByText("osu! statistics are temporarily unavailable."),
    ).toBeVisible();
    for (const name of [
      "ETX · Mod ratings",
      "SIP · Mod ratings",
      "SIP · Skillset ratings",
    ]) {
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "About the ETX rating" }).click();
    const note = page.locator("[popover]:popover-open");
    await expect(note).toContainText("0.00 ★");
    await expect(note).toContainText("Elitebotix API · OCLR fetch time");
    await page.keyboard.press("Escape");

    const profile = normalizeOsuProfile(
      { ...profileResponse, id: uid, username: `Synthetic Profile ${uid}` },
      uid,
      "osu",
    );
    await db()
      .update(userProfileCache)
      .set({ profile })
      .where(eq(userProfileCache.osuId, uid));
    await page.reload();
    await page
      .locator(".bws-card")
      .getByRole("button", { name: "About the SIP rating" })
      .click();
    await expect(note.getByText("Hard Rock: 0", { exact: true })).toBeVisible();
    await expect(note.getByText("High AR: -12", { exact: true })).toBeVisible();
    await expect(note.locator("time")).toHaveAttribute(
      "datetime",
      fetchedAt.toISOString(),
    );
  });
  test("returns from a season to the same player's full profile", async ({
    page,
    isMobile,
  }) => {
    const uid = isMobile ? 261501 : 261401;
    await seedPublicDirectory(uid);
    await page.goto(`/players/${uid}?edition=test-cup`);
    const back = page.getByRole("link", {
      name: "← Tournament players",
      exact: true,
    });
    const notice = page.getByRole("link", {
      name: "You’re viewing this player’s match data for a single season. Click here to view all data.",
    });
    const dismiss = page.getByRole("button", {
      name: "Dismiss single-season notice",
    });
    await expect(back).toHaveCount(0);
    await expect(notice).toHaveAttribute("href", `/players/${uid}`);
    const selectedUrl = page.url();
    await dismiss.press("Enter");
    await expect(notice).toHaveCount(0);
    await expect(page).toHaveURL(selectedUrl);

    await page.reload();
    await notice.click();
    await expect(page).toHaveURL(new RegExp(`/players/${uid}$`));
    await expect(notice).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "← Tournaments", exact: true }),
    ).toHaveCount(0);
    await page.goBack();
    await expect(notice).toBeVisible();
    await expect(back).toHaveCount(0);
  });
  test("reads dated standard snapshots anonymously and enforces private lookup permissions", async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
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
    const publicProfile = await response.json();
    expect(publicProfile.snapshot.profile.statistics.pp).toBe(1234.56);
    expect(JSON.stringify(publicProfile)).not.toMatch(
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
    await expect(
      page.locator(".bws-card").getByText("1,234", { exact: true }),
    ).toBeVisible();
    const dismiss = page.getByRole("button", {
      name: "Dismiss single-season notice",
    });
    await expect(dismiss).toBeVisible();
    const notice = page.locator(".notice").filter({ has: dismiss });
    const noticeBox = (await notice.boundingBox())!;
    const profileBox = (await page.locator(".profile-summary").boundingBox())!;
    expect(noticeBox.y + noticeBox.height).toBeLessThan(profileBox.y);
    await expect(
      page.getByText("9,007,199,254,740,993", { exact: true }),
    ).toBeVisible();
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
    await expect(
      page.getByRole("link", { name: "← Tournament players", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Career" })).toBeVisible();
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
    expect(html).not.toContain(`Synthetic Profile ${base}`);
  });
});
