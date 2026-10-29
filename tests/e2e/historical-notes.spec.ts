import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { historicalStatistics } from "../../src/db/schema";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics";
import { statisticsSeasons } from "../../src/lib/archive-statistics-model";
import { appearances } from "../../src/lib/preferences";
import { seedEditions, setEditionAppearance } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { historicalArchive } from "../fixtures/historical-archive";

async function afterContent(page: Page, selector: string) {
  const notes = page.locator(".page-notes");
  await expect(notes).toHaveCount(1);
  expect(
    await notes.evaluate((node, content) => {
      const main = document.querySelector(content)!;
      return (
        !!(
          main.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
        ) &&
        node.getBoundingClientRect().top >= main.getBoundingClientRect().bottom
      );
    }, selector),
  ).toBe(true);
  expect(
    await notes.evaluate((node) => {
      const footer = document.querySelector(".site-footer");
      return (
        !footer ||
        !!(
          node.compareDocumentPosition(footer) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test.describe("historical page notes", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(240000);
  test.afterAll(closeDb);

  test("all seasons retain filtered statistics, coverage links and keyboard details after tables", async ({
    page,
  }) => {
    for (const slug of statisticsSeasons) {
      const archive = structuredClone(statisticsArchive);
      archive.editionSlug = slug;
      archive.matches.push({
        ...archive.matches[0],
        id: "uncovered",
        label: "Synthetic uncovered match",
        stage: "Semi",
        mpUrls: [],
      });
      await seedEditions([
        {
          ...edition,
          slug,
          published: true,
          status: "completed",
          registration: null,
          archive,
        },
      ]);
      await db()
        .delete(historicalStatistics)
        .where(eq(historicalStatistics.editionSlug, slug));
      const source = statisticsSource();
      source.games = source.games.slice(0, 2);
      const snapshot = {
        archiveKey: statisticsArchiveKey(archive),
        source,
        poolId: "final",
        included: [1, 2],
      };
      await db()
        .insert(historicalStatistics)
        .values({
          editionSlug: slug,
          fixtureId: "one",
          mpId: source.match.id,
          version: 1,
          draft: snapshot,
          published: snapshot,
          publishedAt: new Date("2026-10-23T00:00:00Z"),
        });
      await page.goto(`/tournaments/${slug}/statistics`);
      await expect(page.locator(".event-table tbody tr")).toHaveCount(4);
      await afterContent(page, ".event-table-scroll");
      const notes = page.getByRole("region", { name: "Notes", exact: true });
      await expect(notes).toContainText("Known accuracy 8 / 8");
      await expect(page.locator(".statistics-summary")).not.toContainText(
        "Missing data",
      );
      const summary = notes.getByText("Match coverage", { exact: true });
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(notes.locator("details")).toHaveAttribute("open", "");
      await expect(
        notes.getByRole("link", { name: /Synthetic uncovered match/ }),
      ).toHaveAttribute("href", `/tournaments/${slug}/matches/uncovered`);
      await page
        .getByRole("combobox", { name: "Rounds", exact: true })
        .selectOption("Semi");
      await expect(notes).toContainText("Known accuracy 0 / 0");
      await expect(notes.locator(".statistics-coverage li")).toHaveCount(1);
      await expect(notes).toContainText("Not yet covered");
      await page
        .getByRole("combobox", { name: "Rounds", exact: true })
        .selectOption("Final");
      await page
        .getByRole("combobox", { name: "Team", exact: true })
        .selectOption("alpha");
      await expect(notes).toContainText("Known accuracy 4 / 4");
      await page
        .getByRole("button", { name: "Mappool statistics", exact: true })
        .click();
      await expect(notes).toContainText("Bans use published schedule records");
      await expect(notes).toContainText("Rates require known mappools");
      const mapSelect = page.getByRole("combobox", {
        name: "Map",
        exact: true,
      });
      const value = await mapSelect
        .locator("option")
        .nth(1)
        .getAttribute("value");
      await mapSelect.selectOption(value!);
      await expect(notes).toContainText("Known accuracy 2 / 2");
      await expect(notes.locator(".statistics-coverage li")).toHaveCount(1);
      await afterContent(page, ".event-table-scroll");
    }
  });

  test("compact notes use every registered appearance, both themes and all locales", async ({
    page,
    context,
  }) => {
    // This presentation fixture is empty by design: restrictions and zero coverage remain readable.
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        published: true,
        status: "completed",
        registration: null,
        archive: { ...statisticsArchive, editionSlug: "s7" },
      },
    ]);
    await db()
      .delete(historicalStatistics)
      .where(eq(historicalStatistics.editionSlug, "s7"));
    for (const [index, appearance] of appearances.entries()) {
      await setEditionAppearance("s7", appearance);
      for (const theme of ["light", "dark"]) {
        const locale = ["en", "zh-Hans", "zh-Hant"][index % 3];
        await context.addCookies([
          { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto("/tournaments/s7/statistics");
        await expect(page.locator(".page-notes h2")).toHaveText(
          locale === "en" ? "Notes" : locale === "zh-Hans" ? "备注" : "備註",
        );
        await afterContent(page, ".event-table-scroll");
        const style = await page.locator(".page-notes").evaluate((node) => {
          const section = getComputedStyle(node),
            heading = getComputedStyle(node.querySelector("h2")!);
          return {
            background: section.backgroundColor,
            headingSize: parseFloat(heading.fontSize),
            textSize: parseFloat(section.fontSize),
            position: section.position,
          };
        });
        expect(style.background).toBe("rgba(0, 0, 0, 0)");
        expect(style.headingSize).toBeLessThanOrEqual(style.textSize);
        expect(style.position).not.toBe("fixed");
        if (appearance === "default")
          expect(
            (await new AxeBuilder({ page }).include(".page-notes").analyze())
              .violations,
          ).toEqual([]);
      }
    }
  });

  test("draft explanations follow allocations, empty sections stay absent and private appendices stay private", async ({
    page,
  }) => {
    const slug = "notes-history-test";
    await seedEditions([
      {
        ...edition,
        slug,
        published: true,
        status: "completed",
        registration: null,
        archive: {
          ...historicalArchive,
          editionSlug: slug,
          formatVersion: 2,
          draftMode: "final-tiers",
          picks: [],
          notes: ["PRIVATE-NOTES-MARKER"],
          sourceFacts: [
            {
              category: "review",
              label: "Private appendix",
              text: "PRIVATE-APPENDIX-MARKER",
              source: "Private review source",
            },
          ],
        },
      },
    ]);
    await page.goto(`/tournaments/${slug}/draft`);
    await afterContent(page, ".archive-draft");
    await expect(page.locator(".page-notes")).toContainText(
      "Final Tier allocations; selection order was not recorded.",
    );
    await expect(page.locator(".archive-draft")).not.toContainText(
      "selection order",
    );
    await page.goto(`/tournaments/${slug}/staff`);
    await expect(page.locator(".historical-archive")).toBeVisible();
    await expect(page.locator(".page-notes")).toHaveCount(0);
    for (const section of ["", "draft", "teams", "schedule", "mappools"]) {
      await page.goto(`/tournaments/${slug}/${section}`);
      await expect(page.locator("body")).not.toContainText(
        "PRIVATE-NOTES-MARKER",
      );
      await expect(page.locator("body")).not.toContainText(
        "PRIVATE-APPENDIX-MARKER",
      );
    }
  });
});
