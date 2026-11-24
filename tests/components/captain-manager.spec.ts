import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/osu-images/avatar/*", (route) => route.abort());
});

test("shows ten players per page and six on the final page without saving", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route("**/api/admin/**", async (route) => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({ json: {} });
  });
  await page.goto("/captain-manager");
  const pool = page.locator('section[aria-labelledby="eligible-pool-heading"]');
  const cards = pool.locator(".captain-player-card");
  const previous = pool.getByRole("button", {
    name: "← Previous",
    exact: true,
  });
  const next = pool.getByRole("button", { name: "Next →", exact: true });
  await expect(cards).toHaveCount(10);
  await expect(pool.getByRole("status")).toHaveText("Page 1 of 8");
  await expect(previous).toBeDisabled();
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(cards.first()).toHaveAttribute("data-player-id", "400000011");
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(cards.first()).toHaveAttribute("data-player-id", "400000001");
  for (let i = 1; i < 8; i++) await next.click();
  await expect(pool.getByRole("status")).toHaveText("Page 8 of 8");
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toHaveAttribute("data-player-id", "400000071");
  await expect(cards.last()).toHaveAttribute("data-player-id", "400000076");
  await expect(next).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test("searches the full pool by name or ID and resets pagination", async ({
  page,
}) => {
  await page.goto("/captain-manager");
  const pool = page.locator('section[aria-labelledby="eligible-pool-heading"]');
  const search = pool.getByRole("textbox");
  await pool.getByRole("button", { name: "Next →", exact: true }).click();
  await search.fill("SYNTHETIC PLAYER 76");
  await expect(pool.locator(".captain-player-card")).toHaveCount(1);
  await expect(pool.locator(".captain-player-card")).toHaveAttribute(
    "data-player-id",
    "400000076",
  );
  await expect(pool.getByRole("navigation")).toHaveCount(0);
  await search.fill("400000075");
  await expect(pool.locator(".captain-player-card")).toHaveAttribute(
    "data-player-id",
    "400000075",
  );
  await search.fill("missing player");
  await expect(
    pool.getByText("No players match your search.", { exact: true }),
  ).toBeVisible();
  await expect(pool.locator(".captain-player-card")).toHaveCount(0);
  await search.fill("");
  await expect(pool.getByRole("status")).toHaveText("Page 1 of 8");
  await expect(pool.locator(".captain-player-card")).toHaveCount(10);
  await expect(pool.locator(".captain-player-card").first()).toHaveAttribute(
    "data-player-id",
    "400000001",
  );
});

test("appoints the visible last player with the current version and clamps the refreshed page", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/captains",
    async (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      await page.evaluate(
        (id) =>
          window.dispatchEvent(
            new CustomEvent("synthetic-appointment", { detail: id }),
          ),
        body.command.userId,
      );
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/captain-manager?count=21");
  const pool = page.locator('section[aria-labelledby="eligible-pool-heading"]');
  const next = pool.getByRole("button", { name: "Next →", exact: true });
  await next.click();
  await next.click();
  const lastPlayer = pool.locator(".captain-player-card");
  await expect(lastPlayer).toHaveCount(1);
  await expect(lastPlayer).toHaveAttribute("draggable", "true");
  await lastPlayer
    .getByRole("button", {
      name: "Appoint Synthetic Player 21 as captain",
      exact: true,
    })
    .click();
  await expect(pool.getByRole("status")).toHaveText("Page 2 of 2");
  await expect(pool.locator(".captain-player-card")).toHaveCount(10);
  await expect(next).toBeDisabled();
  await expect(page.locator('[data-captain-id="400000021"]')).toBeVisible();
  expect(writes).toEqual([
    {
      command: { action: "appoint", userId: 400000021 },
      expectedVersion: 4,
      confirmed: true,
    },
  ]);
});

for (const mode of ["readonly", "locked"]) {
  test(`${mode} retains pagination and search without enabling appointment`, async ({
    page,
  }) => {
    await page.goto(`/captain-manager?${mode}`);
    const publication = page.locator(
      'section[aria-labelledby="captain-publication-heading"]',
    );
    await expect(publication.getByRole("switch")).toHaveCount(2);
    for (const control of await publication.getByRole("switch").all()) {
      if (mode === "readonly") await expect(control).toBeDisabled();
      else await expect(control).toBeEnabled();
    }
    const pool = page.locator(
      'section[aria-labelledby="eligible-pool-heading"]',
    );
    await pool.getByRole("button", { name: "Next →", exact: true }).click();
    await expect(pool.getByRole("status")).toHaveText("Page 2 of 8");
    await expect(pool.locator(".captain-player-card").first()).toHaveAttribute(
      "draggable",
      "false",
    );
    await expect(
      pool.getByRole("button", {
        name: "Appoint Synthetic Player 11 as captain",
        exact: true,
      }),
    ).toBeDisabled();
    await pool.getByRole("textbox").fill("400000076");
    await expect(pool.locator(".captain-player-card")).toHaveCount(1);
    await expect(pool.getByRole("navigation")).toHaveCount(0);
    await expect(
      pool.getByRole("button", {
        name: "Appoint Synthetic Player 76 as captain",
        exact: true,
      }),
    ).toBeDisabled();
  });
}

test("publication switches keep changes local until saving and confirming", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/captains",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/captain-manager?count=1&publication");
  const publication = page.locator(
    'section[aria-labelledby="captain-publication-heading"]',
  );
  const captains = publication.getByRole("switch", {
    name: "Publish captains & order",
    exact: true,
  });
  const pool = publication.getByRole("switch", {
    name: "Publish eligible draft pool",
    exact: true,
  });
  const save = publication.getByRole("button", {
    name: "Save publication settings",
    exact: true,
  });
  await expect(captains).not.toBeChecked();
  await expect(pool).toBeChecked();
  await expect(save).toBeDisabled();
  await captains.focus();
  await page.keyboard.press("Space");
  await expect(captains).toBeChecked();
  await publication
    .getByText("Publish eligible draft pool", { exact: true })
    .click();
  await expect(pool).not.toBeChecked();
  expect(writes).toHaveLength(0);
  await save.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toHaveLength(0);
  await save.click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toEqual([
    {
      command: { action: "publish", published: true, poolPublished: false },
      expectedVersion: 4,
      confirmed: true,
    },
  ]);
});

test("publication switches and pagination fit a narrow screen", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 812 });

  const locale = "en";

  const theme = "light";

  await page.goto(
    `/captain-manager?publication&locale=${locale}&theme=${theme}`,
  );
  const pool = page.locator('section[aria-labelledby="eligible-pool-heading"]');
  const navigation = pool.getByRole("navigation");
  await expect(pool.locator(".captain-player-card")).toHaveCount(10);
  await expect(navigation.getByRole("button").last()).toBeEnabled();
  await expect(navigation.getByRole("status")).toContainText("1");
  expect(
    await navigation.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const publication = page.locator(
    'section[aria-labelledby="captain-publication-heading"]',
  );
  await expect(publication.getByRole("switch")).toHaveCount(2);
  await expect(publication.getByRole("switch").first()).not.toBeChecked();
  await expect(publication.getByRole("switch").last()).toBeChecked();
  expect(
    await publication.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  for (const control of await publication.getByRole("switch").all()) {
    const bounds = await control.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
});

test("previews an appointment at the end of the list and cancels outside the board", async ({
  page,
}) => {
  await page.goto("/captain-manager?count=1&publication");
  const player = page.locator("[data-player-id]").first();
  const handle = player.locator(".captain-drag-handle");
  const zone = page.getByRole("group", { name: "Captain appointment area" });
  await handle.scrollIntoViewIfNeeded();
  await handle.hover();
  await page.mouse.down();
  await expect(player).toHaveAttribute("data-drag-source", "true");
  await zone.scrollIntoViewIfNeeded();
  const box = (await zone.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(zone).toHaveAttribute("data-placement", "end");
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(zone).not.toHaveAttribute("data-placement");
  await expect(player).not.toHaveAttribute("data-drag-source");
  await expect(zone.locator("[data-captain-id]")).toHaveCount(1);
});
