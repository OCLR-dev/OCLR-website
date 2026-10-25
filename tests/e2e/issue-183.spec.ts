import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";

const title =
  "Historical Artist — A very long original song title with punctuation and 難度 [Original mapper's difficulty]";
test.describe("issue 183 archive actions and details", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(180000);
  test.afterAll(closeDb);
  test("preserves literal text, resolves set links, navigates and fits every appearance and locale", async ({
    page,
    context,
  }, info) => {
    const archive = JSON.parse(
      readFileSync("docs/imports/s10-archive.json", "utf8"),
    ) as typeof historicalArchive;
    const original = archive.pools.flatMap((p) => p.maps);
    await seedEditions([
      {
        ...edition,
        slug: "issue-183",
        status: "completed",
        registration: null,
        archive: {
          ...historicalArchive,
          editionSlug: "issue-183",
          pools: [
            {
              ...historicalArchive.pools[0],
              maps: [3786810, 4914171, null].map((beatmapId, i) => ({
                ...(original.find((m) => m.beatmapId === beatmapId) ??
                  historicalArchive.pools[0].maps[1]),
                slot: `NM${i + 1}`,
                beatmapId,
                title: i === 0 ? title : `Literal map ${i + 1}`,
              })),
            },
          ],
        },
      },
    ]);
    await context.route("https://assets.ppy.sh/beatmaps/**", (route) =>
      route.fulfill({ status: 404, body: "" }),
    );
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
      for (const theme of ["light", "dark"]) {
        for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
          await context.addCookies(
            Object.entries({
              "oclr-appearance": appearance,
              "oclr-theme": theme,
              "oclr-locale": locale,
            }).map(([name, value]) => ({
              name,
              value,
              url: "http://127.0.0.1:3100",
            })),
          );
          await page.goto("/tournaments/issue-183/mappools/final");
          const cards = page.locator(".archive-map-item");
          await expect(cards).toHaveCount(3);
          const first = cards.first();
          const direct = await first
            .locator('a[href^="osu://"]')
            .getAttribute("href");
          expect(direct).toBe("osu://b/3786810");
          const trigger = first.locator(".map-open-button");
          await trigger.click();
          const dialog = page.getByRole("dialog");
          await expect(dialog.getByRole("heading")).toHaveText(title);
          await expect(dialog.locator('a[href^="osu://"]')).toHaveAttribute(
            "href",
            direct!,
          );
          await expect(
            dialog.locator('a[href^="https://osu.ppy.sh/"]'),
          ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/3786810");
          await expect(dialog.locator('a[href$="/download"]')).toHaveCount(0);
          await expect(dialog.locator(".beatmap-cover img")).toHaveCount(0);
          expect(
            await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath(
              `${appearance}-${theme}-${locale}-details.png`,
            ),
          });
          await dialog.locator(".map-dialog-navigation button").last().click();
          await expect(dialog.getByRole("heading")).toHaveText("Literal map 2");
          await expect(dialog.locator('a[href^="osu://"]')).not.toHaveAttribute(
            "href",
            direct!,
          );
          await dialog.locator(".map-dialog-navigation button").last().click();
          await expect(dialog.locator("a")).toHaveCount(0);
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await page.locator(".map-view-control button").last().click();
          await expect(
            page.locator(".archive-map-list .beatmap-cover"),
          ).toHaveCount(3);
          await expect(first.locator('a[href^="osu://"]')).toHaveAttribute(
            "href",
            direct!,
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await first.locator(".map-open-button").focus();
          await page.keyboard.press("Enter");
          await expect(dialog).toBeVisible();
          await dialog.locator("header button").click();
          await expect(first.locator(".map-open-button")).toBeFocused();
          await page.screenshot({
            path: info.outputPath(
              `${appearance}-${theme}-${locale}-compact.png`,
            ),
          });
        }
      }
    }
  });
});
