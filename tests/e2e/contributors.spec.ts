import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import { updateContributors } from "../../src/lib/contributors";
import { publicAppearances as appearances } from "../../src/lib/preferences";
import { assertTestDatabase } from "../database";
import { seedSession } from "./session";

test.describe("compact contributor management (#359)", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async ({ context, isMobile }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE contributor_directory, contributor_events, users CASCADE`,
    );
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    // Service calls in the test worker use a real synthetic grant as well as
    // the server's configured fixture Admin, without relying on shell env.
    await db()
      .insert(staffRoles)
      .values({
        userId: isMobile ? 70001 : 60001,
        role: "admin",
        editionSlug: null,
        grantedBy: isMobile ? 70001 : 60001,
      });
    await context.route("https://a.ppy.sh/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="#777"/></svg>',
      }),
    );
  });
  test.afterAll(closeDb);

  test("adds, edits, reorders and explicitly saves, retaining validation and failure feedback", async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    await page.goto("/admin/contributors");
    const form = page.locator(".contributor-manager");
    const rows = form.locator(".contributor-row");
    const save = form.getByRole("button", {
      name: "Save contributors",
      exact: true,
    });
    await expect(
      form.getByText("No contributors", { exact: true }),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    await form.getByRole("button", { name: "Add contributor" }).click();
    await rows
      .first()
      .getByLabel("Display name")
      .fill("Synthetic Public Contributor");
    await rows.first().getByLabel("osu! user ID").fill("0");
    await save.click();
    expect(
      await rows
        .first()
        .getByLabel("osu! user ID")
        .evaluate((input: HTMLInputElement) => input.validity.patternMismatch),
    ).toBe(true);
    await rows.first().getByLabel("osu! user ID").fill("359001");
    await rows.first().getByLabel("Show on About").check();
    await form.getByRole("button", { name: "Add contributor" }).click();
    await rows
      .nth(1)
      .getByLabel("Display name")
      .fill("Synthetic Hidden Contributor");
    await rows.nth(1).getByLabel("osu! user ID").fill("359002");
    await expect(
      form.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    await expect(
      rows.first().getByRole("button", { name: "Move contributor 1 up" }),
    ).toBeDisabled();
    await expect(
      rows.last().getByRole("button", { name: "Move contributor 2 down" }),
    ).toBeDisabled();
    await rows
      .nth(1)
      .getByRole("button", { name: "Move contributor 2 up" })
      .focus();
    await page.keyboard.press("Enter");
    await expect(rows.first().getByLabel("Display name")).toHaveValue(
      "Synthetic Hidden Contributor",
    );
    await save.click();
    await expect(form.getByRole("status")).toHaveText("Contributors saved.");
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(rows.first().getByLabel("Display name")).toHaveValue(
      "Synthetic Hidden Contributor",
    );
    await expect(rows.last().getByLabel("Show on About")).toBeChecked();

    // Duplicate identities are still rejected by the existing server contract.
    await rows.first().getByLabel("osu! user ID").fill("359001");
    await save.click();
    await expect(form.getByRole("alert")).toContainText(
      "Check contributor names, unique osu! IDs and revision.",
    );
    await rows
      .first()
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await rows
      .first()
      .getByLabel("Display name")
      .fill("Synthetic Updated Public Contributor");

    // A slow request disables every mutation; a failed request retains the draft.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await context.route("**/api/admin/contributors", async (route) => {
      await held;
      await route.abort();
    });
    const request = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/admin/contributors") &&
        request.method() === "PATCH",
    );
    await save.click();
    await request;
    await expect(form).toHaveAttribute("aria-busy", "true");
    await expect(form.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(rows.first().getByLabel("Display name")).toBeDisabled();
    release();
    await expect(form.getByRole("alert")).toContainText(
      "This request could not be completed. Please try again.",
    );
    await expect(rows.first().getByLabel("Display name")).toHaveValue(
      "Synthetic Updated Public Contributor",
    );
    await context.unroute("**/api/admin/contributors");
    await save.click();
    await expect(form.getByRole("status")).toHaveText("Contributors saved.");
    await page.goto("/about");
    await expect(
      page.locator("#contributors").getByRole("link", {
        name: "Synthetic Updated Public Contributor",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("#contributors")).not.toContainText(
      "Synthetic Hidden Contributor",
    );

    // A second tab cannot silently overwrite a newer saved revision.
    await page.goto("/admin/contributors");
    const other = await context.newPage();
    await other.goto("/admin/contributors");
    await other.getByLabel("Display name").fill("Synthetic Newer Revision");
    await other
      .getByRole("button", { name: "Save contributors", exact: true })
      .click();
    await expect(other.getByRole("status")).toHaveText("Contributors saved.");
    await other.close();
    await rows.first().getByLabel("Display name").fill("Synthetic Stale Draft");
    await save.click();
    await expect(form.getByRole("alert")).toContainText(
      "Contributors changed. Refresh before saving.",
    );
    await form.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(rows.first().getByLabel("Display name")).toHaveValue(
      "Synthetic Newer Revision",
    );
  });

  test("keeps long-name rows readable in three locales, both themes and every registered appearance", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(300000);
    const actor = {
      osuId: isMobile ? 70001 : 60001,
      username: "Synthetic Admin",
    };
    await updateContributors(actor, {
      expectedRevision: 0,
      entries: Array.from({ length: 4 }, (_, index) => ({
        id: `35900000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name:
          index === 0
            ? "LongUnbrokenSyntheticContributorName".repeat(2)
            : `Synthetic Contributor ${index + 1}`,
        osuId: 359101 + index,
        published: index % 2 === 0,
      })),
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const appearance of appearances) {
      for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-locale",
              value: locale,
              url: "http://127.0.0.1:3100",
            },
            { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
            {
              name: "oclr-appearance",
              value: appearance,
              url: "http://127.0.0.1:3100",
            },
          ]);
          await page.goto("/admin/contributors");
          await expect(page.locator("html")).toHaveAttribute(
            "data-appearance",
            appearance,
          );
          await expect(page.locator(".contributor-row")).toHaveCount(4);
          for (const width of isMobile ? [320, 390] : [768, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            const geometry = await page
              .locator(".contributors-workspace")
              .evaluate((workspace) => {
                const bounds = workspace.getBoundingClientRect();
                const controls = [
                  ...workspace.querySelectorAll(
                    "input:not([type=checkbox]),button,.contributor-public",
                  ),
                ].map((control) => control.getBoundingClientRect());
                return {
                  overflow:
                    workspace.scrollWidth > workspace.clientWidth ||
                    document.documentElement.scrollWidth > innerWidth,
                  inside: controls.every(
                    (rect) =>
                      rect.left >= bounds.left - 1 &&
                      rect.right <= bounds.right + 1,
                  ),
                  targets: controls.every(
                    (rect) => rect.height >= 44 && rect.width >= 44,
                  ),
                  avatar: workspace
                    .querySelector(".avatar")!
                    .getBoundingClientRect().width,
                };
              });
            expect(
              geometry,
              `${appearance}/${locale}/${theme}/${width}`,
            ).toEqual({
              overflow: false,
              inside: true,
              targets: true,
              avatar: 40,
            });
            if (appearance === "default" && locale === "en") {
              await page.screenshot({
                path: info.outputPath(`contributors-${theme}-${width}.png`),
                fullPage: true,
              });
            }
          }
          expect(
            (
              await new AxeBuilder({ page })
                .include(".contributors-workspace")
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
        }
      }
    }
    expect(errors).toEqual([]);
  });
});
