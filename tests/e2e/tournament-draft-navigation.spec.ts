import { test, expect } from "@playwright/test";
import { closeDb } from "../../src/db";
import { draftCommand, pickPlayer } from "../../src/lib/draft";
import { staffDraft } from "../../src/lib/draft-reads";
import { prepareDraft } from "../fixtures/draft";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";

test.describe("public draft results navigation", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterAll(closeDb);

  test("opens current and historical results while keeping unreleased picks private", async ({
    page,
    context,
    isMobile,
  }) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const base = isMobile ? 120001 : 110001;
    process.env.ADMIN_OSU_IDS = String(base);
    const suffix = `${isMobile ? "mobile" : "desktop"}-test-${Date.now()}`;
    const current = `draft-nav-current-${suffix}`;
    const historical = `draft-nav-history-${suffix}`;
    const fixture = await prepareDraft(current, base, 2, false);
    await seedEditions([
      {
        ...edition,
        slug: historical,
        status: "completed",
        registration: null,
        archive: { ...historicalArchive, editionSlug: historical },
      },
    ]);
    await context.route("https://a.ppy.sh/**", (route) => route.abort());
    const navigation = page.getByRole("navigation", {
      name: "Tournament navigation",
      exact: true,
    });
    const menu = page.getByRole("button", { name: /^Tournament menu/ });
    const link = navigation.getByRole("link", {
      name: "Draft results",
      exact: true,
    });
    async function openMenu() {
      if (await menu.isVisible()) await menu.click();
    }
    async function enterResults(slug: string) {
      await page.goto(`/tournaments/${slug}/players`);
      await openMenu();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/tournaments/${slug}/draft`);
      await link.click();
      await expect(page).toHaveURL(`/tournaments/${slug}/draft`);
      if (await menu.isVisible())
        await expect(menu).toHaveAttribute("aria-expanded", "false");
      await openMenu();
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(
        navigation.getByRole("link", { name: "Players", exact: true }),
      ).not.toHaveAttribute("aria-current");
    }
    async function command(action: "ready" | "start" | "publish") {
      const session = (await staffDraft(fixture.staff, current)).session!;
      await draftCommand(fixture.staff, current, {
        command: { action },
        expectedVersion: session.version,
        confirmed: true,
      });
    }
    await enterResults(current);
    await expect(
      page.getByRole("heading", {
        name: "Draft awaiting publication",
        exact: true,
      }),
    ).toBeVisible();
    await command("ready");
    await command("start");
    for (const player of fixture.players.slice(0, 2)) {
      const session = (await staffDraft(fixture.staff, current)).session!;
      await pickPlayer(fixture.staff, current, {
        sessionId: session.id,
        turnIndex: session.turnIndex,
        candidateId: player.osuId,
        expectedVersion: session.version,
        idempotencyKey: crypto.randomUUID(),
      });
    }
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Draft awaiting publication",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(fixture.players[0].username, { exact: true }),
    ).toHaveCount(0);
    expect(
      await (
        await context.request.get(`/api/tournaments/${current}/draft`)
      ).json(),
    ).toBeNull();
    await command("publish");

    for (const slug of [current, historical]) {
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-appearance",
              value: appearance,
              url: "http://127.0.0.1:3100",
            },
            { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
          ]);
          await enterResults(slug);
          if (slug === current) {
            await expect(
              page.getByText("Draft completed", { exact: true }),
            ).toBeVisible();
            const picks = page.getByRole("region", {
              name: "Published pick history",
              exact: true,
            });
            await expect(picks).toContainText(fixture.players[0].username);
            await expect(picks).toContainText(fixture.players[1].username);
          } else {
            await expect(
              page.getByRole("heading", { name: "Draft results", exact: true }),
            ).toBeVisible();
            await expect(page.locator(".archive-draft")).toContainText(
              "Historical Player",
            );
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(page.viewportSize()!.width);
        }
      }
    }
  });
});
