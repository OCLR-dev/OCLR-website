import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { closeDb } from "../../src/db";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { captureResponsiveLayout } from "./responsive";

test.describe("historical archive browser workflow", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterAll(async () => closeDb());
  test("reviews private import, explicitly publishes, and keeps every detail in its edition", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `history-${isMobile ? "mobile" : "desktop"}-test-${Date.now()}`;
    const archive = { ...historicalArchive, editionSlug: slug };
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic historical season",
        season: "9",
        published: false,
        status: "completed",
        registration: null,
      },
    ]);
    const endpoint = `/api/admin/tournaments/${slug}`;
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page.getByLabel("Archive JSON file", { exact: true }).setInputFiles({
      name: "synthetic-archive.json",
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
    await expect(page.getByRole("status")).toContainText("Archive draft saved");
    const saved = await (await context.request.get(endpoint)).json();
    expect(saved.edition.published).toBe(false);
    expect(saved.edition.archive).toEqual(archive);
    await page
      .getByRole("link", { name: "Open saved archive preview" })
      .click();
    await expect(
      page.getByText("Private archive preview", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".historical-archive")).not.toContainText(
      "Sources and coverage",
    );
    await expect(
      page.locator(`.historical-archive a[href="${archive.sourceUrl}"]`),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Staff", exact: true }).click();
    await expect(page).toHaveURL(/archive\/preview\?section=staff$/);
    await expect(page.locator(".archive-staff")).toContainText(
      "Historical Host",
    );
    await expect(page.locator(".archive-staff")).not.toContainText("Staff!A2");
    await page
      .getByRole("link", { name: "Archive overview", exact: true })
      .click();
    await page.getByRole("link", { name: "Teams", exact: true }).last().click();
    await page
      .getByRole("link", { name: "Synthetic Alpha", exact: true })
      .first()
      .click();
    await expect(
      page
        .getByRole("heading", { name: "Synthetic Alpha", exact: true })
        .first(),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/admin/tournaments/${slug}/archive/preview`),
    );
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=players`,
    );
    await page
      .getByRole("searchbox", { name: "Search players", exact: true })
      .fill("91003");
    await expect(page.locator(".archive-player-card")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Historical Player", exact: true }),
    ).toHaveAttribute(
      "href",
      `/admin/tournaments/${slug}/archive/preview?section=players&id=91003`,
    );
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=mappools`,
    );
    await expect(page.locator(".archive-map-item")).toHaveCount(2);
    await page
      .getByRole("navigation", { name: "Mappool stages" })
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/admin/tournaments/${slug}/archive/preview\\?section=mappools&id=final`,
      ),
    );
    await expect(page.locator(".archive-map-item")).toHaveCount(2);
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=schedule`,
    );
    await page
      .getByLabel("Match status", { exact: true })
      .selectOption("unconfirmed");
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    await expect(
      page
        .locator(".event-matches")
        .getByText("Unconfirmed alternative", { exact: true }),
    ).toBeVisible();
    const guest = await context.browser()!.newContext();
    expect(
      (
        await guest.request.get(
          `http://127.0.0.1:3100/tournaments/${slug}/staff`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await guest.request.get(`http://127.0.0.1:3100/tournaments/${slug}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await guest.request.get(
          `http://127.0.0.1:3100/api/admin/tournaments/${slug}`,
        )
      ).ok(),
    ).toBe(false);
    await guest.close();
    const denied = await context.request.post(endpoint, {
      data: {
        action: "publication",
        expectedRevision: 1,
        confirmed: true,
        published: true,
      },
      headers: { Origin: "https://wrong.example" },
    });
    expect(denied.status()).toBe(403);
    await page.goto(`/admin/tournaments/${slug}/settings?tab=publication`);
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
    await page.goto("/tournaments");
    await expect(
      page.getByRole("heading", { name: "Historical seasons" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Current tournaments" }),
    ).toBeVisible();
    await page.goto(`/tournaments/${slug}`);
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await page
      .getByRole("navigation", { name: "Tournament navigation" })
      .getByRole("link", { name: "Staff", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/tournaments/${slug}/staff$`));
    await expect(
      page.getByRole("heading", { name: "Staff", exact: true }),
    ).toBeVisible();
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Tournament navigation" })
        .getByRole("link", { name: "Staff", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".archive-staff a")).toHaveAttribute(
      "href",
      "https://osu.ppy.sh/users/91005",
    );
    expect(
      (await context.request.get("/tournaments/test-cup/staff")).status(),
    ).toBe(404);
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            domain: "127.0.0.1",
            path: "/",
          },
          { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
        ]);
        await page.goto(`/tournaments/${slug}`);
        await expect(
          page.getByRole("heading", {
            name: "Synthetic historical season",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.locator(`.historical-archive a[href="${archive.sourceUrl}"]`),
        ).toHaveCount(0);
        await expect(page.locator(".historical-archive")).not.toContainText(
          "Sources and coverage",
        );
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
      }
    }
    const staffLink = page
      .getByRole("navigation", { name: "Tournament navigation" })
      .getByRole("link", { name: "Staff", exact: true });
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await expect(staffLink).toHaveAttribute(
      "href",
      `/tournaments/${slug}/staff`,
    );
    await staffLink.click();
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await expect(staffLink).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".archive-staff")).toContainText(
      "Historical Host",
    );
    await page.goto(`/tournaments/${slug}`);
    await captureResponsiveLayout(page, info, "archive-overview");
    await page.goto(`/tournaments/${slug}/teams/alpha`);
    await expect(page.locator(".historical-archive")).not.toContainText(
      archive.teams[0].source,
    );
    await page
      .getByRole("link", { name: "Historical Player", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/tournaments/${slug}/players/91003$`),
    );
    await expect(page.getByText("Tier 1", { exact: true })).toBeVisible();
    await expect(page.locator(".historical-archive")).not.toContainText(
      archive.players.find((p) => p.osuId === 91003)!.source,
    );
    await page.goto(`/tournaments/${slug}/players`);
    await expect(
      page.locator('.archive-player-card[data-role="coach"]'),
    ).toContainText("Coach");
    await expect(
      page.locator(".archive-player-card img").first(),
    ).toHaveAttribute("src", /a\.ppy\.sh\/91001/);
    await captureResponsiveLayout(page, info, "archive-players");
    await page.goto(`/tournaments/${slug}/results`);
    await expect(page).toHaveURL(new RegExp(`/schedule\\?status=recorded$`));
    await expect(
      page.getByText("Unconfirmed alternative", { exact: true }),
    ).toHaveCount(0);
    await page
      .locator(".event-matches")
      .getByRole("link", { name: "Historical Final", exact: true })
      .click();
    await expect(page.getByRole("link", { name: "MP 1" })).toHaveAttribute(
      "href",
      "https://osu.ppy.sh/community/matches/123456",
    );
    await page.goto(`/tournaments/${slug}/schedule`);
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /Unconfirmed records/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Unconfirmed alternative", { exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Rounds", { exact: true }).selectOption("Final");
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    await captureResponsiveLayout(page, info, "archive-matches");
    await page.goto(`/tournaments/${slug}/draft`);
    await expect(
      page.getByRole("heading", { name: "Round 1", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".archive-draft-picks li")).toHaveCount(1);
    await captureResponsiveLayout(page, info, "archive-draft");
    await page.goto(`/tournaments/${slug}/bracket`);
    await page.getByRole("button", { name: "Knockout", exact: true }).click();
    await expect(page.locator(".bracket-round")).toHaveCount(1);
    await expect(
      page.locator('.bracket-frame [data-match-id="one"]'),
    ).toBeVisible();
    await expect(
      page.locator('.bracket-frame [data-match-id="alternative"]'),
    ).toHaveCount(0);
    await captureResponsiveLayout(page, info, "archive-bracket");
    await page.goto(`/tournaments/${slug}/mappools/final`);
    await expect(
      page.getByText("Beatmap ID unresolved", { exact: false }),
    ).toBeVisible();
    await expect(page.locator(".archive-map-stats").first()).toContainText(
      "2:03",
    );
    await page.getByRole("tab", { name: "TB", exact: true }).click();
    await expect(page.locator(".archive-map-item")).toHaveCount(1);
    await expect(
      page
        .locator(".archive-map-stats")
        .getByLabel("Not recorded", { exact: true }),
    ).toHaveCount(6);
    await page.getByRole("tab", { name: "All mods", exact: true }).click();
    await captureResponsiveLayout(page, info, "archive-pool");
    for (const path of ["bracket", "draft", "rules", "results/awards"]) {
      expect((await page.goto(`/tournaments/${slug}/${path}`))?.status()).toBe(
        200,
      );
    }
    for (const path of [
      "teams/missing",
      "players/9999",
      "mappools/missing",
      "matches/missing",
      "matches/alternative",
    ]) {
      expect((await page.goto(`/tournaments/${slug}/${path}`))?.status()).toBe(
        404,
      );
    }
    for (const locale of ["zh-Hans", "zh-Hant"]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      await page.goto(`/tournaments/${slug}/players`);
      await expect(
        page.getByText(locale === "zh-Hant" ? "歷史歸檔" : "历史归档", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText("Captain", { exact: true })).toHaveCount(2);
      const search = page.getByRole("searchbox", {
        name: locale === "zh-Hant" ? "搜尋選手" : "搜索选手",
        exact: true,
      });
      await search.fill("91003");
      await expect(page.locator(".archive-player-card")).toHaveCount(1);
      await page.goto(`/tournaments/${slug}/staff`);
      await expect(
        page.getByRole("heading", {
          name: locale === "zh-Hant" ? "工作人員" : "工作人员",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator(".archive-staff")).toContainText(
        "Historical Host",
      );
    }
  });
  test("renders the complete S9 archive across appearances without inventing results", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `s9-design-${isMobile ? "mobile" : "desktop"}-${Date.now()}`;
    const archive = historicalArchiveSchema.parse({
      ...JSON.parse(readFileSync("docs/imports/s9-archive.json", "utf8")),
      editionSlug: slug,
    });
    await seedEditions([
      {
        ...edition,
        slug,
        name: "S9 archive design verification",
        branding: { ...edition.branding, logo: "/archive/s9/thumbnail.png" },
        season: "9",
        published: true,
        status: "completed",
        registration: null,
        archive,
      },
    ]);
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            domain: "127.0.0.1",
            path: "/",
          },
          { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
        ]);
        await page.goto("/tournaments");
        const card = page
          .locator(".edition-card")
          .filter({ has: page.locator(`a[href="/tournaments/${slug}"]`) });
        await card.scrollIntoViewIfNeeded();
        const thumbnail = card.locator(".edition-art img");
        await expect(thumbnail).toHaveAttribute(
          "src",
          "/archive/s9/thumbnail.png",
        );
        await expect
          .poll(() =>
            thumbnail.evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBe(1920);
        const bounds = await thumbnail.boundingBox();
        expect(bounds!.width / bounds!.height).toBeCloseTo(16 / 9, 2);
        await card.screenshot({
          path: info.outputPath(`s9-thumbnail-${appearance}-${theme}.png`),
        });
        for (const path of [
          "schedule",
          "players",
          "draft",
          "bracket",
          "mappools",
          "staff",
          "rules",
        ]) {
          await page.goto(`/tournaments/${slug}/${path}`);
          if (path === "schedule") {
            await expect(page.locator(".event-matches tbody tr")).toHaveCount(
              22,
            );
            await expect(
              page.getByRole("button", { name: /Unconfirmed records/ }),
            ).toHaveCount(0);
          } else if (path === "rules") {
            await expect(page.locator(".rules-article > section")).toHaveCount(
              8,
            );
            await expect(page.locator(".rules-illustration img")).toHaveCount(
              2,
            );
            await expect(page.locator(".rules-version")).toContainText("v1.2");
            await expect(page.locator(".rules-article")).toContainText(
              "没有总决赛reset！",
            );
            await expect(page.locator(".rules-article")).not.toContainText(
              "Synthetic rules",
            );
            for (const image of await page
              .locator(".rules-illustration img")
              .all()) {
              await image.scrollIntoViewIfNeeded();
              await expect
                .poll(() =>
                  image.evaluate(
                    (img) => (img as HTMLImageElement).naturalWidth,
                  ),
                )
                .toBeGreaterThan(0);
            }
            await page
              .locator(".rules-article h2")
              .first()
              .scrollIntoViewIfNeeded();
          } else if (path === "players") {
            await expect(page.locator(".archive-player-card")).toHaveCount(76);
            await expect(page.locator('[data-role="coach"]')).toHaveCount(8);
            const search = page.getByRole("searchbox", {
              name: "Search players",
              exact: true,
            });
            await search.fill("  VIALVISTAS  ");
            await expect(page.locator(".archive-player-card")).toHaveCount(1);
            await expect(page.locator(".archive-player-card")).toContainText(
              "9697708",
            );
            await search.fill("9697708");
            await expect(page.locator(".archive-player-card")).toHaveCount(1);
            await search.fill(archive.teams[0].name);
            await expect(page.locator(".archive-player-card")).toHaveCount(9);
            await search.fill("missing synthetic identity");
            await expect(page.locator(".archive-player-card")).toHaveCount(0);
            await expect(
              page.getByText("No players match your search.", { exact: true }),
            ).toBeVisible();
            await search.fill("");
            await expect(page.locator(".archive-player-card")).toHaveCount(76);
          } else if (path === "draft") {
            await expect(page.locator(".archive-draft-round")).toHaveCount(7);
            await expect(page.locator(".archive-draft-picks li")).toHaveCount(
              56,
            );
          } else if (path === "staff") {
            await expect(page.locator(".archive-staff section")).toHaveCount(8);
            await expect(
              page.locator(".archive-staff .public-staff-list > li"),
            ).toHaveCount(19);
            for (const person of archive.staff) {
              await expect(
                page
                  .locator(".archive-staff")
                  .getByRole("link", { name: person.username, exact: true }),
              ).toHaveAttribute(
                "href",
                `https://osu.ppy.sh/users/${person.osuId}`,
              );
              await expect(page.locator(".archive-staff")).not.toContainText(
                person.source,
              );
            }
          } else if (path === "mappools") {
            await expect(page.locator(".archive-map-item")).toHaveCount(19);
            await expect(
              page
                .getByRole("navigation", { name: "Mappool stages" })
                .getByRole("link"),
            ).toHaveCount(4);
            await expect(page.locator(".archive-pool-source")).toHaveCount(0);
          } else {
            await page
              .getByRole("button", { name: "Knockout", exact: true })
              .click();
            await expect(page.locator(".bracket-round")).toHaveCount(5);
            await expect(
              page.locator(".bracket-frame .match-card"),
            ).toHaveCount(10);
            await expect
              .poll(() => page.locator(".bracket-connectors path").count())
              .toBeGreaterThan(0);
            await page
              .locator(".archive-competition > .event-tabs button")
              .first()
              .click();
            for (const label of ["A", "B"]) {
              await page
                .getByRole("button", { name: label, exact: true })
                .click();
              const cards = page.locator(".bracket-group-grid .match-card");
              await expect(cards).toHaveCount(6);
              expect(
                (await new AxeBuilder({ page }).analyze()).violations,
              ).toEqual([]);
              await expect(page.locator(".bracket-connectors")).toHaveCount(0);
              const first = await cards.nth(0).boundingBox();
              const second = await cards.nth(1).boundingBox();
              expect(first).not.toBeNull();
              expect(second).not.toBeNull();
              if (isMobile) expect(second!.y).toBeGreaterThan(first!.y);
              else {
                expect(Math.abs(first!.y - second!.y)).toBeLessThan(1);
                expect(second!.x).toBeGreaterThan(first!.x);
              }
              await page.screenshot({
                path: info.outputPath(
                  `${appearance}-${theme}-group-${label}.png`,
                ),
                fullPage: false,
              });
            }
            await page
              .getByRole("button", { name: "Knockout", exact: true })
              .click();
          }
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(isMobile ? 390 : 1440);
          await page.screenshot({
            path: info.outputPath(`${appearance}-${theme}-${path}.png`),
            fullPage: false,
          });
        }
      }
    await page.goto(`/tournaments/${slug}`);
    await expect(page.locator("#rules .rules-article > section")).toHaveCount(
      8,
    );
    await expect(page.locator("#rules .rules-version")).toContainText("v1.2");
    await expect(page.locator("#rules .rules-article")).toContainText(
      "没有总决赛reset！",
    );
    await expect(page.locator("#rules .rules-illustration img")).toHaveCount(2);
    await page.screenshot({
      path: info.outputPath("historical-overview-rules.png"),
      fullPage: true,
    });
    await page.goto(`/tournaments/${slug}/rules`);
    if (isMobile) await page.locator(".rules-mobile-contents summary").click();
    const contents = page.locator(
      isMobile ? ".rules-mobile-contents nav" : ".rules-desktop-contents nav",
    );
    await contents.getByRole("link", { name: "EX模式", exact: true }).click();
    await expect(page.locator(".rules-article h2").last()).toBeInViewport();
    if (isMobile)
      await expect(page.locator(".rules-mobile-contents")).not.toHaveAttribute(
        "open",
        "",
      );
    for (const unplayed of archive.matches.filter((m) => m.score === null)) {
      expect(
        (
          await context.request.get(
            `/tournaments/${slug}/matches/${unplayed.id}`,
          )
        ).status(),
      ).toBe(404);
    }
    await page.goto(`/tournaments/${slug}/mappools`);
    const stageNav = page.getByRole("navigation", { name: "Mappool stages" });
    await expect(
      page.locator(".archive-map-cards .map-browse-card"),
    ).toHaveCount(19);
    const opener = page.locator(".map-open-button").first();
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
      archive.pools[0].maps[0].title,
    );
    await page.getByRole("button", { name: "Next map", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
      archive.pools[0].maps[1].title,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();

    for (const pool of archive.pools) {
      await stageNav
        .getByRole("link", {
          name: `${pool.name} ${pool.maps.length}`,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(new RegExp(`/mappools/${pool.id}$`));
      await page
        .getByRole("button", { name: "Compact table", exact: true })
        .click();
      await page
        .getByLabel(`Sort ${pool.name}`, { exact: true })
        .selectOption("title");
      const titleOrder = [...pool.maps].sort((a, b) =>
        a.title.localeCompare(b.title),
      );
      await expect(page.locator(".archive-map-identity h3").first()).toHaveText(
        titleOrder[0].title,
      );
      await page
        .getByLabel(`Sort ${pool.name}`, { exact: true })
        .selectOption("slot");
      await expect(page.locator(".archive-map-item")).toHaveCount(19);
      await expect(stageNav.locator('[aria-current="page"]')).toContainText(
        pool.name,
      );
      await expect
        .poll(() =>
          stageNav.locator('[aria-current="page"]').evaluate((el) => {
            const a = el.getBoundingClientRect(),
              b = el.parentElement!.getBoundingClientRect();
            return a.left >= b.left - 1 && a.right <= b.right + 1;
          }),
        )
        .toBe(true);
      await page.getByRole("tab", { name: "TB", exact: true }).click();
      const tb = pool.maps.find((m) => m.slot === "TB1")!;
      await expect(page.locator(".archive-map-item")).toHaveCount(1);
      await expect(
        page.locator(
          '.archive-map-item .beatmap-actions a[href^="https://osu.ppy.sh/"]',
        ),
      ).toHaveAttribute("href", `https://osu.ppy.sh/beatmaps/${tb.beatmapId}`);
      await page.getByRole("tab", { name: "TB", exact: true }).press("Home");
      await expect(
        page.getByRole("tab", { name: "All mods", exact: true }),
      ).toBeFocused();
      await expect(page.locator(".archive-map-item")).toHaveCount(19);
      await page
        .getByRole("tab", { name: "All mods", exact: true })
        .press("ArrowRight");
      await expect(
        page.getByRole("tab", { name: "NM", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      const first = pool.maps[0];
      await page
        .getByRole("searchbox", { name: "Search maps", exact: true })
        .fill(String(first.beatmapId));
      await expect(page.locator(".archive-map-item")).toHaveCount(1);
      await expect(page.locator(".archive-map-identity h3")).toHaveText(
        first.title,
      );
      await expect(
        page.locator(".archive-map-stats dd").first(),
      ).toHaveAttribute("title", String(first.stars));
      await page
        .getByRole("searchbox", { name: "Search maps", exact: true })
        .fill("nonexistent synthetic song");
      await expect(
        page.getByText("No maps match these filters.", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("searchbox", { name: "Search maps", exact: true })
        .fill("");
      await page.getByRole("tab", { name: "All mods", exact: true }).click();
      await expect(page.locator(".historical-archive")).not.toContainText(
        pool.source,
      );
    }
    await page.goBack();
    await expect(stageNav.locator('[aria-current="page"]')).toContainText(
      "FINALS",
    );
    await page.goForward();
    await expect(stageNav.locator('[aria-current="page"]')).toContainText(
      "GRAND FINALS",
    );
    for (const [locale, searchLabel] of [
      ["zh-Hans", "搜索谱面"],
      ["zh-Hant", "搜尋譜面"],
    ]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      await page.reload();
      await expect(
        page.getByRole("searchbox", { name: searchLabel, exact: true }),
      ).toBeVisible();
      await expect(page.locator(".archive-map-item")).toHaveCount(19);
      await expect(page.locator(".archive-map-identity h3").first()).toHaveText(
        archive.pools[3].maps[0].title,
      );
    }
  });
});
