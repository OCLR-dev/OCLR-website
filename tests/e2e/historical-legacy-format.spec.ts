import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { closeDb } from "../../src/db";

test.describe("legacy historical evidence", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(90000);
  test.afterAll(async () => closeDb());
  test("imports final Tiers, ACE slots, reviewed staff and a separately confirmed forfeit", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `legacy-${isMobile ? "mobile" : "desktop"}-${Date.now()}`;
    const archive = historicalArchiveSchema.parse({
      ...JSON.parse(readFileSync("docs/imports/s7-archive.json", "utf8")),
      editionSlug: slug,
    });
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedEditions([
      {
        ...edition,
        slug,
        name: "S7 archive verification",
        status: "completed",
        registration: null,
        rules: {
          version: "synthetic-s7-reconstruction-v1",
          sections: [
            {
              heading: "Synthetic S7 rules",
              body: "Eight teams.\nFour players per side.",
            },
          ],
        },
        published: false,
      },
    ]);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page.getByLabel("Archive JSON file", { exact: true }).setInputFiles({
      name: "legacy.json",
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
    // Saving never releases the data to anonymous visitors.
    const anonymous = await context.browser()!.newContext();
    expect(
      (
        await anonymous.request.get(`http://127.0.0.1:3100/tournaments/${slug}`)
      ).status(),
    ).toBe(404);
    await anonymous.close();
    await page.goto(`/admin/tournaments/${slug}/settings`);
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
          (
            await (
              await context.request.get(`/api/admin/tournaments/${slug}`)
            ).json()
          ).edition.published,
      )
      .toBe(true);
    await context.clearCookies();
    await context.addCookies([
      { name: "oclr-locale", value: "en", domain: "127.0.0.1", path: "/" },
    ]);
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
    await page.goto(`/tournaments/${slug}`);
    await expect(
      page.getByText("synthetic-s7-reconstruction-v1", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Synthetic S7 rules", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Eight teams.\nFour players per side.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Synthetic S7 rules", exact: true }),
    ).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
      ]);
      for (const section of [
        "schedule",
        "draft",
        "staff",
        "mappools",
        "bracket",
      ]) {
        await page.goto(`/tournaments/${slug}/${section}`);
        if (section === "schedule") {
          await expect(page.locator(".event-matches tbody tr")).toHaveCount(22);
          await expect(
            page.locator(".event-matches tr[data-forfeit] .event-score"),
          ).toContainText("Winner");
          await expect(
            page.locator(".event-matches tr[data-forfeit] .event-score"),
          ).toContainText("Forfeit");
          await expect(
            page.locator(".event-matches tr[data-forfeit]"),
          ).toHaveAttribute("data-recorded", "true");
          await expect(
            page.locator(".event-matches tr[data-forfeit] .event-score"),
          ).not.toContainText("-1");
        } else if (section === "draft") {
          await expect(page.locator(".archive-draft")).toContainText(
            "Final Tier allocations; selection order was not recorded.",
          );
          await expect(page.locator(".archive-player-card")).toHaveCount(48);
          await expect(page.locator(".archive-pick-number")).toHaveCount(0);
        } else if (section === "staff") {
          await expect(page.locator(".archive-staff")).toContainText(
            "Muziyami",
          );
          await expect(page.locator(".public-staff-list a")).toHaveCount(18);
          await expect(page.locator(".public-staff-list li")).toHaveCount(18);
          await expect(
            page.getByRole("link", { name: "Truth you left", exact: true }),
          ).toHaveAttribute("href", "https://osu.ppy.sh/users/4082595");
          await expect(
            page.getByRole("link", { name: "110", exact: true }),
          ).toHaveAttribute("href", "https://osu.ppy.sh/users/4524921");
        } else if (section === "mappools") {
          await page.getByRole("tab", { name: "ACE", exact: true }).click();
          await expect(page.locator(".archive-map-item")).toHaveCount(1);
          await expect(page.locator(".map-slot-badge")).toHaveText("ACE1");
        } else {
          await page
            .getByRole("button", { name: "Knockout", exact: true })
            .click();
          await expect(page.locator(".match-card")).toHaveCount(10);
          await page
            .locator(".archive-competition > .event-tabs button")
            .first()
            .click();
          await page.getByRole("button", { name: "A", exact: true }).click();
          await expect(page.locator(".match-card")).toHaveCount(6);
          await expect(
            page.locator(".match-note").filter({ hasText: /^Forfeit$/ }),
          ).toContainText("Forfeit");
        }
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(isMobile ? 390 : 1440);
        if (section === "schedule")
          await page
            .locator(".event-matches tr[data-forfeit]")
            .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath(`${theme}-${section}.png`),
        });
      }
    }
  });
});
