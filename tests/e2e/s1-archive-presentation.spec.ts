import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeDb } from "../../src/db";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { syntheticS1Archive } from "../fixtures/s1-presentation";

test.describe("S1 group and final standings presentation", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("keeps groups, knockout and final ranks separate in private and public reads", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(180000);
    const slugs = ["synthetic-s1-private", "synthetic-s1-public"];
    await seedEditions(
      slugs.map((slug, i) => ({
        ...edition,
        slug,
        name: "Synthetic S1 display",
        published: i === 1,
        status: "completed",
        registration: null,
        archive: syntheticS1Archive(slug),
      })),
    );
    for (const [index, slug] of slugs.entries()) {
      await context.clearCookies();
      if (index === 0)
        await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
      for (const [theme, locale, finalTitle, groupTitle, knockoutTitle] of [
        ["light", "en", "Final standings", "Group standings", "Knockout"],
        ["dark", "en", "Final standings", "Group standings", "Knockout"],
        ["light", "zh-Hans", "最终排名", "小组排名", "淘汰赛"],
        ["dark", "zh-Hant", "最終排名", "小組排名", "淘汰賽"],
      ]) {
        await context.addCookies([
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
          { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto(
          index === 0
            ? `/admin/tournaments/${slug}/archive/preview?section=schedule`
            : `/tournaments/${slug}/schedule`,
        );
        const phases = page.locator(".archive-competition > .event-tabs");
        const groupTabs = page.locator(".bracket-tabs");
        await expect(groupTabs.getByRole("button")).toHaveText([
          "小组赛 A组",
          "小组赛 B组",
        ]);
        await expect(
          page.locator(".bracket-group-grid .match-card"),
        ).toHaveCount(15);
        await groupTabs
          .getByRole("button", { name: "小组赛 B组", exact: true })
          .click();
        await expect(
          page.locator(".bracket-group-grid .match-card"),
        ).toHaveCount(15);
        const finalHeading = page.getByRole("heading", {
          name: finalTitle,
          exact: true,
        });
        await expect(finalHeading).toBeVisible();
        await expect(
          page.getByRole("heading", { name: groupTitle, exact: true }),
        ).toHaveCount(0);
        const standings = page.locator(".archive-competition table tbody tr");
        await expect(standings).toHaveCount(12);
        await expect(
          page.locator(".archive-competition table thead th"),
        ).toHaveCount(6);
        await expect(standings.locator("td:first-child")).toHaveText([
          "1",
          "2",
          "3",
          "4",
          "5",
          "5",
          "7",
          "7",
          "9",
          "9",
          "9",
          "9",
        ]);
        await phases
          .getByRole("button", { name: knockoutTitle, exact: true })
          .click();
        await expect(page.locator(".bracket-group-grid")).toHaveCount(0);
        await expect(
          page.locator(".archive-competition .match-card"),
        ).toHaveCount(10);
        await expect(finalHeading).toBeVisible();
        await expect(standings).toHaveCount(12);
        await expect(page.locator("body")).not.toContainText(
          "Private synthetic S1 memo",
        );
        await expect(
          page.getByRole("heading", {
            name: "Check source records",
            exact: true,
          }),
        ).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await finalHeading.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath(
            `s1-${index === 0 ? "private" : "public"}-${locale}-${theme}.png`,
          ),
        });
      }
    }
    await context.clearCookies();
    const response = await page.goto(`/tournaments/${slugs[0]}/schedule`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Synthetic S1 display", exact: true }),
    ).toHaveCount(0);
  });
});
