import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { closeDb } from "../../src/db";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";

const samples = [
  {
    key: "s8",
    thumbnail: "/archive/s8/thumbnail.webp",
    thumbnailWidth: 1920,
    thumbnailRatio: 16 / 9,
    season: "8",
    results: 38,
    players: 128,
    picks: 96,
    coaches: 16,
    pools: 4,
    staff: 33,
    images: 4,
    searchId: "1176704",
    searchName: "Lapis",
    ruleText: "但在任何情况下都不得上场打图",
  },
  {
    key: "s10",
    thumbnail: "/archive/s10/thumbnail.webp",
    thumbnailWidth: 1024,
    thumbnailRatio: 1,
    season: "10",
    results: 30,
    players: 80,
    picks: 70,
    coaches: 0,
    pools: 5,
    staff: 15,
    images: 2,
    searchId: "14912108",
    searchName: "koutya_",
    ruleText: "1. 没有教练，别想了。",
  },
];
test.describe("historical season import handoff", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterAll(async () => closeDb());
  for (const sample of samples)
    test(`imports ${sample.key} privately, publishes explicitly and renders its original content`, async ({
      page,
      context,
      isMobile,
    }, info) => {
      const slug = `${sample.key}-${isMobile ? "mobile" : "desktop"}-${Date.now()}`;
      const archive = historicalArchiveSchema.parse({
        ...JSON.parse(
          readFileSync(`docs/imports/${sample.key}-archive.json`, "utf8"),
        ),
        editionSlug: slug,
      });
      await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
      await seedEditions([
        {
          ...edition,
          slug,
          name: `${sample.key.toUpperCase()} archive verification`,
          season: sample.season,
          published: false,
          status: "completed",
          registration: null,
        },
      ]);
      await page.goto(`/admin/tournaments/${slug}/archive`);
      await page
        .getByLabel("Archive JSON file", { exact: true })
        .setInputFiles({
          name: `${sample.key}-archive.json`,
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(archive)),
        });
      await page
        .getByRole("button", { name: "Validate and review archive" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Review source records" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Save archive draft", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Archive draft saved",
      );
      const endpoint = `/api/admin/tournaments/${slug}`;
      const saved = await (await context.request.get(endpoint)).json();
      expect(saved.edition.archive).toEqual(archive);
      expect(saved.edition.published).toBe(false);
      expect(
        (await context.request.get(`/tournaments/${slug}/rules`)).status(),
      ).toBe(404);
      await page.goto(
        `/admin/tournaments/${slug}/archive/preview?section=rules`,
      );
      await expect(page.locator(".rules-article > section")).toHaveCount(7);
      await expect(page.locator(".rules-article")).toContainText(
        sample.ruleText,
      );
      await page.goto(`/admin/tournaments/${slug}/settings?tab=publication`);
      {
        await page.getByRole("tab", { name: "General", exact: true }).click();
        await page
          .getByRole("combobox", { name: "Square logo", exact: true })
          .selectOption(sample.thumbnail);
        await page
          .getByRole("button", { name: "Save general settings", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText("saved");
        await page.reload();
        await expect(
          page.getByRole("combobox", { name: "Square logo", exact: true }),
        ).toHaveValue(sample.thumbnail);
      }
      await page.getByRole("tab", { name: "Publication", exact: true }).click();
      await page
        .getByRole("button", { name: "Publish tournament", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await (await context.request.get(endpoint)).json()).edition
              .published,
        )
        .toBe(true);
      await context.clearCookies();
      await context.addCookies([
        { name: "oclr-locale", value: "en", domain: "127.0.0.1", path: "/" },
      ]);
      await page.setViewportSize({
        width: isMobile ? 390 : 1440,
        height: 1000,
      });
      {
        await page.goto("/tournaments");
        const card = page.locator(".edition-card").filter({
          has: page.locator(`a[href="/tournaments/${slug}"]`),
        });
        const thumbnail = card.locator(".edition-art img");
        await expect(thumbnail).toHaveAttribute("src", sample.thumbnail);
        await expect
          .poll(() =>
            thumbnail.evaluate(
              (image) => (image as HTMLImageElement).naturalWidth,
            ),
          )
          .toBe(sample.thumbnailWidth);
        const bounds = await thumbnail.boundingBox();
        expect(bounds!.width / bounds!.height).toBeCloseTo(
          sample.thumbnailRatio,
          2,
        );
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-theme",
              value: theme,
              domain: "127.0.0.1",
              path: "/",
            },
          ]);
          await page.reload();
          await expect(thumbnail).toBeVisible();
          await card.screenshot({
            path: info.outputPath(`${sample.key}-thumbnail-${theme}.png`),
          });
        }
      }
      await page.goto(`/tournaments/${slug}`);
      await expect(page.locator("#rules .rules-article > section")).toHaveCount(
        7,
      );
      await expect(page.locator("#rules .rules-article")).toContainText(
        sample.ruleText,
      );
      await expect(page.locator("#rules .rules-illustration img")).toHaveCount(
        sample.images,
      );
      await page.locator("#rules").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`${sample.key}-overview-rules.png`),
        fullPage: false,
      });
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-appearance",
              value: appearance,
              domain: "127.0.0.1",
              path: "/",
            },
            {
              name: "oclr-theme",
              value: theme,
              domain: "127.0.0.1",
              path: "/",
            },
          ]);
          for (const path of ["schedule", "mappools", "rules"]) {
            await page.goto(`/tournaments/${slug}/${path}`);
            if (path === "schedule") {
              await expect(page.locator(".event-matches tbody tr")).toHaveCount(
                sample.results,
              );
              await expect(page.locator(".historical-archive")).toContainText(
                "UTC+8",
              );
              await expect(
                page.getByRole("button", { name: /Unconfirmed records/ }),
              ).toHaveCount(0);
            } else if (path === "mappools") {
              await expect(
                page
                  .getByRole("navigation", { name: "Mappool stages" })
                  .getByRole("link"),
              ).toHaveCount(sample.pools);
              await expect(page.locator(".archive-map-item")).toHaveCount(19);
            } else {
              await expect(
                page.locator(".rules-article > section"),
              ).toHaveCount(7);
              await expect(page.locator(".rules-version")).toHaveText(
                "7 sections",
              );
              await expect(page.locator(".rules-article")).not.toContainText(
                "v1.2",
              );
              await expect(page.locator(".rules-illustration img")).toHaveCount(
                sample.images,
              );
            }
            await expect(page.locator(".historical-archive")).not.toContainText(
              "Mappools!",
            );
            expect(
              (await new AxeBuilder({ page }).analyze()).violations,
            ).toEqual([]);
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth),
            ).toBeLessThanOrEqual(isMobile ? 390 : 1440);
            await page.screenshot({
              path: info.outputPath(`${appearance}-${theme}-${path}.png`),
              fullPage: false,
            });
          }
        }
      for (const image of await page.locator(".rules-illustration img").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            image.evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
      }
      await page.screenshot({
        path: info.outputPath(`${sample.key}-rule-diagram.png`),
        fullPage: false,
      });
      for (const pool of archive.pools) {
        await page.goto(`/tournaments/${slug}/mappools/${pool.id}`);
        await expect(page.locator(".archive-map-item")).toHaveCount(
          pool.maps.length,
        );
      }
      await page.goto(`/tournaments/${slug}/players`);
      await expect(page.locator(".archive-player-card")).toHaveCount(
        sample.players,
      );
      await expect(page.locator('[data-role="coach"]')).toHaveCount(
        sample.coaches,
      );
      await page
        .getByRole("searchbox", { name: "Search players", exact: true })
        .fill(sample.searchId);
      await expect(page.locator(".archive-player-card")).toHaveCount(1);
      await expect(page.locator(".archive-player-card")).toContainText(
        sample.searchName,
      );
      await page.goto(`/tournaments/${slug}/draft`);
      await expect(page.locator(".archive-draft-picks li")).toHaveCount(
        sample.picks,
      );
      await page.goto(`/tournaments/${slug}/staff`);
      await expect(
        page.locator(".archive-staff .public-staff-list > li"),
      ).toHaveCount(sample.staff);
      if (sample.key === "s8") {
        await expect(page.locator(".historical-archive")).toContainText(
          "Sonoboi",
        );
        await page.goto(`/tournaments/${slug}/bracket`);
        await expect(
          page.locator(".historical-archive table tbody tr td:nth-child(2)"),
        ).toHaveText([
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
        await expect(page.locator(".historical-archive")).toContainText(
          "This is a derived order, not an official archived ranking.",
        );

        for (const group of ["A", "B", "C", "D"]) {
          await page.getByRole("button", { name: group, exact: true }).click();
          await expect(
            page.locator(".bracket-group-grid .match-card"),
          ).toHaveCount(6);
        }
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await page.screenshot({
          path: info.outputPath("s8-derived-standings-bracket.png"),
          fullPage: false,
        });
      }
      for (const match of archive.matches.filter((m) => m.score === null))
        expect(
          (
            await context.request.get(
              `/tournaments/${slug}/matches/${match.id}`,
            )
          ).status(),
        ).toBe(404);
      expect((await context.request.get(endpoint)).status()).toBe(401);
    });
});
