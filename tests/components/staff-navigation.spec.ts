import { test, expect } from "@playwright/test";

test("hamburger collapses the entire sidebar and preserves working content", async ({
  page,
  isMobile,
}, info) => {
  for (const theme of ["light", "dark"]) {
    await page.goto(`/staff-navigation?theme=${theme}&readOnly=1`);
    const sidebar = page.locator("#admin-sidebar");
    const toggle = page.locator(
      `.admin-menu-toggle-${isMobile ? "mobile" : "desktop"}`,
    );
    const content = page.locator(".workspace-main");
    await expect(toggle).toHaveAttribute("aria-expanded", String(!isMobile));
    if (isMobile) await toggle.click();
    await expect(sidebar).toBeVisible();
    await expect(page.getByLabel("Selected tournament")).toBeVisible();
    await expect(toggle).toHaveAccessibleName("Close administration menu");
    const expandedWidth = (await content.boundingBox())!.width;
    const input = page.getByRole("textbox", { name: "Unsaved content" });
    await input.fill("A draft stays mounted");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(sidebar).toBeHidden();
    await expect(toggle).toHaveAccessibleName("Open administration menu");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    await expect(input).toHaveValue("A draft stays mounted");
    await expect(page.getByRole("status")).toContainText(
      "Developer access is read-only.",
    );
    if (!isMobile)
      expect((await content.boundingBox())!.width).toBeGreaterThan(
        expandedWidth + 200,
      );
    await page.screenshot({ path: info.outputPath(`${theme}-collapsed.png`) });
    // Hidden links and the selector must not stay in keyboard tab order.
    await page.keyboard.press("Tab");
    expect(await sidebar.locator(":focus").count()).toBe(0);
    await toggle.click();
    await expect(sidebar).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: info.outputPath(`${theme}-expanded.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("edition switching, navigation and Escape keep the mobile menu usable", async ({
  page,
  isMobile,
}) => {
  await page.goto("/staff-navigation");
  const sidebar = page.locator("#admin-sidebar");
  const toggle = page.locator(
    `.admin-menu-toggle-${isMobile ? "mobile" : "desktop"}`,
  );
  if (isMobile) await toggle.click();
  await page.getByLabel("Selected tournament").selectOption("test-cup");
  await expect(page.locator("[data-pathname]")).toHaveText(
    "/admin/tournaments/test-cup",
  );
  if (isMobile) {
    await expect(sidebar).toBeHidden();
    await toggle.click();
  }
  await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.locator("[data-pathname]")).toHaveText(
    "/admin/tournaments/test-cup/settings",
  );
  if (isMobile) {
    await expect(sidebar).toBeHidden();
    await toggle.click();
    await page.getByLabel("Selected tournament").focus();
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.click();
  }
  await sidebar.getByRole("link", { name: "← All tournaments" }).click();
  if (isMobile) await toggle.click();
  await expect(
    sidebar.getByRole("navigation", { name: "Administration navigation" }),
  ).toBeVisible();
  await toggle.click();
  await expect(sidebar).toBeHidden();
  await toggle.click();
  await expect(sidebar).toBeVisible();
});

test("phone and desktop defaults remain independent when resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/staff-navigation");
  const sidebar = page.locator("#admin-sidebar");
  await expect(sidebar).toBeVisible();
  await page.locator(".admin-menu-toggle-desktop").click();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(sidebar).toBeHidden();
  await page.locator(".admin-menu-toggle-mobile").click();
  await expect(sidebar).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(sidebar).toBeHidden();
  await page.locator(".admin-menu-toggle-desktop").click();
  await expect(sidebar).toBeVisible();
});

test("all locales expose the toggle and referee pages retain their full width", async ({
  page,
  isMobile,
}) => {
  for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
    await page.goto(`/staff-navigation?locale=${locale}&path=/admin`);
    const toggle = page.locator(
      `.admin-menu-toggle-${isMobile ? "mobile" : "desktop"}`,
    );
    await expect(toggle).toHaveAccessibleName(/.+/);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", String(isMobile));
  }
  await page.goto(
    "/staff-navigation?path=/admin/tournaments/s11/matches/fixture/referee",
  );
  await expect(page.locator("#admin-sidebar")).toHaveCount(0);
  await expect(page.locator(".admin-menu-toggle")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Workspace content" }),
  ).toBeVisible();
});
