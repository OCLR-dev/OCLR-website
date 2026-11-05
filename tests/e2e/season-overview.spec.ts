import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { teams } from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { seedPublicDirectory } from "../fixtures/players";
import { seedPublicPolish } from "../fixtures/public-polish";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
const season = {
  ...edition,
  slug: "s11",
  season: "11",
  name: "OCLR Season 11",
  summary: "osu! Chinese League Rookie — Season 11.",
  branding: {
    logo: "/oclr-s11-square-logo.webp",
    background: "/oclr-s11-website-background.webp",
    keyVisual: "/oclr-s11-key-visual.webp",
  },
  eligibility:
    "Synthetic eligibility disclosure for responsive review.\nConfigured requirements remain available without crowding the overview.",
  schedule: [
    { label: "Registration", at: "2026-10-01T00:00:00Z" },
    { label: "Captain announcement", at: null },
    { label: "Live draft", at: "2098-11-21T12:00:00Z" },
    { label: "Group Stage", at: null },
    { label: "Knockout Stage", at: null },
    { label: "Final", at: null },
  ],
};
async function preferences(
  context: BrowserContext,
  locale: string,
  theme: string,
) {
  await context.addCookies([
    { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
    { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
  ]);
}
test.describe("season overview composition", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([season]);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  test("information document preserves authored content, planned stages and registration entry across locales", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(120000);
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await preferences(context, locale, theme);
        await page.setViewportSize({
          width: isMobile ? 320 : 1440,
          height: 900,
        });
        await page.goto("/tournaments/s11");
        await expect(page.locator("#information-title")).toHaveText(
          season.name,
        );
        await expect(page.locator(".information-banner img")).toHaveAttribute(
          "src",
          season.branding.background,
        );
        await expect(page.locator("#rules")).toContainText(season.eligibility);
        await expect(page.locator(".stage-scroll")).toContainText(
          "Captain announcement",
        );
        await expect(
          page.locator('.stage-scroll a[href="/tournaments/s11/register"]'),
        ).toBeVisible();
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
  test("only published teams enter the information document", async ({
    page,
  }) => {
    await seedEditions([edition]);
    await page.goto("/tournaments/test-cup");
    await expect(page.locator(".information-teams tbody tr")).toHaveCount(0);
    for (let i = 0; i < 3; i++) {
      await seedPublicDirectory(970000 + i * 10);
      await page.reload();
      await expect(page.locator(".information-teams tbody tr")).toHaveCount(
        i + 1,
      );
    }
    await expect(page.locator("main")).not.toContainText(
      /PRIVATE_CONTACT|INTERNAL_REASON|Private Applicant|Unpublished Captain/,
    );
    await db().update(teams).set({ identityPublished: false });
    await page.reload();
    await expect(page.locator(".information-teams tbody tr")).toHaveCount(0);
    expect((await page.goto("/tournaments/private-test-cup"))?.status()).toBe(
      404,
    );
  });
  test("optional data sections stay absent while rules availability remains visible", async ({
    page,
  }) => {
    await seedEditions([
      {
        ...edition,
        registration: null,
        rules: null,
        eligibility: null,
        schedule: [],
      },
    ]);
    await page.goto("/tournaments/test-cup");
    await expect(
      page.locator("#schedule, #participants, #mappools"),
    ).toHaveCount(0);
    await expect(page.locator("#rules")).toContainText("Rules to be announced");
    const disclosure =
      "Eligibility disclosure.\n" + "UnbrokenAuthoredText".repeat(150);
    await seedEditions([
      { ...edition, eligibility: disclosure, registration: null },
    ]);
    await page.reload();
    await expect(page.locator("#rules")).toContainText(disclosure);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await seedPublicPolish(60001, 970999, 971000);
    await page.reload();
    await expect(page.locator("#mappools, .information-pool")).toHaveCount(0);
    await expect(page.locator("#rules, #stages")).toHaveCount(2);
    const menu = page.getByRole("button", { name: "Tournament menu" });
    if (await menu.isVisible()) await menu.click();
    await expect(
      page.locator('a[href="/tournaments/test-cup/mappools"]'),
    ).toBeVisible();
    await page.goto("/tournaments/test-cup/mappools");
    await expect(
      page.getByRole("heading", { name: "Mappools", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Mappool: test" }),
    ).toBeVisible();
  });
  test("registration stays discoverable while the server enforces open, closed and paused windows", async ({
    page,
  }) => {
    for (const state of ["open", "future", "closed", "paused"] as const) {
      await seedEditions([
        {
          ...edition,
          registration: {
            ...edition.registration!,
            enabled: state !== "paused",
            opensAt:
              state === "future"
                ? "2098-01-01T00:00:00Z"
                : "2020-01-01T00:00:00Z",
            closesAt:
              state === "closed"
                ? "2020-02-01T00:00:00Z"
                : "2099-01-01T00:00:00Z",
          },
        },
      ]);
      await page.goto("/tournaments/test-cup");
      await expect(
        page.locator('.stage-scroll a[href="/tournaments/test-cup/register"]'),
      ).toHaveCount(1);
      await page.goto("/tournaments/test-cup/register");
      await expect(
        page.getByRole("heading", {
          name:
            state === "open"
              ? "Sign in before applying"
              : "Registration is not open",
          exact: true,
        }),
      ).toBeVisible();
    }
  });
});
