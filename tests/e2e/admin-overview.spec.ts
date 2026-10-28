import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { and, eq, ne, sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import { appearances } from "../../src/lib/preferences";
import { seedAdminOverview } from "../fixtures/admin-overview";
const local = "http://127.0.0.1:3100";
test.describe("administration overview tournaments", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("pages and filters the full authorized collection and restores URL state", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const { admin } = await seedAdminOverview();
    await context.addCookies([
      admin,
      { name: "oclr-locale", value: "en", url: local },
    ]);
    await page.goto("/admin");
    const section = page.locator("#accessible-tournaments");
    const slugs = () =>
      section
        .locator("article a")
        .evaluateAll((links) =>
          links.map((link) =>
            new URL((link as HTMLAnchorElement).href).pathname
              .split("/")
              .at(-1),
          ),
        );
    await expect(section.locator("article")).toHaveCount(12);
    await expect(
      section.getByText("29 tournaments", { exact: true }),
    ).toBeVisible();
    const boxes = await section.locator("article").evaluateAll((cards) =>
      cards.slice(0, 2).map((card) => {
        const b = card.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width };
      }),
    );
    if (isMobile) expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    else {
      expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
      expect(boxes[0].width).toBeLessThan(
        (await section.boundingBox())!.width * 0.7,
      );
    }
    await page.screenshot({
      path: info.outputPath("overview-full.png"),
      fullPage: true,
    });
    await section.evaluate((node) => node.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: info.outputPath("overview-list.png"),
      animations: "disabled",
    });
    const all = [...(await slugs())];
    await section.getByRole("link", { name: "Next →", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\?tournamentPage=2/);
    await expect(section.locator("article")).toHaveCount(12);
    all.push(...(await slugs()));
    await section.getByRole("link", { name: "Next →", exact: true }).click();
    await expect(section.locator("article")).toHaveCount(5);
    all.push(...(await slugs()));
    expect(all).toEqual(
      Array.from(
        { length: 29 },
        (_, i) => `overview-${String(29 - i).padStart(2, "0")}`,
      ),
    );
    await expect(
      section.getByText("Page 3 of 3", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole("link", { name: "Next →", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(section.locator("article")).toHaveCount(5);
    await section
      .getByRole("link", { name: "← Previous", exact: true })
      .click();
    await expect(section.locator("article")).toHaveCount(12);
    const before = await section.locator("article h3").allTextContents();
    await section.locator("article a").first().click();
    await expect(page).toHaveURL(/\/admin\/tournaments\/overview-/);
    await page.goBack();
    await expect(section.locator("article h3")).toHaveText(before);
    await expect(page).toHaveURL(/tournamentPage=2/);
    await section
      .getByLabel("Search tournaments", { exact: true })
      .fill("Legacy");
    await section
      .getByLabel("Search tournaments", { exact: true })
      .press("Enter");
    await expect(page).toHaveURL(/tournamentQuery=Legacy/);
    expect(new URL(page.url()).searchParams.has("tournamentPage")).toBe(false);
    await expect(
      section.getByText("17 tournaments", { exact: true }),
    ).toBeVisible();
    await section.getByRole("link", { name: "Next →", exact: true }).click();
    await expect(section.locator("article")).toHaveCount(5);
    await expect(section.locator("article").last()).toContainText(
      "Synthetic Legacy League 1",
    );
    await expect(
      section.getByLabel("Search tournaments", { exact: true }),
    ).toHaveValue("Legacy");
    await section
      .getByLabel("Tournament status", { exact: true })
      .selectOption("completed");
    await section.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(section.locator("article")).toHaveCount(6);
    await expect(
      section.getByText("Page 1 of 1", { exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.has("tournamentPage")).toBe(false);
    await page.reload();
    await expect(
      section.getByLabel("Tournament status", { exact: true }),
    ).toHaveValue("completed");
    await section
      .getByLabel("Search tournaments", { exact: true })
      .fill("No matching synthetic name");
    await section.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(
      section.getByText("No matching tournaments", { exact: true }),
    ).toBeVisible();
    await expect(section.locator("article")).toHaveCount(0);
    await expect(
      section.getByText("0 tournaments", { exact: true }),
    ).toBeVisible();
    await expect(section.getByRole("navigation")).toHaveCount(0);
    await section
      .getByRole("link", { name: "Clear filters", exact: true })
      .click();
    await expect(
      section.getByLabel("Search tournaments", { exact: true }),
    ).toHaveValue("");
    await expect(
      section.getByLabel("Tournament status", { exact: true }),
    ).toHaveValue("");
    await expect(section.locator("article")).toHaveCount(12);
    for (const [query, pageText, count] of [
      ["tournamentPage=-1", "Page 1 of 3", 12],
      ["tournamentPage=9999", "Page 3 of 3", 5],
    ] as const) {
      await page.goto(`/admin?${query}`);
      await expect(section.getByText(pageText, { exact: true })).toBeVisible();
      await expect(section.locator("article")).toHaveCount(count);
    }
    for (const query of [
      "q=Legacy",
      "edition=overview-01",
      "status=pending",
      "page=2",
      "q=Legacy&tournamentPage=2",
    ]) {
      const response = await context.request.get(`/admin?${query}`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers().location, local).pathname).toBe(
        "/admin/registrations",
      );
    }
  });
  test("keeps scoped/developer visibility and handles access changes, single and empty collections", async ({
    page,
    context,
  }) => {
    const { admin, scoped, developer } = await seedAdminOverview();
    await context.addCookies([
      scoped,
      { name: "oclr-locale", value: "en", url: local },
    ]);
    await page.goto("/admin?tournamentPage=2");
    const section = page.locator("#accessible-tournaments");
    await expect(
      section.getByRole("heading", { name: "Your tournaments", exact: true }),
    ).toBeVisible();
    await expect(
      section.getByText("15 tournaments", { exact: true }),
    ).toBeVisible();
    await expect(section.locator("article")).toHaveCount(3);
    await page.goto("/admin?tournamentQuery=Current");
    await expect(
      section.getByText("0 tournaments", { exact: true }),
    ).toBeVisible();
    await expect(section).not.toContainText("Synthetic Current");
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(staffRoles.userId, 397101),
          ne(staffRoles.editionSlug, "overview-01"),
        ),
      );
    await page.goto("/admin?tournamentPage=2");
    await expect(
      section.getByText("1 tournament", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByText("Page 1 of 1", { exact: true }),
    ).toBeVisible();
    await expect(section.locator("article")).toHaveCount(1);
    await context.addCookies([developer]);
    await page.goto("/admin?tournamentQuery=Legacy&tournamentPage=2");
    await expect(section.locator("article")).toHaveCount(5);
    await expect(
      section.getByText("17 tournaments", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create tournament", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await context.request.post("/api/admin/tournaments", {
          headers: { Origin: local },
          data: {
            slug: "forbidden-overview-write",
            name: "Forbidden",
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(403);
    await context.addCookies([admin]);
    await db().execute(sql`TRUNCATE edition_state CASCADE`);
    await page.goto("/admin");
    await expect(
      section.getByText(
        "No tournaments yet. Create a private edition to begin.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      section.getByText("0 tournaments", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByText("No matching tournaments", { exact: true }),
    ).toHaveCount(0);
  });
  test("keeps compact cards and controls usable across locales, themes and appearances", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(300000);
    const { admin } = await seedAdminOverview();
    await context.addCookies([admin]);
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const appearance of appearances)
        for (const theme of ["light", "dark"]) {
          await context.addCookies(
            [
              ["oclr-locale", locale],
              ["oclr-appearance", appearance],
              ["oclr-theme", theme],
            ].map(([name, value]) => ({ name, value, url: local })),
          );
          await page.goto(
            "/admin?tournamentQuery=Synthetic#accessible-tournaments",
          );
          const section = page.locator("#accessible-tournaments");
          await expect(section.locator("article")).toHaveCount(12);
          await expect(
            section.locator('input[name="tournamentQuery"]'),
          ).toHaveValue("Synthetic");
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <=
                document.documentElement.clientWidth,
            ),
          ).toBe(true);
          for (const card of await section.locator("article").all()) {
            const box = (await card.boundingBox())!;
            const link = (await card.locator("a").boundingBox())!;
            expect(link.height).toBeGreaterThanOrEqual(44);
            expect(link.x).toBeGreaterThanOrEqual(box.x);
            expect(link.x + link.width).toBeLessThanOrEqual(
              box.x + box.width + 1,
            );
          }
          expect
            .soft(
              (await new AxeBuilder({ page }).include("main").analyze())
                .violations,
              `${locale}/${appearance}/${theme}`,
            )
            .toEqual([]);
          if (locale === "en" && appearance === "default" && theme === "light")
            await page.screenshot({
              path: info.outputPath("overview-filtered.png"),
              fullPage: true,
            });
        }
    const search = page.locator(
      '#accessible-tournaments input[name="tournamentQuery"]',
    );
    await search.focus();
    await expect(search).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.locator('#accessible-tournaments select[name="tournamentStatus"]'),
    ).toBeFocused();
    if (isMobile)
      expect(await page.evaluate(() => innerWidth)).toBeLessThan(500);
  });
});
