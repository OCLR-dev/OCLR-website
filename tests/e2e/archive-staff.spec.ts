import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import { readTournament } from "../../src/lib/tournaments";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { seedSession } from "./session";
import { assertTestDatabase } from "../database";
import { appearances } from "../../src/lib/preferences";

const slug = "history-staff-test";
const archive = {
  ...historicalArchive,
  editionSlug: slug,
  staff: [
    {
      osuId: 91005,
      username: "Historical Host",
      position: "Referee / Streamer",
      source: "Staff!A1",
    },
    {
      osuId: 91005,
      username: "Alias Host",
      position: "裁判",
      source: "Staff!A2",
    },
    {
      osuId: null,
      username: "[Test Player]",
      position: "Streamer；裁判 / 直播 / 解说（Staff原文统称）",
      source: "Staff!A3",
    },
    { osuId: null, username: "12345", position: "解說", source: "Staff!A4" },
    {
      osuId: null,
      username: "Unconfirmed Staff",
      position: "裁判 / 直播 / 解说（Staff原文统称）",
      source: "Staff!A5",
    },
  ],
};
test.describe("historical staff categories and verified username lookup", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("groups duties, looks up, confirms and preserves historical evidence", async ({
    page,
    context,
    request,
    browser,
    isMobile,
  }, info) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic historical staff",
        archive,
        registration: null,
        status: "completed",
        published: true,
      },
    ]);
    const admin = isMobile ? 70001 : 60001;
    const cookie = await seedSession(admin);
    await context.addCookies([cookie]);
    await page.route("https://a.ppy.sh/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#704594"/></svg>',
      }),
    );
    await page.goto(`/tournaments/${slug}/staff`);
    await expect(
      page.getByRole("heading", { name: "Referee", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Commentator", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Staff (unspecified)", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", {
        name: "Historical Host · Alias Host",
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "[Test Player]", exact: true }),
    ).toHaveCount(0);

    const endpoint = `/api/admin/tournaments/${slug}/archive-staff`;
    const headers = { origin: "http://127.0.0.1:3100" };
    const lookup = {
      staffIndex: 2,
      username: "[Test Player]",
      expectedRevision: 0,
    };
    expect(
      (await request.post(endpoint, { headers, data: lookup })).status(),
    ).toBe(401);
    expect(
      (
        await context.request.post(endpoint, {
          headers: { origin: "https://invalid.example" },
          data: lookup,
        })
      ).status(),
    ).toBe(403);
    const denied = await browser.newContext();
    try {
      const userId = 375103;
      await denied.addCookies([await seedSession(userId)]);
      await db().insert(staffRoles).values({
        userId,
        role: "developer",
        editionSlug: null,
        grantedBy: admin,
      });
      expect(
        (
          await denied.request.post(endpoint, { headers, data: lookup })
        ).status(),
      ).toBe(403);
    } finally {
      await denied.close();
    }
    await page.goto(`/admin/tournaments/${slug}/archive`);
    const form = page.getByRole("region", {
      name: "Historical staff identities",
    });
    await form.getByRole("button", { name: "Look up osu! username" }).click();
    await expect(
      form.getByRole("link", { name: "[Test Player] · 983001" }),
    ).toBeVisible();
    await expect(
      form.getByRole("button", {
        name: "Link historical staff identity",
        exact: true,
      }),
    ).toBeDisabled();
    await form
      .getByLabel("Identity confirmation source", { exact: true })
      .fill("Synthetic independent identity evidence");
    await form.getByRole("checkbox").check();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: info.outputPath("staff-candidate.png"),
      fullPage: true,
    });
    await form
      .getByRole("button", {
        name: "Link historical staff identity",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "[Test Player] · 983001",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      form.getByRole("combobox", {
        name: "Historical staff member",
        exact: true,
      }),
    ).toHaveValue("3");
    const saved = (await readTournament(slug))!;
    expect(saved.revision).toBe(1);
    expect(saved.edition.archive?.staff[2]).toEqual({
      ...archive.staff[2],
      osuId: 983001,
    });
    expect(saved.edition.archive?.players).toEqual(archive.players);
    expect(saved.edition.archive?.matches).toEqual(archive.matches);
    // Numeric usernames use explicit username lookup, never ID parsing.
    await form.getByRole("button", { name: "Look up osu! username" }).click();
    await expect(
      form.getByRole("link", { name: "12345 · 983002" }),
    ).toBeVisible();
    await form
      .getByLabel("Current osu! username")
      .fill("Missing synthetic name");
    await expect(
      form.getByRole("button", {
        name: "Link historical staff identity",
        exact: true,
      }),
    ).toHaveCount(0);
    await form.getByRole("button", { name: "Look up osu! username" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await page.reload();
    await expect(
      form.getByRole("combobox", {
        name: "Historical staff member",
        exact: true,
      }),
    ).toHaveValue("3");
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
      ]);
      await page.reload();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({
        path: info.outputPath(`staff-resolver-${theme}.png`),
        fullPage: true,
      });
      await page.goto(`/tournaments/${slug}/staff`);
      await expect(
        page.getByRole("link", { name: "[Test Player]", exact: true }),
      ).toHaveAttribute("href", "https://osu.ppy.sh/users/983001");
      await expect(page.locator("main")).not.toContainText(
        "Synthetic independent identity evidence",
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({
        path: info.outputPath(`staff-public-${theme}.png`),
        fullPage: true,
      });
      await page.goto(`/admin/tournaments/${slug}/archive`);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(".archive-staff-resolver")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
  test("keeps role groups and lookup controls readable across locales and appearances", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(180000);
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic historical staff",
        archive,
        registration: null,
        status: "completed",
        published: true,
      },
    ]);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.route("https://a.ppy.sh/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#704594"/></svg>',
      }),
    );
    const overflow = async () =>
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const [locale, referee, commentator] of [
      ["en", "Referee", "Commentator"],
      ["zh-Hans", "裁判", "解说"],
      ["zh-Hant", "裁判", "解說"],
    ]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
      ]);
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto(`/tournaments/${slug}/staff`);
        await expect(
          page.getByRole("heading", { name: referee, exact: true }),
        ).toHaveCount(1);
        await expect(
          page.getByRole("heading", { name: commentator, exact: true }),
        ).toHaveCount(1);
        await overflow();
        await page.screenshot({
          path: info.outputPath(`groups-${locale}-${theme}.png`),
          fullPage: true,
        });
        await page.goto(`/admin/tournaments/${slug}/archive`);
        await expect(
          page.locator(".archive-staff-resolver select"),
        ).toBeEnabled();
        await overflow();
        await page.screenshot({
          path: info.outputPath(`resolver-${locale}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    await context.addCookies([
      { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
    ]);
    for (const appearance of appearances) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            url: "http://127.0.0.1:3100",
          },
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto(`/tournaments/${slug}/staff`);
        await expect(
          page.getByRole("heading", { name: "Referee", exact: true }),
        ).toBeVisible();
        await overflow();
        await page.goto(`/admin/tournaments/${slug}/archive`);
        await expect(
          page
            .locator(".archive-staff-resolver")
            .getByRole("button", { name: "Look up osu! username" }),
        ).toBeVisible();
        await overflow();
      }
    }
  });
});
