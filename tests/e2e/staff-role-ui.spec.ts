import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedSession } from "./session";
import { closeDb } from "../../src/db";
import { changeStaffRoleSet, listStaffRoles } from "../../src/lib/staff-roles";
import { publicAppearances as appearances } from "../../src/lib/preferences";

test.describe("staff assignment interface (#357)", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());

  test("confirms grants and edits, reports saving/errors, and keeps scope and publication independent", async ({
    page,
    context,
    isMobile,
  }) => {
    const admin = isMobile ? 70001 : 60001;
    const target = isMobile ? 893574 : 893573;
    process.env.ADMIN_OSU_IDS = String(admin);
    const actor = { osuId: admin, username: "Synthetic Admin" };
    await seedSession(target);
    await context.addCookies([await seedSession(admin)]);
    await page.goto("/admin/staff");
    const grant = page.locator(".staff-role-form.panel");
    const review = grant.getByRole("button", { name: "Review role grant" });
    await expect(review).toBeDisabled();
    await grant.getByLabel("Verified osu! user ID").fill("9999999999999999");
    await expect(review).toBeDisabled();
    await grant.getByLabel("Verified osu! user ID").fill(String(target));
    await grant
      .getByRole("checkbox", { name: "Developer", exact: true })
      .check();
    await grant.getByLabel("Scope", { exact: true }).selectOption("test-cup");
    await expect(
      grant.getByRole("checkbox", { name: "Developer", exact: true }),
    ).toHaveCount(0);
    await grant.getByLabel("Scope", { exact: true }).selectOption("");
    await expect(
      grant.getByRole("checkbox", { name: "Developer", exact: true }),
    ).not.toBeChecked();
    const referee = grant.getByRole("checkbox", {
      name: "Referee",
      exact: true,
    });
    await referee.focus();
    await page.keyboard.press("Space");
    await expect(referee).toBeChecked();
    await review.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Global — all editions");
    await expect(dialog).toContainText("Mappooler / Referee");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    const group = page
      .locator(".staff-role-group")
      .filter({ hasText: `Synthetic Player ${target}` });
    await expect(group).toHaveCount(0);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    await page.route(
      "**/api/admin/staff",
      async (route) => {
        requests++;
        await gate;
        await route.continue();
      },
      { times: 1 },
    );
    await review.click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Saving…", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await expect.poll(() => requests).toBe(1);
    release();
    await expect(group).toHaveCount(1);
    await expect(grant.getByRole("status")).toHaveText("Roles saved.");
    const save = group.getByRole("button", { name: "Save roles", exact: true });
    await expect(save).toBeDisabled();
    await group
      .getByRole("checkbox", { name: "Referee", exact: true })
      .uncheck();
    await group.getByRole("checkbox", { name: "Tester", exact: true }).check();
    await expect(group.locator(".staff-saved-roles")).toContainText("Referee");
    await expect(group.getByRole("status")).toContainText("Unsaved changes.");
    await expect(group.locator(".staff-role-row")).toHaveCount(2);

    await page.route(
      "**/api/admin/staff",
      (route) =>
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Confirm a valid role change." }),
        }),
      { times: 1 },
    );
    await save.click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Confirm a valid role change.",
    );
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(group.getByRole("alert")).toBeVisible();
    await save.click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(group.getByRole("status")).toHaveText("Roles saved.");
    await expect(group.locator(".staff-saved-roles")).toContainText("Tester");
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(group.getByRole("status")).toHaveText("No unsaved changes.");
    await expect(
      group.getByRole("checkbox", { name: "Tester", exact: true }),
    ).toBeChecked();
    await expect(
      group.getByRole("checkbox", { name: "Referee", exact: true }),
    ).not.toBeChecked();

    const map = group
      .locator(".staff-role-row")
      .filter({ has: page.getByText("Mappooler", { exact: true }) });
    await map
      .getByRole("button", { name: "Show on About", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(map).toContainText("About: Public");
    await map
      .getByRole("button", { name: "Hide from About", exact: true })
      .click();
    await expect(map).toContainText("About: Private");
    await expect(
      group.getByRole("checkbox", { name: "Mappooler", exact: true }),
    ).toBeChecked();
    await changeStaffRoleSet(actor, {
      action: "set_roles",
      confirmed: true,
      userId: target,
      editionSlug: "test-cup",
      roles: ["streamer"],
      expectedGrantIds: [],
    });
    await group
      .getByRole("checkbox", { name: "Streamer", exact: true })
      .check();
    const { grants } = await listStaffRoles(actor);
    await changeStaffRoleSet(actor, {
      action: "set_roles",
      confirmed: true,
      userId: target,
      editionSlug: null,
      roles: ["mappooler", "referee"],
      expectedGrantIds: grants
        .filter(
          ({ grant: g }) =>
            g.userId === target && g.editionSlug === null && !g.revokedAt,
        )
        .map(({ grant: g }) => g.id),
    });
    await save.click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    const global = group.filter({
      has: page.locator(".staff-role-scope", {
        hasText: "Global — all editions",
      }),
    });
    await expect(
      global.locator(".staff-role-form > [role='alert']"),
    ).toContainText("Role assignments changed. Refresh before saving.");
    await expect(
      global.getByRole("checkbox", { name: "Referee", exact: true }),
    ).toBeChecked();
    await expect(
      global.getByRole("checkbox", { name: "Streamer", exact: true }),
    ).not.toBeChecked();
    await expect(group).toHaveCount(2);
    const ref = global
      .locator(".staff-role-row")
      .filter({ has: page.getByText("Referee", { exact: true }) });
    await ref.getByRole("button", { name: "Revoke role", exact: true }).click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(ref).toHaveCount(1);
    await ref.getByRole("button", { name: "Revoke role", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(ref).toHaveCount(0);
    await expect(
      global.getByRole("checkbox", { name: "Mappooler", exact: true }),
    ).toBeChecked();
    await expect(
      group
        .filter({
          has: page.locator(".staff-role-scope", {
            hasText: "Synthetic test edition",
          }),
        })
        .getByRole("checkbox", { name: "Streamer", exact: true }),
    ).toBeChecked();
  });

  test("keeps both forms readable across locales, brightness and every registered appearance", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(300000);
    const admin = isMobile ? 70001 : 60001;
    const target = isMobile ? 893576 : 893575;
    process.env.ADMIN_OSU_IDS = String(admin);
    await seedSession(target);
    await context.addCookies([await seedSession(admin)]);
    await changeStaffRoleSet(
      { osuId: admin, username: "Synthetic Admin" },
      {
        action: "set_roles",
        confirmed: true,
        userId: target,
        editionSlug: null,
        roles: ["mappooler", "referee", "developer", "admin"],
        expectedGrantIds: [],
      },
    );
    for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
      for (const appearance of appearances) {
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-locale",
              value: locale,
              url: "http://127.0.0.1:3100",
            },
            {
              name: "oclr-appearance",
              value: appearance,
              url: "http://127.0.0.1:3100",
            },
            { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
          ]);
          await page.goto("/admin/staff");
          const forms = page.locator(".staff-role-form.panel").or(
            page
              .locator(".staff-role-group")
              .filter({ hasText: `Synthetic Player ${target}` })
              .locator(".staff-role-form"),
          );
          await expect(forms).toHaveCount(2);
          for (const width of isMobile ? [320, 390] : [1440]) {
            await page.setViewportSize({ width, height: 1000 });
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              `${locale}/${appearance}/${theme}/${width}`,
            ).toBe(true);
            const geometry = await forms
              .locator(
                ".staff-role-option, .staff-role-save, .staff-role-option-description",
              )
              .evaluateAll((elements) =>
                elements.map((e) => ({
                  text: e.textContent,
                  height: e.getBoundingClientRect().height,
                  width: e.getBoundingClientRect().width,
                  overflow: e.scrollWidth > e.clientWidth + 1,
                  control: !e.classList.contains(
                    "staff-role-option-description",
                  ),
                })),
              );
            for (const rect of geometry) {
              expect(
                rect.overflow,
                `${locale}/${appearance}/${theme}/${width}: ${rect.text}`,
              ).toBe(false);
              if (rect.control) expect(rect.height).toBeGreaterThanOrEqual(44);
            }
          }
          if (locale === "en") {
            expect(
              (
                await new AxeBuilder({ page })
                  .include(".staff-role-form")
                  .include(".staff-role-group")
                  .withTags(["wcag2a", "wcag2aa"])
                  .analyze()
              ).violations,
            ).toEqual([]);
          }
          if (
            locale === "zh-Hant" &&
            theme === "dark" &&
            appearance === "cute-pastel"
          ) {
            await page.screenshot({
              path: info.outputPath("staff-zh-Hant-pastel-dark.png"),
              fullPage: true,
            });
          }
        }
      }
    }
  });
});
