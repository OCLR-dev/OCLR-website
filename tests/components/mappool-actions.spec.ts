import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**/replays", (route) => route.fulfill({ json: [] }));
  await page.route("https://assets.ppy.sh/**", (route) => route.abort());
});

for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
  for (const theme of ["light", "dark"]) {
    test(`four compact actions share one row (${locale}, ${theme})`, async ({
      page,
    }, info) => {
      if (info.project.name === "mobile")
        await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(`/mappool-actions?locale=${locale}&theme=${theme}`);
      const actions = page
        .locator(".mappool-entry-action-row")
        .first()
        .getByRole("button");
      await expect(actions).toHaveCount(4);
      const boxes = [];
      for (const button of await actions.all()) {
        await expect(button).toHaveAccessibleName(/\S/);
        expect(await button.getAttribute("title")).toBe(
          await button.getAttribute("aria-label"),
        );
        await expect(button.locator("svg")).toHaveCount(1);
        await expect(button).toHaveText("");
        const box = (await button.boundingBox())!;
        expect(box.width).toBe(44);
        expect(box.height).toBe(44);
        boxes.push(box);
      }
      expect(new Set(boxes.map((box) => box.y)).size).toBe(1);
      expect(boxes[3].x + boxes[3].width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      await page.screenshot({
        path: info.outputPath(`mappool-actions-${locale}-${theme}.png`),
        fullPage: true,
      });
    });
  }
}

test("icons retain editing, refresh and confirmed removal", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/mappool-actions");
  const edit = page.getByRole("button", {
    name: "Edit or replace NM1",
    exact: true,
  });
  await edit.focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("region", {
    name: "Edit or replace NM1",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toBeFocused();
  await page
    .getByRole("button", { name: "Refresh NM1 metadata", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    action: "entry_refresh",
    entryId: "entry-1",
    expectedVersion: 7,
  });
  await page.getByRole("button", { name: "Remove NM1", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Remove NM1", exact: true });
  await expect(confirm).toBeVisible();
  expect(writes).toHaveLength(1);
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(1);
  await page.getByRole("button", { name: "Remove NM1", exact: true }).click();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({
    action: "entry_remove",
    entryId: "entry-1",
    expectedVersion: 7,
    confirmed: true,
  });
});

test("sorting disables edits and leaves replays accessible", async ({
  page,
}) => {
  await page.goto("/mappool-actions");
  await page
    .getByRole("button", { name: "Edit or replace NM1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move NM1 down", exact: true })
    .click();
  const entry = page.locator('[data-map-entry="entry-1"]');
  for (const button of await entry
    .locator(".mappool-entry-actions")
    .getByRole("button")
    .all()) {
    await expect(button).toBeDisabled();
  }
  await expect(
    entry
      .getByRole("region", { name: "Edit or replace NM1", exact: true })
      .getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  const replay = entry.getByRole("button", { name: /^Replays/ });
  await expect(replay).toBeEnabled();
  await replay.click();
  await expect(
    entry.getByRole("dialog", { name: "Replays for NM1", exact: true }),
  ).toBeVisible();
  await expect(replay).toHaveAccessibleName("Replays (0)");
});

test("editing hides preview details while retaining verified save data", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  let releaseLookup!: () => void;
  const pendingLookup = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools/preview",
    async (route) => {
      await pendingLookup;
      await route.fulfill({
        json: {
          beatmapId: 101,
          fingerprint: "a".repeat(64),
          fetchedAt: "2026-01-01T00:00:00Z",
          metadata: {
            setId: 0,
            artist: "Synthetic artist",
            title: "Synthetic map 1",
            difficulty: "Extra",
            mapper: "Synthetic mapper",
            stars: 6.01,
            bpm: 185,
            duration: 295,
          },
        },
      });
    },
  );
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/mappool-actions");
  await page
    .getByRole("button", { name: "Edit or replace NM1", exact: true })
    .click();
  const editor = page.getByRole("region", {
    name: "Edit or replace NM1",
    exact: true,
  });
  const save = editor.getByRole("button", {
    name: "Save map slot",
    exact: true,
  });
  await expect(save).toBeDisabled();
  releaseLookup();
  await expect(save).toBeEnabled();
  await expect(
    editor.getByLabel("Beatmap preview", { exact: true }),
  ).toHaveCount(0);
  await expect(
    editor.getByRole("button", { name: "Refresh preview", exact: true }),
  ).toHaveCount(0);
  await save.click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    action: "entry_save",
    entryId: "entry-1",
    expectedVersion: 7,
    expectedMetadataFingerprint: "a".repeat(64),
  });
});

for (const state of ["locked", "readonly"]) {
  test(`${state} pool retains replay access without map actions`, async ({
    page,
  }) => {
    await page.goto(`/mappool-actions?${state}=1`);
    await expect(
      page.getByRole("button", { name: "Edit or replace NM1", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Replays", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "Replays for NM1", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".mappool-entry-actions")).toHaveCount(0);
  });
}

test("replay dialog keeps the map row compact and restores focus", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/mappool-actions?manage=1");
  const entry = page.locator('[data-map-entry="entry-1"]');
  const trigger = entry.getByRole("button", { name: /^Replays/ });
  const before = (await entry.boundingBox())!;
  await trigger.click();
  const dialog = entry.getByRole("dialog", {
    name: "Replays for NM1",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect((await entry.boundingBox())!.height).toBe(before.height);
  await expect(dialog.getByRole("note")).toHaveCount(0);
  await expect(
    dialog.getByLabel("Replay file", { exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("No replays attached.", { exact: true }),
  ).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height - 32);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
