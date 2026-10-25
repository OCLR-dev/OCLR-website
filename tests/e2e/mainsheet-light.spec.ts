import { englishStorage } from "../fixtures/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db, closeDb } from "../../src/db";
import { mappoolEntries } from "../../src/db/schema";
import { seedResultReview } from "../fixtures/results";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { seedSession } from "./session";
import { assertTestDatabase } from "../database";

test.describe("MainSheet Light public experience", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("rehearses public navigation, cards, details and readable content without leaking private data", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    test.setTimeout(180000);
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    const adminId = isMobile ? 70001 : 60001;
    await seedSession(adminId);
    const refId = isMobile ? 810102 : 810002;
    await seedSession(refId);
    const seed = await seedResultReview(
      adminId,
      refId,
      isMobile ? 811100 : 811000,
      "knockout",
      true,
    );
    await seedEditions([
      {
        ...edition,
        name: "OCLR 公開測試賽 · MainSheet Light",
        season: "Test",
        branding: {
          logo: "/oclr-s11-square-logo.webp",
          background: "/oclr-s11-website-background.webp",
          keyVisual: "/oclr-s11-key-visual.webp",
        },
        rules: {
          version: "approved-test-v2",
          sections: [
            {
              heading: "比赛规则",
              body: "Synthetic organizer rules for isolated browser review.",
            },
            {
              heading: "比赛规则",
              body: "Second section, deliberately duplicated heading.",
            },
            {
              heading: "Eligibility & conduct",
              body: "Literal text: <script>alert(1)</script>. No inferred tournament requirements.",
            },
          ],
        },
        schedule: [{ label: "Published test milestone", at: null }],
      },
    ]);
    await db()
      .insert(mappoolEntries)
      .values(
        (["DT", "FM", "TB"] as const).map((category, i) => ({
          poolId: seed.poolId!,
          category,
          position: 1,
          beatmapId: 840000 + i,
          metadata: {
            setId: 42,
            title: `Synthetic ${category} map`,
            artist: "Synthetic Artist",
            difficulty: "Expert",
            mapper: "Synthetic Mapper",
            stars: 5.25,
            bpm: 180,
            duration: 125,
            ...(category === "DT"
              ? {
                  attributes: {
                    configuration: "DT" as const,
                    mods: ["DT"],
                    ruleset: "osu" as const,
                    stars: 7.5,
                    maxCombo: 1000,
                    values: { approach_rate: 10.3 },
                    fetchedAt: new Date().toISOString(),
                  },
                }
              : {}),
          },
        })),
      );
    await context.route("https://assets.ppy.sh/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100"><rect width="180" height="100" fill="#6c2e91"/></svg>',
      }),
    );
    await context.route("https://a.ppy.sh/**", (route) => route.abort());
    const base = "/tournaments/test-cup";
    expect(
      (await context.cookies()).filter((c) => c.name !== "oclr-locale"),
    ).toEqual([]);
    const poolUrl = `/api/tournaments/test-cup/mappools/${seed.poolId}`;
    const before = await (await context.request.get(poolUrl)).json();
    await page.goto(base);
    await expect(page.locator(".information-banner img")).toBeVisible();
    await expect(page.locator(".stage-scroll")).toContainText(
      "Published test milestone",
    );
    await expect(page.locator("#information-title")).toContainText(
      "OCLR 公開測試賽",
    );
    await expect(page.locator(".public-tournament")).toBeVisible();
    for (const section of ["", "/schedule", "/mappools", "/teams", "/rules"]) {
      await page.goto(base + section);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator(".site-header")).toHaveCount(1);
      if (isMobile) {
        const menu = page.getByRole("button", { name: /Tournament menu/ });
        await menu.click();
        await expect(
          page.getByRole("navigation", { name: "Tournament navigation" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toBeFocused();
        await expect(menu).toHaveAttribute("aria-expanded", "false");
      }
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        if (section === "/mappools" && width === 1440) {
          expect(
            (await page.locator(".map-browse-card").first().boundingBox())!.y,
          ).toBeLessThan(900);
        }
        if (!isMobile || width === 390)
          await page.screenshot({
            path: info.outputPath(
              `light-${section.slice(1) || "overview"}-${width}.png`,
            ),
            fullPage: false,
            animations: "disabled",
          });
      }
      await page.setViewportSize({
        width: isMobile ? 390 : 1440,
        height: 1000,
      });
    }
    await page.goto(base + "/rules");
    const headings = page.locator(".rules-article h2");
    const ids = await headings.evaluateAll((nodes) => nodes.map((n) => n.id));
    expect(new Set(ids).size).toBe(4); // Published eligibility remains part of the homepage handbook.
    await expect(page.locator(".rules-article")).toContainText(
      "<script>alert(1)</script>",
    );
    if (isMobile) await page.locator(".rules-mobile-contents summary").click();
    await page
      .getByRole("navigation", { name: "Rules contents" })
      .getByRole("link")
      .nth(1)
      .click();
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe("#" + ids[1]);
    expect((await headings.nth(1).boundingBox())!.y).toBeGreaterThanOrEqual(65);
    await page.goto(base + "/schedule");
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    const round = page.getByRole("combobox", { name: "Rounds", exact: true });
    await round.selectOption({ index: 1 });
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    await round.selectOption("");
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    await page.goto(base + `/mappools/${seed.poolId}`);
    await page.getByRole("button", { name: "DT", exact: true }).click();
    await expect(page.locator(".map-browse-card")).toHaveCount(1);
    await expect(page.locator(".map-browse-card")).toContainText("7.50 ★ · DT");
    await page.getByRole("button", { name: "TB", exact: true }).click();
    await expect(page.locator(".map-browse-card")).toContainText(
      "Variable mods",
    );
    await page.getByRole("button", { name: "All mods", exact: true }).click();
    const first = page.locator(".map-open-button").first();
    await first.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: info.outputPath("light-map-dialog.png"),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Next map", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(first).toBeFocused();
    await page
      .getByRole("button", { name: "Compact table", exact: true })
      .click();
    await expect(page.locator(".mappool-sheet tbody tr")).toHaveCount(
      before.entries.length,
    );
    await page.getByRole("button", { name: "Map cards", exact: true }).click();
    await page
      .getByRole("searchbox", {
        name: /Search Synthetic Released Fixture Pool/,
      })
      .fill("NO_MAP");
    await expect(page.locator(".map-browse-card")).toHaveCount(0);
    expect(await (await context.request.get(poolUrl)).json()).toEqual(before);
    await page.goto(base + "/teams");
    await page
      .getByRole("searchbox", { name: "Search teams" })
      .fill(String(seed.home.memberId));
    await expect(page.locator(".public-team-card")).toHaveCount(1);
    await page
      .locator(".public-team-card")
      .getByRole("link", { name: "View team", exact: true })
      .click();
    await expect(
      page.locator(".public-roster-grid .public-player-identity"),
    ).toHaveCount(2);
    expect(await page.content()).not.toMatch(
      /SYNTHETIC_PRIVATE_CONTACT|SYNTHETIC_INTERNAL_REASON/,
    );
    const emptySlug = `light-empty-${isMobile ? "mobile" : "desktop"}-test`;
    await seedEditions([
      {
        ...edition,
        slug: emptySlug,
        rules: null,
        eligibility: null,
        schedule: [],
        registration: null,
      },
    ]);
    await page.goto(`/tournaments/${emptySlug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto(`/tournaments/${emptySlug}/rules`);
    await expect(
      page.getByRole("heading", { name: "Rules to be announced", exact: true }),
    ).toBeVisible();
    expect(
      (
        await context.request.get("/api/tournaments/private-test-cup/mappools")
      ).status(),
    ).toBe(200);
    expect(
      await (
        await context.request.get("/api/tournaments/private-test-cup/mappools")
      ).json(),
    ).toEqual([]);
    await context.route("**/oclr-s11-website-background.webp", (route) =>
      route.abort(),
    );
    await page.goto(base);
    await expect(page.locator("#information-title")).toContainText(
      "OCLR 公開測試賽",
    );
    const admin = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      await admin.addCookies([await seedSession(adminId)]);
      const adminPage = await admin.newPage();
      await adminPage.goto(base);
      const account = adminPage.getByRole("button", {
        name: "Dashboard",
        exact: true,
      });
      await account.click();
      await expect(
        adminPage.getByRole("menuitem", {
          name: "Staff dashboard",
          exact: true,
        }),
      ).toBeVisible();
      await adminPage.keyboard.press("Escape");
      await expect(account).toBeFocused();
      await adminPage.goto("/admin");
      await expect(adminPage.locator(".public-tournament")).toHaveCount(0);
      await expect(adminPage.locator(".themed-site")).toHaveCSS(
        "background-color",
        "rgb(244, 241, 247)",
      );
    } finally {
      await admin.close();
    }
  });
});
