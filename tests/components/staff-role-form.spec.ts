import { expect, test } from "@playwright/test";

const actions = [
  {
    name: "hide",
    index: 0,
    confirmation: false,
    payload: {
      action: "visibility",
      published: false,
      expectedPublished: true,
    },
  },
  {
    name: "show",
    index: 0,
    confirmation: true,
    payload: {
      action: "visibility",
      published: true,
      expectedPublished: false,
    },
  },
  {
    name: "revoke",
    index: 1,
    confirmation: true,
    payload: { action: "revoke" },
  },
] as const;

for (const theme of ["light", "dark"]) {
  for (const action of actions) {
    test(`staff ${action.name} keeps loading inside its button (${theme})`, async ({
      page,
      isMobile,
    }, info) => {
      if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const writes: Record<string, unknown>[] = [];
      await page.route("**/api/admin/staff", async (route) => {
        writes.push(route.request().postDataJSON());
        await gate;
        await route.fulfill({ json: { ok: true } });
      });
      await page.goto(
        `/staff-role-form?actions&theme=${theme}${action.name === "show" ? "&private" : ""}`,
      );
      const buttons = page.locator(".staff-role-actions > button");
      const trigger = buttons.nth(action.index);
      const sibling = buttons.nth(1 - action.index);
      const name = await trigger.innerText();
      await trigger.click();
      const dialog = page.getByRole("dialog");
      if (action.confirmation) {
        await expect(dialog).toBeVisible();
        await dialog.locator("button").first().click();
        await expect(
          dialog.locator("[data-loading-region-overlay]"),
        ).toBeVisible();
        await expect(dialog.locator("button").last()).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeVisible();
      }
      await expect(trigger).toBeDisabled();
      await expect(trigger).toHaveAttribute("aria-busy", "true");
      await expect(trigger.locator("[data-spinner]")).toBeVisible();
      await expect(
        page.locator(".staff-role-actions > [data-loading-region-overlay]"),
      ).toHaveCount(0);
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0]).toMatchObject({
        ...action.payload,
        grantId: "synthetic-grant",
        confirmed: true,
      });
      release();
      await expect(dialog).not.toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-refreshes", "1");
      await expect(trigger).toBeDisabled();
      await expect(trigger).toHaveAttribute("aria-busy", "true");
      const spinner = trigger.locator("[data-spinner]");
      await expect(spinner).toHaveCSS("opacity", "1");
      await expect(trigger.locator(":scope > span")).toHaveCSS(
        "column-gap",
        "8px",
      );
      await expect(trigger).toContainText(name);
      await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(
        0,
      );
      await expect(sibling).toBeEnabled();
      await sibling.focus();
      await expect(sibling).toBeFocused();
      await expect(page.locator(".staff-role-actions [inert]")).toHaveCount(0);
      if (isMobile) {
        const details = await page
          .locator(".staff-role-row-info")
          .boundingBox();
        const controls = await page
          .locator(".staff-role-actions")
          .boundingBox();
        expect(controls!.y).toBeGreaterThanOrEqual(
          details!.y + details!.height,
        );
      }
      const size = await spinner.evaluate((element) => ({
        width: (element as HTMLElement).offsetWidth,
        height: (element as HTMLElement).offsetHeight,
      }));
      expect(size.width).toBeLessThanOrEqual(24);
      expect(size.height).toBeLessThanOrEqual(24);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (action.name === "hide")
        await page.locator(".staff-card").screenshot({
          path: info.outputPath(`staff-actions-${theme}.png`),
        });
      await page.evaluate(() =>
        window.dispatchEvent(new Event("finish-refresh")),
      );
      await expect(trigger).toHaveAttribute("aria-busy", "false");
      await expect(trigger).toBeEnabled();
      await expect(spinner).toHaveCount(0);
      expect(writes).toHaveLength(1);
    });
  }
}

for (const failure of ["http", "network"] as const) {
  test(`staff visibility recovers from a ${failure} failure and can retry`, async ({
    page,
  }) => {
    let writes = 0;
    await page.route("**/api/admin/staff", async (route) => {
      writes++;
      if (writes > 1) await route.fulfill({ json: { ok: true } });
      else if (failure === "network") await route.abort("failed");
      else
        await route.fulfill({
          status: 409,
          json: { error: "The action could not be completed." },
        });
    });
    await page.goto("/staff-role-form?actions");
    const trigger = page.locator(".staff-role-actions > button").first();
    await trigger.click();
    await expect(page.getByRole("alert")).toBeVisible();
    if (failure === "http") {
      await expect(page.locator("html")).toHaveAttribute("data-refreshes", "1");
      await page.evaluate(() =>
        window.dispatchEvent(new Event("finish-refresh")),
      );
    }
    await expect(trigger).toBeEnabled();
    await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(0);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute(
      "data-refreshes",
      failure === "http" ? "2" : "1",
    );
    await page.evaluate(() =>
      window.dispatchEvent(new Event("finish-refresh")),
    );
    await expect(trigger).toBeEnabled();
    expect(writes).toBe(2);
  });
}

test("read-only staff actions stay disabled", async ({ page }) => {
  await page.goto("/staff-role-form?actions&readonly");
  const buttons = page.locator(".staff-role-actions > button");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toBeDisabled();
  await expect(buttons.nth(1)).toBeDisabled();
});

for (const theme of ["light", "dark"]) {
  test(`staff save uses a compact button indicator through the refresh (${theme})`, async ({
    page,
  }, info) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    await page.route("**/api/admin/staff", async (route) => {
      writes++;
      await gate;
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/staff-role-form?theme=${theme}`);
    await page.getByRole("checkbox", { name: "裁判", exact: true }).check();
    const save = page.locator(".staff-role-save");
    await save.click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("button").first().click();
    await expect(dialog.locator("[data-loading-region-overlay]")).toBeVisible();
    await expect(dialog.locator("button").first()).toBeDisabled();
    await expect.poll(() => writes).toBe(1);
    release();
    await expect(dialog).not.toBeVisible();
    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect(save).toBeDisabled();
    const spinner = save.locator("[data-spinner]");
    await expect(spinner).toBeVisible();
    await expect(spinner).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(0);
    // A rotating square has changing visual bounds; measure its layout size.
    const spinnerSize = await spinner.evaluate((element) => ({
      width: (element as HTMLElement).offsetWidth,
      height: (element as HTMLElement).offsetHeight,
    }));
    expect(spinnerSize.width).toBeLessThanOrEqual(24);
    expect(spinnerSize.height).toBeLessThanOrEqual(24);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`staff-save-${theme}.png`) });
    await page.evaluate(() =>
      window.dispatchEvent(new Event("finish-refresh")),
    );
    await expect(save).toHaveAttribute("aria-busy", "false");
    await expect(spinner).toHaveCount(0);
    await expect(page.locator(".staff-role-success")).toBeVisible();
    expect(writes).toBe(1);
    await page.getByRole("checkbox", { name: "裁判", exact: true }).uncheck();
    // The synthetic refresh retains the initial saved roles: select a new edit.
    await page.getByRole("checkbox", { name: "設計師", exact: true }).check();
    await expect(save).toBeEnabled();
  });
}

test("a failed save releases the dialog indicator and allows retry", async ({
  page,
}) => {
  await page.route("**/api/admin/staff", (route) =>
    route.fulfill({
      status: 400,
      json: { error: "Confirm a valid role change." },
    }),
  );
  await page.goto("/staff-role-form");
  await page.getByRole("checkbox", { name: "裁判", exact: true }).check();
  await page.locator(".staff-role-save").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("button").first().click();
  // Error refreshes remain inside the dialog until the refreshed data commits.
  await expect(dialog.locator("[role='alert']")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("finish-refresh")));
  await expect(dialog.locator("[data-loading-region-overlay]")).toHaveCount(0);
  await expect(dialog.locator("button").first()).toBeEnabled();
  await dialog.locator("button").last().click();
  await expect(page.locator(".staff-role-form > [role='alert']")).toBeVisible();
  await expect(page.locator(".staff-role-save")).toBeEnabled();
  await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(0);
});
