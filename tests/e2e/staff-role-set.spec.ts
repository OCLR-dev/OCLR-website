import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedSession } from "./session";
import { closeDb } from "../../src/db";
test.describe("staff multi-role editing (#260)", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("grants multiple roles and edits the existing user without duplicate staff cards", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(90000);
    const admin = isMobile ? 70001 : 60001;
    const target = isMobile ? 897002 : 897001;
    await seedSession(target);
    await context.addCookies([await seedSession(admin)]);
    await page.goto("/admin/staff?edition=test-cup");
    await page.getByLabel("Verified osu! user ID").fill(String(target));
    await page
      .locator(".staff-readonly-fields")
      .filter({ has: page.getByLabel("Verified osu! user ID") })
      .getByRole("checkbox", { name: "Referee", exact: true })
      .check();
    await page.getByRole("button", { name: "Review role grant" }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    const group = page.locator(".staff-role-group").filter({
      has: page.getByRole("heading", {
        name: `Synthetic Player ${target} · ${target}`,
        exact: true,
      }),
    });
    await expect(group).toHaveCount(1);
    await expect(group.locator(".staff-role-editor")).not.toHaveAttribute(
      "open",
      "",
    );
    await group.locator(".staff-role-editor > summary").click();
    await expect(
      group.getByRole("button", { name: "Save roles", exact: true }),
    ).toBeVisible();
    await expect(
      group.getByRole("checkbox", { name: "Mappooler", exact: true }),
    ).toBeChecked();
    await expect(
      group.getByRole("checkbox", { name: "Referee", exact: true }),
    ).toBeChecked();
    await group
      .getByRole("checkbox", { name: "Referee", exact: true })
      .uncheck();
    await group.getByRole("checkbox", { name: "Tester", exact: true }).check();
    await group
      .getByRole("button", { name: "Save roles", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(group.locator(".staff-saved-roles")).toContainText("Tester");
    await page.reload();
    await group.locator(".staff-role-editor > summary").click();
    await expect(
      group.getByRole("button", { name: "Save roles", exact: true }),
    ).toBeVisible();
    await expect(
      group.getByRole("checkbox", { name: "Mappooler", exact: true }),
    ).toBeChecked();
    await expect(
      group.getByRole("checkbox", { name: "Tester", exact: true }),
    ).toBeChecked();
    await expect(
      group.getByRole("checkbox", { name: "Referee", exact: true }),
    ).not.toBeChecked();
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
        await page.reload();
        await group.locator(".staff-role-editor > summary").click();
        await expect(
          group.getByRole("button", { name: "Save roles", exact: true }),
        ).toBeVisible();
        await expect(
          group.getByRole("checkbox", { name: "Tester", exact: true }),
        ).toBeChecked();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`staff-${appearance}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  });
});
