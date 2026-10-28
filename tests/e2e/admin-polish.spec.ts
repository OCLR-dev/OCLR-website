import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  staffRoles,
  mappoolEntries,
  mappools,
} from "../../src/db/schema";
import { seedSession } from "./session";
import { seedPublicPolish, landscapeFixture } from "../fixtures/public-polish";
import { changeStaffRole } from "../../src/lib/staff-roles";
const prefs = async (
  context: import("@playwright/test").BrowserContext,
  locale: string,
  theme = "light",
) =>
  context.addCookies([
    { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
    { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
  ]);
const noOverflow = async (page: import("@playwright/test").Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
test.describe("operational UI follow-ups", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(180000);
  test.beforeEach(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  });
  test.afterAll(closeDb);
  test("keeps map title actions transparent in every interaction state and preserves mod names", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const admin = isMobile ? 70001 : 60001;
    const cookie = await seedSession(admin);
    const seed = await seedPublicPolish(
      admin,
      isMobile ? 984002 : 984001,
      isMobile ? 983100 : 983000,
    );
    const [map] = await db()
      .select()
      .from(mappoolEntries)
      .where(
        and(
          eq(mappoolEntries.poolId, seed.poolId!),
          eq(mappoolEntries.category, "NM"),
          eq(mappoolEntries.position, 1),
        ),
      );
    await db()
      .update(mappoolEntries)
      .set({ metadata: { ...map.metadata, title: "Gunjou Infinity" } })
      .where(eq(mappoolEntries.id, map.id));
    await context.route("https://assets.ppy.sh/**", (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: landscapeFixture }),
    );
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await prefs(context, locale, theme);
        await page.goto(`/tournaments/test-cup/mappools/${seed.poolId}`);
        const title = page
          .locator(".map-open-button")
          .filter({ hasText: "Gunjou Infinity" });
        for (const width of isMobile ? [320, 390] : [768, 1440]) {
          await page.setViewportSize({ width, height: 950 });
          await expect(title).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          await title.blur();
          const before = (await title.boundingBox())!;
          await title.hover();
          await expect(title).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          await expect(title).toHaveCSS("background-image", "none");
          await expect(title).toHaveCSS("text-decoration-line", "underline");
          expect((await title.boundingBox())!.height).toBeCloseTo(
            before.height,
            1,
          );
          await title.locator("xpath=ancestor::article").screenshot({
            path: info.outputPath(
              `map-title-hover-${locale}-${theme}-${width}.png`,
            ),
            animations: "disabled",
          });
          await title.focus();
          await page.keyboard.press("Tab");
          await page.keyboard.press("Shift+Tab");
          await expect(title).toBeFocused();
          await expect(title).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          await title.locator("xpath=ancestor::article").screenshot({
            path: info.outputPath(
              `map-title-focus-${locale}-${theme}-${width}.png`,
            ),
            animations: "disabled",
          });
          expect(
            (
              await new AxeBuilder({ page })
                .include(".map-browse-card")
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
          await title.press("Enter");
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await expect(title).toBeFocused();
          await title.press(" ");
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
          if (isMobile) {
            await title.tap();
            await expect(page.getByRole("dialog")).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).toHaveCount(0);
          }
          await noOverflow(page);
        }
        for (const slot of ["NM", "HD", "DT", "HR", "TB"])
          await expect(
            page
              .locator(".map-slot-badge")
              .filter({ hasText: new RegExp(`^${slot}\\d*$`) })
              .first(),
          ).toBeVisible();
        expect(await page.locator("main").innerText()).not.toMatch(
          /无模组|無模組|自由模组|自由模組|强制模组|強制模組/,
        );
        await page
          .getByRole("button", {
            name:
              locale === "en"
                ? "Compact table"
                : locale === "zh-Hans"
                  ? "紧凑表格"
                  : "緊湊表格",
            exact: true,
          })
          .click();
        await expect(page.locator(".mappool-sheet tbody tr")).toHaveCount(18);
      }
    await db().insert(mappools).values({
      editionSlug: "test-cup",
      roundId: seed.context.fixture.roundId,
      name: "Terminology draft pool",
      fmMode: "free_mod",
      fmRestrictions: "Synthetic approved FM policy",
    });
    await context.addCookies([cookie]);
    for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
      await prefs(context, locale);
      await page.goto("/admin/tournaments/test-cup/mappools");
      await page
        .getByRole("button", { name: /Terminology draft pool/ })
        .click();
      await page.locator(".mappool-add-map > button:visible").click();
      const names = await page
        .locator(".mappool-task select option")
        .allTextContents();
      for (const label of [
        "NM — No Mod",
        "HD — Hidden",
        "DT — Double Time",
        "HR — Hard Rock",
        "FM — FM",
        "TB — Tie Breaker",
      ])
        expect(names).toContain(label);
      await page.locator('[role="tab"][id$="-settings"]').click();
      const policy = page.locator(".mappool-settings select");
      expect(await policy.locator("option").allTextContents()).toEqual(
        expect.arrayContaining(["Free Mod", "Force Mod"]),
      );
      await page.screenshot({
        path: info.outputPath(`admin-mod-terms-${locale}.png`),
        fullPage: true,
      });
      await page.locator('[role="tab"][id$="-import"]').click();
      await expect(page.locator(".mappool-task")).not.toContainText(
        /自由模组|自由模組|强制模组|強制模組/,
      );
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
  test("aligns staff actions and exposes settings without disclosures while preserving unsaved tabs", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const admin = isMobile ? 70001 : 60001,
      target = isMobile ? 989002 : 989001;
    await context.addCookies([await seedSession(admin)]);
    await db()
      .insert(users)
      .values({ osuId: target, username: "Synthetic Staff Layout" });
    process.env.ADMIN_OSU_IDS = String(admin);
    for (const role of ["mappooler", "referee"] as const)
      await changeStaffRole(
        { osuId: admin, username: "Synthetic Admin" },
        {
          action: "grant",
          userId: target,
          role,
          editionSlug: "test-cup",
          confirmed: true,
        },
      );
    for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
      await prefs(context, locale);
      await page.goto("/admin/staff");
      for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const rows = page.locator(".staff-role-actions");
        await expect(rows).toHaveCount(2);
        for (const row of await rows.all()) {
          const buttons = await row.locator(":scope > button").all();
          expect(buttons).toHaveLength(2);
          const a = (await buttons[0].boundingBox())!,
            b = (await buttons[1].boundingBox())!;
          expect(a.height).toBe(44);
          expect(b.height).toBe(44);
          if (a.y !== b.y) expect(b.y - a.y).toBeGreaterThanOrEqual(44);
        }
        await noOverflow(page);
        await page.screenshot({
          path: info.outputPath(`staff-actions-${locale}-${width}.png`),
          fullPage: true,
        });
      }
      for (const section of ["general", "registration", "rules"]) {
        await page.goto(
          `/admin/tournaments/test-cup/settings?section=${section}`,
        );
        await expect(page.locator(".tournament-settings details")).toHaveCount(
          0,
        );
        await expect(
          page.locator('[role="tabpanel"] .settings-card:visible').first(),
        ).toBeVisible();
        for (const width of isMobile ? [320, 390] : [768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await noOverflow(page);
          const toolbar = (await page
            .locator(".settings-save:visible")
            .boundingBox())!;
          for (const field of await page
            .locator(
              ".tournament-settings input:visible, .tournament-settings select:visible, .tournament-settings textarea:visible",
            )
            .all()) {
            const box = (await field.boundingBox())!;
            expect(box.y + box.height).toBeLessThanOrEqual(toolbar.y);
          }
          await page.screenshot({
            path: info.outputPath(`settings-${section}-${locale}-${width}.png`),
            fullPage: true,
          });
        }
      }
    }
    await prefs(context, "en");
    await page.goto("/admin/tournaments/test-cup/settings");
    await page
      .getByLabel("Season identifier (optional)")
      .fill("Unsaved test season");
    await page.getByRole("tab", { name: "Registration", exact: true }).click();
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await expect(page.getByLabel("Season identifier (optional)")).toHaveValue(
      "Unsaved test season",
    );
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save general settings", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("saved");
    await page.reload();
    await expect(page.getByLabel("Season identifier (optional)")).toHaveValue(
      "Unsaved test season",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto("/admin/staff");
    await page
      .locator(".staff-role-actions")
      .first()
      .getByRole("button", { name: "Revoke role", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.locator(".staff-role-actions")).toHaveCount(1);
    expect(
      (await db().select().from(staffRoles)).filter((x) => x.revokedAt),
    ).toHaveLength(1);
  });
});
