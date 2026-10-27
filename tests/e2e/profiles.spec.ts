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
  test("reads dated snapshots anonymously, switches modes and enforces private lookup permissions", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const base = isMobile ? 261101 : 261001;
    const theme = isMobile ? "dark" : "light";
    await context.addCookies([
      { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
    ]);
    const fixture = await seedPublicDirectory(base);
    await db().delete(userProfileCache).where(eq(userProfileCache.osuId, base));
    for (const mode of ["osu", "taiko"] as const) {
      const profile = normalizeOsuProfile(
        {
          ...profileResponse,
          id: base,
          cover: null,
          username: `Synthetic Profile ${base}`,
          statistics: {
            ...profileResponse.statistics,
            pp: mode === "osu" ? 1234.56 : 99.5,
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
        (c) => !["oclr-locale", "oclr-theme"].includes(c.name),
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
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.locator(`a[href="/players/${base}?edition=test-cup"]`).click();
    expect(
      (
        await context.request.get(
          `/api/players/${base}?edition=private-test-cup`,
        )
      ).status(),
    ).toBe(404);
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
    await page.setViewportSize(
      isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
    await page.screenshot({
      path: info.outputPath("profile.png"),
      fullPage: true,
      animations: "disabled",
    });
    await expect(
      page.getByRole("link", { name: "← Tournament players", exact: true }),
    ).toHaveAttribute("href", "/tournaments/test-cup/players");
    await expect(
      page.getByRole("button", { name: "View ruleset", exact: true }),
    ).toHaveCount(0);
    const ruleset = page.getByRole("button", {
      name: "Ruleset",
      exact: true,
    });
    await ruleset.click();
    const osuMode = page.getByRole("menuitemradio", {
      name: "osu!",
      exact: true,
    });
    const taikoMode = page.getByRole("menuitemradio", {
      name: "osu!taiko",
      exact: true,
    });
    const maniaMode = page.getByRole("menuitemradio", {
      name: "osu!mania",
      exact: true,
    });
    await expect(osuMode).toBeFocused();
    await expect(osuMode).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowDown");
    await expect(taikoMode).toBeFocused();
    await expect(taikoMode).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Home");
    await expect(osuMode).toBeFocused();
    await page.keyboard.press("End");
    await expect(maniaMode).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(ruleset).toBeFocused();
    await expect(page.getByRole("menu")).toHaveCount(0);

    let releaseTaikoResponse!: () => void;
    let taikoResponseHeld = false;
    const taikoResponseGate = new Promise<void>((resolve) => {
      releaseTaikoResponse = resolve;
    });
    const taikoLoading = page.getByRole("status", { name: "Loading…" });
    await page.route(`**/players/${base}**`, async (route) => {
      if (new URL(route.request().url()).searchParams.get("mode") !== "taiko") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      taikoResponseHeld = true;
      await taikoResponseGate;
      await route.fulfill({ response });
    });
    await ruleset.click();
    try {
      await page
        .getByRole("menuitemradio", { name: "osu!taiko", exact: true })
        .click();
      await expect.poll(() => taikoResponseHeld).toBe(true);
      await expect(taikoLoading).toBeVisible();
      await expect(taikoLoading).toHaveAttribute("aria-busy", "true");
      await expect(ruleset).toBeDisabled();
      await page.screenshot({
        path: info.outputPath("ruleset-spinner.png"),
        animations: "disabled",
      });
      await expect(taikoLoading.locator("img")).toHaveCount(0);
      expect(await taikoLoading.innerText()).toBe("");
      const spinner = taikoLoading.locator("span");
      await expect(spinner).toBeVisible();
      const styles = await spinner.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          width: style.width,
          height: style.height,
          borderTopColor: style.borderTopColor,
          borderLeftColor: style.borderLeftColor,
          backdrop: getComputedStyle(node.parentElement!).backgroundColor,
        };
      });
      expect(styles.width).toBe("48px");
      expect(styles.height).toBe("48px");
      expect(styles.borderTopColor).not.toBe(styles.borderLeftColor);
      expect(styles.backdrop).not.toBe("rgba(0, 0, 0, 0)");
    } finally {
      releaseTaikoResponse();
    }
    await expect(taikoLoading).toHaveCount(0);
    await page.unroute(`**/players/${base}**`);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("mode"))
      .toBe("taiko");
    expect(new URL(page.url()).searchParams.get("edition")).toBe("test-cup");
    await expect(page.getByText("99.5 pp", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "osu!taiko profile snapshot" }),
    ).toBeVisible();
    let releaseManiaResponse!: () => void;
    let maniaResponseHeld = false;
    const maniaResponseGate = new Promise<void>((resolve) => {
      releaseManiaResponse = resolve;
    });
    await page.route(`**/players/${base}**`, async (route) => {
      if (new URL(route.request().url()).searchParams.get("mode") !== "mania") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      maniaResponseHeld = true;
      await maniaResponseGate;
      await route.fulfill({ response });
    });
    await ruleset.click();
    try {
      await page
        .getByRole("menuitemradio", { name: "osu!mania", exact: true })
        .click();
      await expect.poll(() => maniaResponseHeld).toBe(true);
      await expect(taikoLoading).toBeVisible();
      await expect(taikoLoading).toHaveAttribute("aria-busy", "true");
    } finally {
      releaseManiaResponse();
    }
    await expect(taikoLoading).toHaveCount(0);
    await page.unroute(`**/players/${base}**`);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("mode"))
      .toBe("mania");
    expect(new URL(page.url()).searchParams.get("edition")).toBe("test-cup");
    await expect(
      page.getByRole("status").filter({ hasText: "temporarily unavailable" }),
    ).toBeVisible();
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
