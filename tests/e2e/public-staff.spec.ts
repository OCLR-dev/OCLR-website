import { englishStorage } from "../fixtures/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { userProfileCache } from "../../src/db/schema";
import { profileResponse } from "../fixtures/osu-profile";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedSession } from "./session";
import { changeStaffRole } from "../../src/lib/staff-roles";
test.describe("approved public About roster", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  for (const role of ["mappooler", "developer"] as const) {
    test(`Admin publishes, hides and revokes ${role}, while private grants remain hidden`, async ({
      page,
      browser,
      context,
      isMobile,
    }, info) => {
      assertTestDatabase(process.env.TEST_DATABASE_URL);
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      const adminId = isMobile ? 70001 : 60001;
      const targetId = isMobile ? 494102 : 494002;
      const adminCookie = await seedSession(adminId);
      const memberCookie = await seedSession(targetId);
      process.env.ADMIN_OSU_IDS = String(adminId);
      const actor = { osuId: adminId, username: "Synthetic Admin" };
      const map = await changeStaffRole(actor, {
        action: "grant",
        userId: targetId,
        role,
        editionSlug: role === "developer" ? null : "test-cup",
        confirmed: true,
      });
      await changeStaffRole(actor, {
        action: "grant",
        userId: targetId,
        role: "referee",
        editionSlug: "test-cup",
        confirmed: true,
      });
      await page.route("https://a.ppy.sh/**", (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#704594"/></svg>',
        }),
      );
      const admin = await browser.newContext({
        storageState: englishStorage,
        baseURL: "http://127.0.0.1:3100",
      });
      const member = await browser.newContext({
        storageState: englishStorage,
        baseURL: "http://127.0.0.1:3100",
      });
      await admin.addCookies([adminCookie]);
      await member.addCookies([memberCookie]);
      const visibility = {
        action: "visibility",
        grantId: map.id,
        published: true,
        expectedPublished: false,
        confirmed: true,
      };
      await db()
        .insert(userProfileCache)
        .values({
          osuId: targetId,
          mode: "osu",
          profile: normalizeOsuProfile(
            { ...profileResponse, id: targetId },
            targetId,
            "osu",
          ),
          attemptedAt: new Date(),
          retryAt: new Date(),
        })
        .onConflictDoNothing();
      const headers = { origin: "http://127.0.0.1:3100" };
      try {
        expect(
          (
            await context.request.post("/api/admin/staff", {
              headers,
              data: visibility,
            })
          ).status(),
        ).toBe(401);
        expect(
          (
            await member.request.post("/api/admin/staff", {
              headers,
              data: visibility,
            })
          ).status(),
        ).toBe(403);
        await page.goto("/about");
        const section = page.locator(
          role === "developer" ? "#developer" : "#pooler",
        );
        await expect(section.getByRole("heading")).toBeVisible();
        await expect(section.locator(".public-staff-list")).toHaveCount(0);
        const operator = await admin.newPage();
        await operator.goto("/admin/staff");
        const row = operator
          .locator(".staff-role-group")
          .filter({
            has: operator.getByRole("heading", {
              name: `Synthetic Player ${targetId} · ${targetId}`,
              exact: true,
            }),
          })
          .locator(".staff-role-row")
          .filter({
            has: operator.locator("strong").filter({
              hasText: role === "developer" ? /^Developer$/ : /^Mappooler$/,
            }),
          });
        await row
          .getByRole("button", { name: "Show on About", exact: true })
          .click();
        await expect(operator.getByRole("dialog")).toContainText(
          `Synthetic Player ${targetId}`,
        );
        await operator
          .getByRole("button", { name: "Confirm", exact: true })
          .click();
        await expect(operator.getByRole("dialog")).toHaveCount(0);
        await page.reload();
        await expect(
          section.getByRole("link", {
            name: `Synthetic Player ${targetId}`,
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.locator(".public-staff-list > li")).toHaveCount(1);
        await expect(
          page
            .locator(".public-staff-list")
            .getByRole("img", { name: "Taiwan flag", exact: true }),
        ).toBeVisible();
        await expect(
          page.locator(".public-staff-list .staff-role-name"),
        ).toHaveText(role);
        await expect(page.locator(".public-staff-list")).toContainText(
          role === "developer" ? "All editions" : "Synthetic test edition",
        );
        await expect(
          page.locator('.public-staff-list a[href^="/tournaments/"]'),
        ).toHaveCount(0);
        await expect(
          page.getByText(`Synthetic Player ${adminId}`, { exact: false }),
        ).toHaveCount(0);
        expect(
          (
            await (
              await context.request.get("/api/players?edition=test-cup")
            ).json()
          ).rows,
        ).toEqual([]);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
          ]);
          await page.reload();
          await expect(
            section.getByRole("link", {
              name: `Synthetic Player ${targetId}`,
              exact: true,
            }),
          ).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(page.viewportSize()!.width);
          await page.screenshot({
            path: info.outputPath(`public-staff-${role}-${theme}.png`),
            fullPage: true,
          });
        }
        await row
          .getByRole("button", { name: "Hide from About", exact: true })
          .click();
        await expect(
          row.getByRole("button", { name: "Show on About", exact: true }),
        ).toBeVisible();
        await expect(operator.getByRole("dialog")).toHaveCount(0);
        await page.reload();
        await expect(page.locator(".public-staff-list")).toHaveCount(0);
        await row
          .getByRole("button", { name: "Show on About", exact: true })
          .click();
        await operator
          .getByRole("button", { name: "Confirm", exact: true })
          .click();
        await expect(operator.getByRole("dialog")).toHaveCount(0);
        await row
          .getByRole("button", { name: "Revoke role", exact: true })
          .click();
        await operator
          .getByRole("button", { name: "Confirm", exact: true })
          .click();
        await expect(operator.getByRole("dialog")).toHaveCount(0);
        await page.reload();
        await expect(page.locator(".public-staff-list")).toHaveCount(0);
        await operator.close();
      } finally {
        await admin.close();
        await member.close();
      }
    });
  }
});
