import { test, expect } from "@playwright/test";
import { db, closeDb } from "../../src/db";
import { users, captains, teams } from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";

test.describe("public tournament teams navigation", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterAll(closeDb);

  test("opens current and historical teams with the correct active section", async ({
    page,
    context,
    isMobile,
  }, info) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const suffix = `${isMobile ? "mobile" : "desktop"}-test-${Date.now()}`;
    const current = `teams-current-${suffix}`;
    const historical = `teams-history-${suffix}`;
    await seedEditions([
      { ...edition, slug: current },
      {
        ...edition,
        slug: historical,
        status: "completed",
        registration: null,
        archive: { ...historicalArchive, editionSlug: historical },
      },
    ]);
    const captainId = isMobile ? 222002 : 222001;
    await db().insert(users).values({
      osuId: captainId,
      username: "Navigation Test Captain",
    });
    await db().insert(captains).values({
      editionSlug: current,
      userId: captainId,
      published: true,
      position: 1,
    });
    const [team] = await db()
      .insert(teams)
      .values({
        editionSlug: current,
        captainId,
        name: "Navigation Test Team",
        capacity: 1,
        identityPublished: true,
      })
      .returning();
    await context.route("https://a.ppy.sh/**", (route) => route.abort());

    const navigation = page.getByRole("navigation", {
      name: "Tournament navigation",
      exact: true,
    });
    const menu = page.getByRole("button", { name: /^Tournament menu/ });
    async function openMenu() {
      if (await menu.isVisible()) {
        await menu.click();
        await expect(menu).toHaveAttribute("aria-expanded", "true");
      }
    }

    for (const [slug, teamId, name] of [
      [current, team.id, "Navigation Test Team"],
      [historical, "alpha", "Synthetic Alpha"],
    ]) {
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
          await page.goto(`/tournaments/${slug}/players`);
          await openMenu();
          const link = navigation.getByRole("link", {
            name: "Teams",
            exact: true,
          });
          await expect(link).toBeVisible();
          await expect(link).toHaveAttribute(
            "href",
            `/tournaments/${slug}/teams`,
          );
          await expect(
            navigation.getByRole("link", { name: "Players", exact: true }),
          ).toHaveAttribute("aria-current", "page");
          await link.click();
          await expect(page).toHaveURL(`/tournaments/${slug}/teams`);
          await expect(
            page.getByRole("heading", { name: "Teams", exact: true }),
          ).toBeVisible();
          if (await menu.isVisible())
            await expect(menu).toHaveAttribute("aria-expanded", "false");
          await openMenu();
          await expect(link).toHaveAttribute("aria-current", "page");
          await expect(navigation.locator('[aria-current="page"]')).toHaveCount(
            1,
          );
          await expect(
            navigation.getByRole("link", { name: "Players", exact: true }),
          ).not.toHaveAttribute("aria-current");
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(page.viewportSize()!.width);
          await page.screenshot({
            path: info.outputPath(
              `${slug === current ? "current" : "historical"}-${appearance}-${theme}.png`,
            ),
            fullPage: true,
          });
          // The mobile menu now floats over the page; dismiss it before
          // choosing a team card underneath it.
          if (await menu.isVisible()) {
            await menu.press("Escape");
            await expect(menu).toHaveAttribute("aria-expanded", "false");
          }
          await page
            .locator(`a[href="/tournaments/${slug}/teams/${teamId}"]`)
            .first()
            .click();
          await expect(
            page.getByRole("heading", { name, exact: true }).first(),
          ).toBeVisible();
          await openMenu();
          await expect(link).toHaveAttribute("aria-current", "page");
          await expect(navigation.locator('[aria-current="page"]')).toHaveCount(
            1,
          );
        }
      }
    }
  });
});
