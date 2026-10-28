import { test, expect } from "@playwright/test";
import { closeDb } from "../../src/db";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { syntheticS4Archive } from "../fixtures/s4-presentation";

test.describe("S4 recorded phase classification", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("shows four six-match group rounds and only ten knockout games", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    const slugs = ["synthetic-s4-private", "synthetic-s4-public"];
    await seedEditions(
      slugs.map((slug, i) => ({
        ...edition,
        slug,
        name: "Synthetic S4 display",
        published: i === 1,
        status: "completed",
        registration: null,
        archive: syntheticS4Archive(slug),
      })),
    );
    for (const [index, slug] of slugs.entries()) {
      await context.clearCookies();
      if (index === 0)
        await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
      for (const [theme, locale, knockoutTitle] of [
        ["light", "en", "Knockout"],
        ["dark", "en", "Knockout"],
        ["light", "zh-Hans", "淘汰赛"],
        ["dark", "zh-Hant", "淘汰賽"],
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
        const competition = page.locator(".archive-competition");
        const roundTabs = competition.locator(".bracket-tabs");
        await expect(roundTabs.getByRole("button")).toHaveText([
          "小组赛第1轮",
          "小组赛第2轮",
          "小组赛第3轮",
          "小组赛第4轮",
        ]);
        const observed = new Set<string>();
        let drawCount = 0;
        for (let round = 1; round <= 4; round++) {
          await roundTabs
            .getByRole("button", { name: `小组赛第${round}轮`, exact: true })
            .click();
          const cards = competition.locator(".match-card");
          await expect(cards).toHaveCount(6);
          for (let offset = 1; offset <= 6; offset++) {
            const n = (round - 1) * 6 + offset;
            const card = cards.filter({
              has: page.getByRole("heading", { name: `A${n}`, exact: true }),
            });
            await expect(card).toHaveCount(1);
            observed.add(`a${n}`);
            if ([5, 10, 11, 17, 20].includes(n)) {
              await expect(card.locator(".match-slot strong")).toHaveText([
                "5",
                "5",
              ]);
              await expect(card.locator(".match-winner")).toHaveCount(0);
              drawCount++;
            }
            if (n === 22) {
              await expect(card.locator(".match-slot strong")).toHaveText([
                "—",
                "—",
              ]);
              await expect(card.locator(".match-winner")).toHaveCount(1);
            }
          }
        }
        expect(observed.size).toBe(24);
        expect(drawCount).toBe(5);
        await expect(competition.getByRole("table")).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`s4-${index}-${locale}-${theme}-groups.png`),
          fullPage: true,
        });
        await competition
          .locator(":scope > .event-tabs")
          .getByRole("button", { name: knockoutTitle, exact: true })
          .click();
        await expect(competition.locator(".bracket-group-grid")).toHaveCount(0);
        await expect(competition.locator(".match-card")).toHaveCount(10);
        await expect(
          competition.getByRole("heading", { name: /^A\d+$/ }),
        ).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await context.clearCookies();
    expect(
      (await page.goto(`/tournaments/${slugs[0]}/schedule`))?.status(),
    ).toBe(404);
  });
});
