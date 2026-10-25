import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { rulesSectionIds } from "../../src/lib/rules-navigation";
import { seedSession } from "./session";

const archives = [8, 9, 10].map((n) =>
  historicalArchiveSchema.parse(
    JSON.parse(readFileSync(`docs/imports/s${n}-archive.json`, "utf8")),
  ),
);
test.describe("archive presentation fixes", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(180000);
  test.afterAll(closeDb);
  test("retains every rule, figure and anchor and exposes all matches without duplicate lists", async ({
    page,
    context,
    isMobile,
  }, info) => {
    await seedEditions(
      archives.map((archive, i) => ({
        ...edition,
        slug: `presentation-s${i + 8}`,
        name: `OCLR S${i + 8}`,
        season: String(i + 8),
        status: "completed",
        registration: null,
        archive: { ...archive, editionSlug: `presentation-s${i + 8}` },
      })),
    );
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies(
          [
            ["oclr-locale", locale],
            ["oclr-theme", theme],
          ].map(([name, value]) => ({
            name,
            value,
            url: "http://127.0.0.1:3100",
          })),
        );
        for (let index = 0; index < archives.length; index++) {
          const rules = JSON.parse(
              readFileSync(`src/content/s${index + 8}-rulebook.json`, "utf8"),
            ) as { sections: { heading: string; body: string }[] },
            slug = `presentation-s${index + 8}`;
          await page.goto(`/tournaments/${slug}/rules`);
          await expect(page.locator(".rules-article h2")).toHaveCount(
            rules.sections.length,
          );
          const toc = page.locator(
            isMobile
              ? ".rules-mobile-contents nav"
              : ".rules-desktop-contents nav",
          );
          if (isMobile)
            await page.locator(".rules-mobile-contents summary").click();
          const labels = await toc.locator("a").allTextContents();
          expect(labels.every((label) => !/[：:]\s*$/.test(label))).toBe(true);
          const ids = rulesSectionIds(rules.sections.map((s) => s.heading));
          await page.goto(
            `/tournaments/${slug}/rules#${encodeURIComponent(ids[1])}`,
          );
          await expect
            .poll(() => decodeURIComponent(page.url()))
            .toBe(`http://127.0.0.1:3100/tournaments/${slug}#${ids[1]}`);
          await expect(page.locator(`[id="${ids[1]}"]`)).toBeInViewport();
          await expect
            .poll(
              async () =>
                (await page.locator(`[id="${ids[1]}"]`).boundingBox())!.y >=
                (await page
                  .locator(".site-header")
                  .evaluate((node) => node.getBoundingClientRect().bottom)),
            )
            .toBe(true);
          if (isMobile)
            await page.locator(".rules-mobile-contents summary").click();
          for (let i = 0; i < ids.length; i++)
            await expect(toc.locator("a").nth(i)).toHaveAttribute(
              "href",
              `#${ids[i]}`,
            );
          if (index === 0) {
            await expect(page.locator(".rules-illustration img")).toHaveCount(
              4,
            );
            const bodies = await page
              .locator(".rules-article .preserve-lines")
              .allTextContents();
            expect(bodies.every((text) => !/\n{3,}/.test(text))).toBe(true);
            expect(bodies.join("").replace(/\s/g, "")).toBe(
              rules.sections
                .map((s) => s.body)
                .join("")
                .replace(/\s/g, ""),
            );
            await toc.locator("a").nth(1).click();
            await expect(page.locator(`#${ids[1]}`)).toBeInViewport();
            await page.screenshot({
              path: info.outputPath(`s8-rules-${locale}-${theme}.png`),
            });
          } else {
            await toc.locator("a").last().click();
            await expect(page.locator(`#${ids.at(-1)}`)).toBeInViewport();
          }
          await page.goto(`/tournaments/${slug}/bracket`);
          await expect(page.locator(".match-alternative")).toHaveCount(0);
          const tabs = page.locator(".bracket-tabs button");
          const names = await tabs.allTextContents();
          expect(names).toEqual(
            index === 0 ? ["A", "B", "C", "D"] : ["A", "B"],
          );
          for (let i = 0; i < (await tabs.count()); i++) {
            await tabs.nth(i).focus();
            await page.keyboard.press("Enter");
            await expect(tabs.nth(i)).toHaveAttribute("aria-pressed", "true");
            expect(await page.locator(".match-card").count()).toBeGreaterThan(
              0,
            );
            await expect(
              page.locator(".match-card .sr-only").first(),
            ).toContainText(/winner|获胜方|獲勝方/);
          }
          if (locale === "en")
            expect(
              (await new AxeBuilder({ page }).analyze()).violations,
            ).toEqual([]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          if (index === 0) {
            const rows = page.locator(".historical-archive table tbody tr");
            await expect(rows).toHaveCount(16);
            await expect(rows.locator("td:nth-child(2)")).toHaveText([
              "1",
              "2",
              "3",
              "4",
              "1",
              "2",
              "3",
              "4",
              "1",
              "2",
              "3",
              "4",
              "1",
              "2",
              "3",
              "4",
            ]);
            await page.screenshot({
              path: info.outputPath(`s8-standings-${locale}-${theme}.png`),
              fullPage: true,
            });
          }
        }
      }
    // Preview must use the same computation while keeping its links private.
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.goto(
      "/admin/tournaments/presentation-s8/archive/preview?section=bracket",
    );
    await expect(
      page.locator(".historical-archive table tbody tr"),
    ).toHaveCount(16);
    await expect(
      page.locator(".historical-archive table a").first(),
    ).toHaveAttribute(
      "href",
      /\/admin\/tournaments\/presentation-s8\/archive\/preview/,
    );
  });
});
