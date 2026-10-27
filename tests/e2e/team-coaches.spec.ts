import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  registrations,
  captains,
  teams,
  memberships,
} from "../../src/db/schema";
import { seedSession } from "./session";
import { englishStorage } from "../fixtures/preferences";

test.describe("current edition coaches", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterAll(closeDb);
  test("assigns and removes coaches through the UI, respects publication and supports themes/locales", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await context.route("https://a.ppy.sh/**", (r) => r.abort());
    await db()
      .insert(users)
      .values({ osuId: 149001, username: "Synthetic Captain" });
    await db().insert(registrations).values({
      editionSlug: "test-cup",
      userId: 149001,
      status: "accepted",
      answers: {},
      rulesVersion: "test-v1",
    });
    await db().insert(captains).values({
      editionSlug: "test-cup",
      userId: 149001,
      published: true,
      position: 1,
    });
    const [team] = await db()
      .insert(teams)
      .values({
        editionSlug: "test-cup",
        captainId: 149001,
        name: "Synthetic Coach Team",
        capacity: 1,
        identityPublished: true,
        finalizedAt: new Date(),
      })
      .returning();
    await db().insert(memberships).values({
      editionSlug: "test-cup",
      teamId: team.id,
      userId: 149001,
      origin: "captain",
    });
    const anonymous = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const publicPage = await anonymous.newPage();
    const coachId = isMobile ? 982001 : 981001,
      coachName = `Synthetic Assisted ${coachId}`;
    const adminPath = "/admin/tournaments/test-cup/teams",
      publicPath = `/tournaments/test-cup/teams/${team.id}`;
    try {
      await page.goto(adminPath);
      await page
        .getByLabel("Coach osu! ID", { exact: true })
        .fill(String(coachId));
      await page
        .getByRole("button", { name: "Add coach", exact: true })
        .click();
      await expect(page.getByRole("region", { name: "Coaches" })).toContainText(
        coachName,
      );
      await publicPage.goto(publicPath);
      await expect(
        publicPage.getByText(coachName, { exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Publish finalized roster", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Hide roster", exact: true }),
      ).toBeVisible();
      await publicPage.reload();
      await expect(
        publicPage.getByRole("heading", { name: "Coaches", exact: true }),
      ).toBeVisible();
      await expect(
        publicPage.getByText(coachName, { exact: true }),
      ).toBeVisible();
      await publicPage.goto(`/players/${coachId}?edition=test-cup`);
      await expect(
        publicPage.getByRole("heading", {
          name: coachName,
          exact: true,
          level: 1,
        }),
      ).toBeVisible();
      await expect(
        publicPage.getByRole("region", {
          name: "Published participation",
          exact: true,
        }),
      ).toContainText("Coach");
      for (const [locale, label] of [
        ["en", "Coach osu! ID"],
        ["zh-Hans", "教练 osu! ID"],
        ["zh-Hant", "教練 osu! ID"],
      ]) {
        await context.addCookies([
          { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto(adminPath);
        await expect(page.getByLabel(label, { exact: true })).toBeVisible();
      }
      await context.addCookies([
        { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
      ]);
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-appearance",
              value: appearance,
              url: "http://127.0.0.1:3100",
            },
            { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
          ]);
          for (const [name, path] of [
            ["admin", adminPath],
            ["public", publicPath],
          ]) {
            await page.goto(path);
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            expect(
              (await new AxeBuilder({ page }).analyze()).violations,
            ).toEqual([]);
            await page.screenshot({
              path: info.outputPath(`${appearance}-${theme}-${name}.png`),
              fullPage: true,
            });
          }
        }
      await page.goto(adminPath);
      await page
        .getByRole("button", { name: `Remove coach ${coachName}`, exact: true })
        .click();
      await expect(
        page
          .getByRole("region", { name: "Coaches" })
          .getByText(coachName, { exact: true }),
      ).toHaveCount(0);
      await publicPage.goto(publicPath);
      await expect(
        publicPage.getByText(coachName, { exact: true }),
      ).toHaveCount(0);
      expect(
        (
          await anonymous.request.get(`/players/${coachId}?edition=test-cup`)
        ).status(),
      ).toBe(404);
      await expect(
        publicPage.getByRole("heading", {
          name: "Published roster",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      await anonymous.close();
    }
  });
});
