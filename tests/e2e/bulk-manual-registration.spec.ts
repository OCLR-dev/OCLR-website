import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { registrations, registrationEvents } from "../../src/db/schema";
import { seedSession } from "./session";
const headers = { origin: "http://127.0.0.1:3100" };
const api = "/api/admin/tournaments/test-cup/registrations/batch";
test.describe("bulk assisted registrations", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(180000);
  test.afterAll(closeDb);
  test.beforeEach(async ({ context, isMobile }) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await context.route("**/api/osu-images/avatar/*", (route) => route.abort());
  });
  test("previews mixed names in every locale, appearance and theme with keyboard access and responsive rows", async ({
    page,
    context,
    isMobile,
  }) => {
    const labels = {
      en: ["Add multiple registrants", "Preview players"],
      "zh-Hans": ["批量添加报名选手", "预览选手"],
      "zh-Hant": ["批次新增報名選手", "預覽選手"],
    };
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
      for (const theme of ["light", "dark"]) {
        for (const locale of ["en", "zh-Hans", "zh-Hant"] as const) {
          await context.addCookies([
            {
              name: "oclr-appearance",
              value: appearance,
              url: "http://127.0.0.1:3100",
            },
            { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
            {
              name: "oclr-locale",
              value: locale,
              url: "http://127.0.0.1:3100",
            },
          ]);
          await page.setViewportSize({
            width: isMobile ? 390 : 1440,
            height: 960,
          });
          await page.goto("/admin/tournaments/test-cup/registrations");
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          await expect(page.locator("html")).toHaveAttribute(
            "data-appearance",
            appearance,
          );
          const button = page.getByRole("button", {
            name: labels[locale][0],
            exact: true,
          });
          await button.click();
          const dialog = page.getByRole("dialog");
          await dialog
            .locator("textarea")
            .first()
            .fill(
              "name: [Test Player]\nid: 983001\nhttps://osu.ppy.sh/users/983001\nname: 12345\nname: Old Test Player\nname: " +
                "Missing long name ".repeat(12),
            );
          await dialog
            .getByRole("button", { name: labels[locale][1], exact: true })
            .click();
          await expect(dialog.locator(".manual-batch-row")).toHaveCount(6, {
            timeout: 45000,
          });
          await expect(
            dialog.locator(".manual-batch-row").nth(0),
          ).toContainText("983001");
          await expect(
            dialog.locator(".manual-batch-row").nth(3),
          ).toContainText("983002");
          await expect(
            dialog.locator(".manual-batch-row input[type=checkbox]:checked"),
          ).toHaveCount(2);
          expect(
            await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          ).toBe(true);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          expect(
            (
              await new AxeBuilder({ page })
                .include("dialog[open]")
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
          const confirmationLabel =
            locale === "en"
              ? "Confirm selected registrants"
              : locale === "zh-Hans"
                ? "确认添加所选选手"
                : "確認新增所選選手";
          const confirmation = dialog.getByRole("button", {
            name: confirmationLabel,
          });
          await confirmation.scrollIntoViewIfNeeded();
          await expect(confirmation).toBeInViewport();
          await page.keyboard.press("Escape");
          await expect(dialog).not.toBeVisible();
          await expect(button).toBeFocused();
        }
      }
    }
    expect(await db().select().from(registrations)).toEqual([]);
  });
  test("retains completed entries after a lost response, retries by ID and supports excluding and correcting rows", async ({
    page,
    context,
  }) => {
    await page.goto("/admin/tournaments/test-cup/registrations");
    await page
      .getByRole("button", { name: "Add multiple registrants", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("One player per line")
      .fill("name: [Test Player]\nname: 12345\nid: 983003\nname: missing");
    await dialog
      .getByRole("button", { name: "Preview players", exact: true })
      .click();
    await expect(dialog.locator(".manual-batch-row")).toHaveCount(4, {
      timeout: 45000,
    });
    const rows = dialog.locator(".manual-batch-row");
    await rows.nth(2).getByRole("checkbox").uncheck();
    await dialog.getByLabel("Initial status").selectOption("accepted");
    const save = dialog.getByRole("button", {
      name: "Confirm selected registrants",
    });
    await expect(save).toBeDisabled();
    await dialog
      .getByRole("checkbox", { name: /I approve acceptance/ })
      .check();
    // Forward the real request, then lose the response after its transaction commits.
    await page.route(
      `**${api}`,
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await save.click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Connection interrupted",
    );
    expect(await db().select().from(registrations)).toHaveLength(2);
    await save.click();
    await expect(dialog).toContainText("Added: 0. Skipped: 2. Failed: 0.");
    await expect(rows.nth(0)).toContainText("Skipped: existing registration");
    expect(await db().select().from(registrationEvents)).toHaveLength(2);
    await dialog
      .getByRole("button", { name: "Preview unfinished rows again" })
      .click();
    await expect(rows.nth(2).getByRole("checkbox")).toBeChecked();
    await expect(save).toBeDisabled();
    await dialog
      .getByRole("checkbox", { name: /I approve acceptance/ })
      .check();
    await save.click();
    await expect(dialog).toContainText("Added: 1. Skipped: 2. Failed: 0.");
    expect(await db().select().from(registrations)).toHaveLength(3);
    await dialog.getByLabel("One player per line").fill("id: 983004");
    await expect(dialog.locator(".manual-batch-row")).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Preview players", exact: true })
      .click();
    await expect(dialog.locator(".manual-batch-row")).toHaveCount(1);
    expect(
      await db()
        .select()
        .from(registrations)
        .where(eq(registrations.userId, 983004)),
    ).toEqual([]);
    // Oversized JSON is rejected before a provider lookup or enrollment.
    expect(
      (
        await context.request.post(`${api}/preview`, {
          headers,
          data: { text: "a".repeat(33000), inputType: "username" },
        })
      ).status(),
    ).toBe(413);
    await page.keyboard.press("Escape");
    // Existing single-player lookup retains explicit numeric-name selection.
    await page
      .getByRole("button", { name: "Add registrant", exact: true })
      .click();
    const single = page.getByRole("dialog");
    await single.getByLabel("Input type").selectOption("username");
    await single.getByLabel("Current osu! username").fill("12345");
    await single.getByRole("button", { name: "Verify player" }).click();
    await expect(single).toContainText("983002");
    await expect(
      single.getByRole("link", { name: "View existing registration" }),
    ).toHaveAttribute("href", /q=983002$/);
    await expect(
      single.getByRole("button", { name: "Add registrant", exact: true }),
    ).toBeDisabled();
  });
  test("reports a transaction failure per row and retries only unfinished players", async ({
    page,
  }) => {
    await db().execute(
      sql`CREATE FUNCTION test_browser_batch_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT user_id FROM registrations WHERE id = NEW.registration_id) = 983006 THEN RAISE EXCEPTION 'Synthetic browser failure'; END IF; RETURN NEW; END $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER test_browser_batch_audit_failure BEFORE INSERT ON registration_events FOR EACH ROW EXECUTE FUNCTION test_browser_batch_audit()`,
    );
    try {
      await page.goto("/admin/tournaments/test-cup/registrations");
      await page
        .getByRole("button", { name: "Add multiple registrants", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Unprefixed lines contain").selectOption("id");
      await dialog
        .getByLabel("One player per line")
        .fill("983005\n983006\n983007");
      await dialog
        .getByRole("button", { name: "Preview players", exact: true })
        .click();
      await expect(dialog.locator(".manual-batch-row")).toHaveCount(3);
      await expect(dialog.getByLabel("Initial status")).toHaveValue("pending");
      await dialog
        .getByRole("button", { name: "Confirm selected registrants" })
        .click();
      await expect(dialog).toContainText("Added: 2. Skipped: 0. Failed: 1.");
      await expect(dialog.locator(".manual-batch-row").nth(1)).toContainText(
        "Failed",
      );
      expect(await db().select().from(registrationEvents)).toHaveLength(2);
      await db().execute(
        sql`DROP TRIGGER test_browser_batch_audit_failure ON registration_events`,
      );
      await dialog
        .getByRole("button", { name: "Preview unfinished rows again" })
        .click();
      await expect(
        dialog.locator(".manual-batch-row input:checked"),
      ).toHaveCount(1);
      await dialog
        .getByRole("button", { name: "Confirm selected registrants" })
        .click();
      await expect(dialog).toContainText("Added: 3. Skipped: 0. Failed: 0.");
      const rows = await db().select().from(registrations);
      expect(
        rows.every(
          (r) =>
            r.status === "pending" &&
            r.source === "staff" &&
            r.rulesVersion === null &&
            r.eligibilityAcknowledged === null &&
            !Object.keys(r.answers).length,
        ),
      ).toBe(true);
      expect(await db().select().from(registrationEvents)).toHaveLength(3);
    } finally {
      await db().execute(
        sql`DROP TRIGGER IF EXISTS test_browser_batch_audit_failure ON registration_events`,
      );
      await db().execute(sql`DROP FUNCTION test_browser_batch_audit()`);
    }
  });
});
