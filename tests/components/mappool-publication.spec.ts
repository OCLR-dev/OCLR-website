import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**/replays", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/osu-images/{cover,list}/*", (route) => route.abort());
});

test("publishes and unpublishes only after confirmation using the refreshed version", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools",
    async (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      await page.evaluate(
        (published) =>
          window.dispatchEvent(
            new CustomEvent("synthetic-pool-publication", {
              detail: { published },
            }),
          ),
        body.published,
      );
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/mappool-actions");
  const heading = page.locator(".mappool-pool-heading");
  const control = heading.getByRole("switch", {
    name: "Publish pool",
    exact: true,
  });
  await expect(control).not.toBeChecked();
  await expect(heading.getByRole("link")).toHaveCount(0);
  await control.focus();
  await page.keyboard.press("Space");
  const publishDialog = page.getByRole("dialog", {
    name: "Publish pool",
    exact: true,
  });
  await expect(publishDialog).toBeVisible();
  await expect(control).not.toBeChecked();
  expect(writes).toHaveLength(0);
  await publishDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(control).not.toBeChecked();
  await expect(control).toBeFocused();
  await control.click();
  await publishDialog
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(control).toBeChecked();
  await expect(heading.locator(".badge")).toHaveText("Published");
  await expect(heading.getByRole("link")).toHaveCount(0);
  await heading.getByText("Publish pool", { exact: true }).click();
  const unpublishDialog = page.getByRole("dialog", {
    name: "Unpublish pool",
    exact: true,
  });
  await expect(unpublishDialog).toBeVisible();
  await expect(control).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(unpublishDialog).not.toBeVisible();
  expect(writes).toHaveLength(1);
  await control.click();
  await unpublishDialog
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(control).not.toBeChecked();
  await expect(heading.locator(".badge")).toHaveText("Draft");
  expect(writes).toEqual([
    {
      action: "pool_publish",
      poolId: "pool",
      expectedVersion: 7,
      published: true,
      confirmed: true,
    },
    {
      action: "pool_publish",
      poolId: "pool",
      expectedVersion: 8,
      published: false,
      confirmed: true,
    },
  ]);
});

test("keeps the saved state after failure and disables duplicate writes while retrying", async ({
  page,
}) => {
  const writes: unknown[] = [];
  let finish!: () => Promise<void>;
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools",
    async (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) {
        await route.fulfill({
          status: 409,
          json: { error: "The action could not be completed." },
        });
      } else {
        finish = async () => {
          await page.evaluate(() =>
            window.dispatchEvent(
              new CustomEvent("synthetic-pool-publication", {
                detail: { published: true },
              }),
            ),
          );
          await route.fulfill({ json: {} });
        };
        started();
      }
    },
  );
  await page.goto("/mappool-actions");
  const control = page.getByRole("switch", {
    name: "Publish pool",
    exact: true,
  });
  await control.click();
  const dialog = page.getByRole("dialog", {
    name: "Publish pool",
    exact: true,
  });
  const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
  await confirm.click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "The action could not be completed.",
  );
  await expect(control).not.toBeChecked();
  await confirm.click();
  await requestStarted;
  await expect(control).toBeDisabled();
  await expect(confirm).toBeDisabled();
  await expect(control).not.toBeChecked();
  await finish();
  await expect(dialog).not.toBeVisible();
  await expect(control).toBeChecked();
  await expect(control).toBeEnabled();
  expect(writes).toEqual(
    Array.from({ length: 2 }, () => ({
      action: "pool_publish",
      poolId: "pool",
      expectedVersion: 7,
      published: true,
      confirmed: true,
    })),
  );
});

test("preserves read-only and completed-fixture controls", async ({ page }) => {
  await page.goto("/mappool-actions?readonly&published");
  const heading = page.locator(".mappool-pool-heading");
  const control = heading.getByRole("switch", {
    name: "Publish pool",
    exact: true,
  });
  await expect(control).toBeChecked();
  await expect(control).toBeDisabled();
  await expect(heading.getByRole("link")).toHaveCount(0);
  await page.goto("/mappool-actions?completed&published");
  await expect(heading.getByRole("switch")).toHaveCount(0);
  await expect(heading.getByRole("link")).toHaveCount(0);
  await expect(
    page.getByText(/referenced by a completed fixture/),
  ).toBeVisible();
  await page.goto("/mappool-actions?locked&published");
  await expect(control).toBeChecked();
  await expect(control).toBeEnabled();
});

test("published switch fits three locales and both themes", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });

  const locale = "en";

  const theme = "light";

  await page.goto(`/mappool-actions?published&locale=${locale}&theme=${theme}`);
  const heading = page.locator(".mappool-pool-heading");
  const control = heading.getByRole("switch");
  await expect(control).toBeChecked();
  await expect(control).toHaveAccessibleName(/\S/);
  await expect(heading.getByRole("link")).toHaveCount(0);
  const bounds = await control.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(
    await heading.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
});

test("keeps Showcase access separate from publication and targets one Streamer", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/mappool-actions?showcase&locked&showcase-grant");
  const heading = page.locator(".mappool-pool-heading");
  await expect(
    heading.getByRole("switch", { name: "Publish pool" }),
  ).not.toBeChecked();
  await expect(
    heading.getByRole("switch", { name: "Lock map selection" }),
  ).toBeChecked();
  const summary = page
    .locator("summary")
    .filter({ hasText: "Showcase access" });
  await expect(summary).toHaveText(/Showcase access\s*1/);
  await summary.focus();
  await page.keyboard.press("Enter");
  const panel = page.locator("details").filter({ has: summary });
  const row = panel
    .getByRole("listitem")
    .filter({ hasText: "Existing Streamer" });
  await expect(
    row.getByRole("button", { name: "Withdraw Showcase access" }),
  ).toBeVisible();
  const grant = panel.getByRole("button", { name: "Allow Showcase access" });
  const streamer = panel.getByRole("combobox", {
    name: "Streamer",
    exact: true,
  });
  await expect(grant).toBeDisabled();
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await streamer.selectOption("1100");
  await grant.click();
  const confirm = page.getByRole("dialog", { name: "Allow Showcase access" });
  await expect(
    confirm.getByText("Synthetic Streamer", { exact: true }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(confirm).not.toBeVisible();
  expect(writes).toEqual([
    {
      action: "pool_showcase",
      poolId: "pool",
      expectedVersion: 7,
      userId: 1100,
      enabled: true,
      confirmed: true,
    },
  ]);
});
