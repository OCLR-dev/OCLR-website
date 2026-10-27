import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  captains,
  teams,
  userProfileCache,
  registrations,
  mappools,
  mappoolEntries,
} from "../../src/db/schema";
import { seedSession } from "./session";
import { seedPublicPolish, landscapeFixture } from "../fixtures/public-polish";
import { seedPublicDirectory } from "../fixtures/players";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { mappoolCommand } from "../../src/lib/mappools";
import { fixtureCommand } from "../../src/lib/fixtures";
import { openTournamentTool } from "./navigation";
import { toggleTheme } from "./theme";
const origin = { origin: "http://127.0.0.1:3100" };
const locales = ["en", "zh-Hans", "zh-Hant"];
async function preferences(
  context: BrowserContext,
  locale: string,
  theme = "light",
) {
  await context.addCookies([
    { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
    { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
  ]);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}
test.describe("public and operational follow-ups", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(420000);
  test.beforeEach(async ({ context }) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await context.route("https://assets.ppy.sh/**", (r) =>
      r.fulfill({ contentType: "image/svg+xml", body: landscapeFixture }),
    );
    await context.route("https://a.ppy.sh/**", (r) =>
      r.fulfill({ contentType: "image/svg+xml", body: landscapeFixture }),
    );
  });
  test.afterAll(closeDb);
  test("keeps the complete public journey in one appearance while isolating private tools", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const admin = isMobile ? 70001 : 60001,
      base = isMobile ? 993100 : 993000;
    const cookie = await seedSession(admin);
    const seed = await seedPublicPolish(admin, base + 99, base);
    await seedEditions([
      {
        ...edition,
        name: "OCLR public UI test",
        branding: {
          logo: "/oclr-s11-square-logo.webp",
          background: "/oclr-s11-website-background.webp",
          keyVisual: "/oclr-s11-key-visual.webp",
        },
      },
    ]);
    const profile = normalizeOsuProfile(
      {
        ...profileResponse,
        id: seed.home.captainId ?? base,
        badges: [],
        statistics: { global_rank: 10000 },
      },
      seed.home.captainId ?? base,
      "osu",
    );
    // Use the fixture's known accepted captain ID, without provider list fan-out.
    const [captain] = await db()
      .select()
      .from(captains)
      .where(eq(captains.editionSlug, "test-cup"));
    await db()
      .insert(userProfileCache)
      .values({
        osuId: captain.userId,
        mode: "osu",
        profile: { ...profile, osuId: captain.userId },
        attemptedAt: new Date(),
        retryAt: new Date(),
      });
    const routes = [
      "/",
      "/tournaments",
      "/tournaments/test-cup",
      "/tournaments/test-cup/rules",
      "/tournaments/test-cup/teams",
      "/tournaments/test-cup/players",
      `/tournaments/test-cup/mappools/${seed.poolId}`,
      `/players/${captain.userId}?edition=test-cup`,
      "/news",
      "/about",
      "/privacy",
      "/tournaments/test-cup/schedule",
      "/tournaments/test-cup/results",
      "/tournaments/test-cup/bracket",
    ];
    for (const locale of locales)
      for (const theme of ["light", "dark"]) {
        await preferences(context, locale, theme);
        await page.setViewportSize({
          width: isMobile ? 390 : 1440,
          height: 900,
        });
        let height: number | null = null;
        for (const [index, route] of routes.entries()) {
          expect((await page.goto(route))?.status()).toBe(200);
          await expect(page.locator(".public-site")).toHaveCSS(
            "color-scheme",
            theme,
          );
          await expect(page.locator(".public-site")).toHaveCSS(
            "background-color",
            theme === "light" ? "rgb(244, 241, 247)" : "rgb(9, 12, 23)",
          );
          const current = (await page.locator(".site-header").boundingBox())!
            .height;
          if (height !== null) expect(current).toBeCloseTo(height, 1);
          height = current;
          await noOverflow(page);
          await page.screenshot({
            path: info.outputPath(`journey-${locale}-${theme}-${index}.png`),
            fullPage: true,
          });
          if ([0, 3, 10].includes(index)) await accessible(page);
          if (index === 3) {
            const heading = await page.locator("main h1").boundingBox();
            expect(heading!.height).toBeLessThan(160);
            if (!isMobile)
              expect(
                (await page.locator(".rules-handbook").boundingBox())!.y,
              ).toBeLessThan(750);
            const nav = page.locator(".tournament-navigation nav");
            if (isMobile) await page.locator(".tournament-menu").click();
            await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
            const inactive = nav.locator("a:not([aria-current])").first();
            await inactive.hover();
            await inactive.focus();
            expect(
              await inactive.evaluate(
                (el) => getComputedStyle(el, "::before").content,
              ),
            ).not.toBe('""');
            if (isMobile) await page.keyboard.press("Escape");
          }
        }
        for (const section of [
          "schedule",
          "mappools",
          "teams",
          "rules",
          "results",
          "bracket",
        ]) {
          await page.goto(`/tournaments/polish-empty-test/${section}`);
          expect(
            (await page.locator("main h1").boundingBox())!.height,
          ).toBeLessThan(160);
          await noOverflow(page);
          await page.screenshot({
            path: info.outputPath(`empty-${locale}-${theme}-${section}.png`),
            fullPage: true,
          });
        }
        await toggleTheme(page);
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          theme === "light" ? "dark" : "light",
        );
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          theme === "light" ? "dark" : "light",
        );
      }
    await context.addCookies([cookie]);
    await page.goto("/admin");
    await expect(page.locator(".private-site")).toBeVisible();
    await expect(page.locator(".theme-control")).toBeVisible();
    await expect(page.locator(".themed-site")).toHaveCSS(
      "color-scheme",
      (await page.locator("html").getAttribute("data-theme"))!,
    );
  });
  test("redirects Participants to one captain entry in Players and keeps team rosters publication-safe", async ({
    page,
    context,
    isMobile,
  }, info) => {
    await seedSession(isMobile ? 70001 : 60001);
    const seed = await seedPublicDirectory(isMobile ? 994100 : 994000);
    await seedEditions([
      {
        ...edition,
        slug: "empty-followup-test",
        rules: null,
        schedule: [],
        registration: null,
      },
    ]);
    const redirect = await context.request.get(
      "/tournaments/test-cup/participants",
      { maxRedirects: 0 },
    );
    expect(redirect.status()).toBe(308);
    expect(redirect.headers().location).toBe("/tournaments/test-cup/players");
    for (const locale of locales)
      for (const theme of ["light", "dark"]) {
        await preferences(context, locale, theme);
        await page.goto("/tournaments/test-cup/participants");
        await expect(page).toHaveURL(/\/test-cup\/players$/);
        await expect(
          page.locator('.tournament-navigation a[href$="/participants"]'),
        ).toHaveCount(0);
        await expect(page.locator('a[href$="/teams"]')).not.toHaveCount(0);
        await expect(
          page.locator(".edition-players .event-player-row"),
        ).toHaveCount(3);
        const captain = "Captain";
        await expect(
          page
            .locator(".edition-players .event-player-identity .muted")
            .filter({ hasText: new RegExp(`^${captain}`) }),
        ).toHaveCount(1);
        expect(await page.locator("main").innerText()).not.toMatch(
          /PRIVATE_CONTACT|INTERNAL_REASON|Private Applicant/,
        );
        for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await noOverflow(page);
          await page.screenshot({
            path: info.outputPath(`players-${locale}-${theme}-${width}.png`),
            fullPage: true,
          });
        }
        await page.goto("/tournaments/test-cup/teams");
        await expect(
          page.locator(".public-team-card .public-player-identity"),
        ).toHaveCount(0);
        await expect(page.locator(".public-team-card")).toHaveCount(1);
        await page.screenshot({
          path: info.outputPath(`teams-${locale}-${theme}.png`),
          fullPage: true,
        });
        await page.goto(`/tournaments/test-cup/teams/${seed.teamId}`);
        await expect(page.locator(".public-roster-grid > li")).toHaveCount(2);
        await expect(
          page.locator(".public-roster-grid .badge").filter({
            hasText:
              locale === "en"
                ? "Captain"
                : locale === "zh-Hans"
                  ? "队长"
                  : "隊長",
          }),
        ).toHaveCount(1);
        await page.goto("/tournaments/empty-followup-test/teams");
        await expect(page.locator(".page-heading")).toBeVisible();
        expect(
          (await page.locator("main h1").boundingBox())!.height,
        ).toBeLessThan(160);
        expect(
          (await page.locator(".empty-state").boundingBox())!.height,
        ).toBeLessThan(230);
        await page.screenshot({
          path: info.outputPath(`empty-teams-${locale}-${theme}.png`),
          fullPage: true,
        });
        await accessible(page);
      }
    await db()
      .update(teams)
      .set({ rosterPublished: false, finalizedAt: null })
      .where(eq(teams.id, seed.teamId));
    await page.goto(`/tournaments/test-cup/teams/${seed.teamId}`);
    await expect(page.locator(".public-roster-grid")).toHaveCount(0);
    await db()
      .update(captains)
      .set({ published: false })
      .where(eq(captains.userId, seed.captainId));
    await preferences(context, "en");
    await page.goto("/tournaments/test-cup/players");
    await expect(
      page
        .locator(".edition-players .event-player-identity .muted")
        .filter({ hasText: /^Captain$/ }),
    ).toHaveCount(0);
    expect(
      (
        await context.request.get("/tournaments/private-test-cup/participants")
      ).status(),
    ).toBe(404);
  });
  test("reviews mode-specific BWS privately and shows only the aggregate to anonymous visitors", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const cookie = await seedSession(isMobile ? 70001 : 60001);
    const seed = await seedPublicDirectory(isMobile ? 995100 : 995000);
    const badges = [
      "Synthetic standard tournament",
      "Synthetic taiko tournament",
      "Synthetic contributor award",
    ].map((description) => ({
      description,
      awarded_at: "2026-01-01T00:00:00Z",
      url: "https://osu.ppy.sh/wiki/en/Tournaments",
    }));
    for (const id of [seed.captainId, seed.memberId])
      await db()
        .insert(userProfileCache)
        .values({
          osuId: id,
          mode: "osu",
          profile: normalizeOsuProfile(
            {
              ...profileResponse,
              id,
              badges: id === seed.memberId ? [] : badges,
              statistics: { global_rank: 10000, pp: 1234.567 },
            },
            id,
            "osu",
          ),
          attemptedAt: new Date(),
          retryAt: new Date(),
        });
    const [registration] = await db()
      .select()
      .from(registrations)
      .where(eq(registrations.userId, seed.captainId));
    const endpoint = `/api/admin/tournaments/test-cup/registrations/${registration.id}/bws`;
    expect((await context.request.get(`${endpoint}?mode=osu`)).status()).toBe(
      401,
    );
    await context.addCookies([cookie]);
    await page.goto(
      `/admin/tournaments/test-cup/registrations/${registration.id}`,
    );
    const section = page.locator(".bws-review");
    await expect(
      section.getByRole("button", { name: "Load BWS profile" }),
    ).toBeEnabled();
    await section.getByRole("button", { name: "Load BWS profile" }).click();
    await expect(section.locator(".bws-summary")).toContainText(
      "pending staff review",
    );
    await section
      .locator(".badge-review-list select")
      .nth(0)
      .selectOption("osu");
    await section
      .locator(".badge-review-list select")
      .nth(1)
      .selectOption("other");
    await section
      .locator(".badge-review-list select")
      .nth(2)
      .selectOption("other");
    await expect(
      section.getByLabel("Badge classification evidence"),
    ).toHaveCount(0);
    await section.getByRole("button", { name: "Save badge review" }).click();
    await expect(section.locator(".bws-value").first()).toHaveText(
      new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(
        10000 ** 0.9937,
      ),
    );
    await expect(section.locator(".bws-value").nth(1)).toHaveText(
      new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
        1234.567 ** 1.0063,
      ),
    );
    expect(
      (
        await context.request.post(endpoint, {
          headers: { origin: "https://evil.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
      for (const theme of ["light", "dark"])
        for (const locale of locales) {
          await preferences(context, locale, theme);
          await context.addCookies([
            {
              name: "oclr-appearance",
              value: appearance,
              url: "http://127.0.0.1:3100",
            },
          ]);
          await page.goto(
            `/admin/tournaments/test-cup/registrations/${registration.id}`,
          );
          await section.locator(".actions button").click();
          await expect(section.locator(".bws-value").first()).toBeVisible();
          await page.setViewportSize({
            width: isMobile ? 320 : 1440,
            height: 900,
          });
          await noOverflow(page);
          await page.screenshot({
            path: info.outputPath(
              `staff-bws-${locale}-${appearance}-${theme}.png`,
            ),
            fullPage: true,
          });
          await accessible(page);
        }
    const guest = await browser.newContext({
      baseURL: "http://127.0.0.1:3100",
      viewport: { width: isMobile ? 320 : 1440, height: 900 },
    });
    try {
      const publicPage = await guest.newPage();
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
        for (const theme of ["light", "dark"])
          for (const locale of locales) {
            await preferences(guest, locale, theme);
            await guest.addCookies([
              {
                name: "oclr-appearance",
                value: appearance,
                url: "http://127.0.0.1:3100",
              },
            ]);
            await publicPage.goto(
              `/players/${seed.captainId}?edition=test-cup`,
            );
            await expect(
              publicPage.locator(".bws-value").first(),
            ).toBeVisible();
            expect(await publicPage.locator("main").innerText()).not.toContain(
              "PRIVATE_BWS_REVIEW_EVIDENCE",
            );
            const data = await (
              await guest.request.get(
                `/api/players/${seed.captainId}?edition=test-cup`,
              )
            ).json();
            expect(data.bws).toMatchObject({
              badgeCount: 1,
              value: 10000 ** 0.9937,
              rawPp: 1234.567,
              adjustedPp: 1234.567 ** 1.0063,
            });
            expect(JSON.stringify(data)).not.toMatch(
              /PRIVATE_BWS_REVIEW_EVIDENCE|classifications|reviewedBy/,
            );
            await noOverflow(publicPage);
            await publicPage.screenshot({
              path: info.outputPath(
                `public-bws-${locale}-${appearance}-${theme}.png`,
              ),
              fullPage: true,
            });
          }
      await preferences(guest, "en");
      await publicPage.goto(
        `/players/${seed.memberId}?edition=test-cup`,
      );
      await expect(publicPage.locator(".bws-value").first()).toHaveText(
        "10,000",
      );
    } finally {
      await guest.close();
    }
  });
  test("deletes an unused fixture only through confirmed edition administration", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const admin = isMobile ? 70001 : 60001,
      cookie = await seedSession(admin);
    process.env.ADMIN_OSU_IDS = String(admin);
    const actor = { osuId: admin, username: "Synthetic Admin" };
    const maps = await mappoolCommand(actor, "test-cup", {
      action: "round_create",
      stage: "group",
      name: "Synthetic deletion round",
      position: 1,
      confirmed: true,
    });
    const endpoint = "/api/admin/tournaments/test-cup/matches";
    expect(
      (
        await context.request.post(endpoint, { headers: origin, data: {} })
      ).status(),
    ).toBe(401);
    await context.addCookies([cookie]);
    for (const [index, locale] of locales.entries()) {
      const data = await fixtureCommand(actor, "test-cup", {
        action: "create",
        confirmed: true,
        roundId: maps.rounds[0].id,
        label: `Synthetic mistaken GS${index + 1}`,
        position: 1,
        homeTeamId: null,
        awayTeamId: null,
        scheduledAt: null,
        timeZone: "UTC",
        status: "scheduled",
        mappoolId: null,
        homeSourceId: null,
        homeSourceOutcome: null,
        awaySourceId: null,
        awaySourceOutcome: null,
        refereeIds: [admin],
      });
      const fixture = data.fixtures[0];
      await preferences(context, locale);
      await page.goto("/admin/tournaments/test-cup/matches");
      await page.locator(".fixture-card .actions button").last().click();
      const manage = page.locator(".fixture-editor-dialog");
      await manage.locator(".fixture-delete-section > button").click();
      const confirmation = manage.locator(
        ".fixture-delete-section dialog[open]",
      );
      await expect(confirmation).toContainText(fixture.label);
      await expect(confirmation).toContainText("Synthetic deletion round");
      await page.setViewportSize({ width: isMobile ? 320 : 1440, height: 900 });
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`delete-fixture-${locale}.png`),
        fullPage: true,
      });
      await confirmation.locator(".actions button").last().click();
      await expect(manage).toBeVisible();
      await manage.locator(".fixture-delete-section > button").click();
      await confirmation.locator(".actions button").first().click();
      await expect(manage).not.toBeVisible();
      await expect(page.locator(".fixture-card")).toHaveCount(0);
      expect(
        (
          await context.request.get(
            `/api/tournaments/test-cup/matches/${fixture.id}`,
          )
        ).status(),
      ).toBe(404);
      await expect(
        page.locator(".fixture-toolbar > button").first(),
      ).toBeFocused();
    }
  });
  test("keeps nineteen-map workbench actions compact and opens only one visible editor", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const admin = isMobile ? 70001 : 60001,
      cookie = await seedSession(admin);
    process.env.ADMIN_OSU_IDS = String(admin);
    const actor = { osuId: admin, username: "Synthetic Admin" };
    let workspace = await mappoolCommand(actor, "test-cup", {
      action: "round_create",
      stage: "group",
      name: "GS",
      position: 1,
      confirmed: true,
    });
    workspace = await mappoolCommand(actor, "test-cup", {
      action: "pool_create",
      roundId: workspace.rounds[0].id,
      name: "Synthetic nineteen-map pool",
      confirmed: true,
    });
    const pool = workspace.pools[0];
    await db()
      .insert(mappoolEntries)
      .values(
        Array.from({ length: 19 }, (_, i) => ({
          poolId: pool.id,
          category: "NM" as const,
          position: i + 1,
          beatmapId: i === 0 ? 123 : i === 1 ? 456 : 1000 + i,
          metadata: {
            setId: 42,
            title:
              i === 0
                ? "Synthetic Browser Song"
                : `Synthetic long title ${i} 中文谱面名称`,
            artist: "Synthetic Artist",
            difficulty: "Expert",
            mapper: "Synthetic Mapper",
            stars: 4.5,
            bpm: 180,
            duration: 123,
          },
        })),
      );
    await mappoolCommand(actor, "test-cup", {
      action: "pool_publish",
      poolId: pool.id,
      expectedVersion: 0,
      published: true,
      confirmed: true,
    });
    await context.addCookies([cookie]);
    for (const locale of locales) {
      await preferences(context, locale);
      await page.goto("/admin/tournaments/test-cup/mappools");
      for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await noOverflow(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath(`mappool-header-${locale}-${width}.png`),
        });
        const actions = page.locator(".mappool-entry-action-row").first();
        for (const button of await actions.locator(":scope > button").all())
          expect((await button.boundingBox())!.height).toBeCloseTo(44, 1);
        await actions.locator("button").first().focus();
        await page.screenshot({
          path: info.outputPath(`mappool-actions-${locale}-${width}.png`),
        });
      }
      await page
        .locator(".mappool-entry-action-row")
        .first()
        .locator("button")
        .first()
        .press("Enter");
      await expect(
        page.locator(".mappool-inline-editor").getByRole("textbox"),
      ).toBeFocused();
      await expect(page.locator(".mappool-inline-editor")).toHaveCount(1);
      await expect(page.locator(".mappool-attributes")).toBeVisible();
      await page
        .locator(".mappool-entry-action-row")
        .nth(1)
        .locator("button")
        .first()
        .click();
      await expect(page.locator(".mappool-inline-editor")).toHaveCount(1);
      await page.screenshot({
        path: info.outputPath(`mappool-inline-${locale}.png`),
      });
      await page.locator(".mappool-inline-heading button:visible").click();
      await expect(page.locator(".mappool-inline-editor")).toHaveCount(0);
      await accessible(page);
    }
    await preferences(context, "en");
    await page.goto("/admin/tournaments/test-cup/mappools");
    await page.locator(".mappool-pool-actions > button").click();
    await page
      .locator(".mappool-pool-actions dialog[open] .actions button")
      .first()
      .click();
    await expect(page.locator(".mappool-pool-heading .badge")).toHaveText(
      "Draft",
    );
    await page
      .getByRole("button", { name: "Edit or replace NM1", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Beatmap URL or ID", exact: true })
      .fill("456");
    await expect(page.getByLabel("Beatmap preview")).toContainText(
      "Synthetic Replacement Song",
    );
    await page
      .getByRole("button", { name: "Save map slot", exact: true })
      .click();
    await expect(page.locator(".mappool-inline-editor")).toHaveCount(0);
    const first = page.locator(".mappool-entry-controls").first();
    await expect(first).toContainText("Synthetic Replacement Song");
    await first
      .getByRole("button", { name: "Refresh NM1 metadata", exact: true })
      .click();
    await expect(
      first.getByRole("button", { name: "Refresh NM1 metadata", exact: true }),
    ).toBeEnabled();
    await first
      .getByRole("button", { name: "Remove NM1", exact: true })
      .click();
    await first.locator("dialog[open] .actions button").first().click();
    await expect(page.locator(".mappool-entry-controls")).toHaveCount(18);
    await page.getByRole("tab", { name: /^DT \(0\)$/ }).click();
    await page
      .getByRole("button", { name: "Add a DT beatmap", exact: true })
      .click();
    await expect(page.locator(".mappool-inline-editor:visible")).toBeVisible();
    await page.locator(".mappool-inline-heading button:visible").click();
    await expect(
      page.getByRole("link", { name: "Manage rounds", exact: true }),
    ).toHaveCount(0);
    await openTournamentTool(page, "test-cup", "Rounds", isMobile);
    await page.getByRole("tab", { name: "Group Stage", exact: true }).click();
    await page
      .getByRole("list", { name: "Rounds", exact: true })
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "GS", exact: true }) })
      .getByRole("button", { name: "Edit round", exact: true })
      .click();
    await expect(page.getByLabel("Round order", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.goto("/admin/tournaments/test-cup/mappools");
    await db()
      .update(mappools)
      .set({ lockedAt: new Date() })
      .where(eq(mappools.id, pool.id));
    await page.reload();
    await expect(
      page.locator(".mappool-entry-action-row, .mappool-add-map"),
    ).toHaveCount(0);
  });
});
