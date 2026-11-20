import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**/replays", (route) => route.fulfill({ json: [] }));
  await page.route("https://assets.ppy.sh/**", (route) => route.abort());
});

const locale = "en";

const theme = "light";

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
  await expect(replay).toHaveAccessibleName("Replays");
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
  await expect(entry.getByText(/BID 101$/)).toBeVisible();
  await expect(
    entry.getByText(
      /Official ruleset attributes.*aim difficulty 3\.152.*speed difficulty 2\.663/,
    ),
  ).toBeVisible();
  const trigger = entry.getByRole("button", { name: /^Upload replays/ });
  await expect(trigger).toHaveText("Upload replays");
  const before = (await entry.boundingBox())!;
  await trigger.click();
  const dialog = entry.getByRole("dialog", {
    name: "Replays for NM1",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect((await entry.boundingBox())!.height).toBe(before.height);
  await expect(dialog.getByRole("note")).toHaveCount(0);
  await expect(dialog.getByLabel("Replay file", { exact: true })).toBeEnabled();
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

test("the map opens a player dialog with controls in its frame", async ({
  page,
}) => {
  const replayList = Promise.withResolvers<void>();
  await page.route("**/entries/entry-1/replays", async (route) => {
    await replayList.promise;
    await route.fulfill({
      json: ["First", "Second"].map((player, index) => ({
        id: `replay-${index}`,
        filename: `${player}.osr`,
        summary: { mode: "osu", beatmapMd5: "a".repeat(32) },
      })),
    });
  });
  await page.goto("/mappool-actions?playback=1");
  const entry = page.locator('[data-map-entry="entry-1"]');
  const open = entry.getByRole("button", { name: "Open replay player" });
  await open.click();

  const viewer = page.getByRole("dialog", { name: "Replay player for NM1" });
  try {
    await expect(
      viewer.getByRole("heading", { name: "Replay player for NM1" }),
    ).toBeFocused();
    await expect(page.locator("dialog:modal")).toHaveCount(1);
    await expect(viewer.getByRole("status")).toHaveCount(0);
  } finally {
    replayList.resolve();
  }
  const frame = viewer.getByRole("group", {
    name: "Replay playback for First.osr",
  });
  await expect(frame.locator("canvas")).toBeVisible();
  const timeline = frame.getByRole("slider", { name: "Replay progress" });
  const volume = frame.getByRole("slider", { name: "Replay volume" });
  await expect(timeline).toBeVisible();
  await expect(timeline).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(volume).toHaveValue("70");
  await frame.getByRole("slider", { name: "Replay volume" }).press("End");
  await expect(
    frame.getByRole("slider", { name: "Replay volume" }),
  ).toHaveValue("100");

  await viewer
    .getByRole("combobox", { name: "Replay file" })
    .selectOption("replay-1");
  await expect(
    viewer.getByRole("group", { name: "Replay playback for Second.osr" }),
  ).toBeVisible();
  await expect(frame).toHaveCount(0);
  const box = (await viewer.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await expect(viewer).toHaveCount(0);
  await open.click();
  await expect(viewer).toBeVisible();
  await viewer.getByRole("button", { name: "Close player" }).click();
  await expect(open).toBeFocused();
  await expect(viewer).toHaveCount(0);
});

test("saved mirror cache reports progress and lets staff replace or remove the package", async ({
  page,
}) => {
  const evaluationViolations: string[] = [];
  await page.exposeFunction("recordEvaluationViolation", (source: string) => {
    evaluationViolations.push(source);
  });
  await page.addInitScript(() => {
    const { recordEvaluationViolation } = window as typeof window & {
      recordEvaluationViolation: (source: string) => void;
    };
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.blockedURI === "eval")
        recordEvaluationViolation(`${event.sourceFile}:${event.lineNumber}`);
    });
  });
  const requests: string[] = [];
  const cached = {
    source: "mirror",
    size: 1024 ** 2,
    cachedAt: "2026-11-20T00:00:00.000Z",
  };
  let status: {
    version: number;
    mirrors: { id: string; name: string }[];
    package: typeof cached | null;
  } = {
    version: 7,
    mirrors: [{ id: "saved", name: "Saved mirror" }],
    package: null,
  };
  let completeSync: (() => void) | undefined;
  let statusReads = 0;
  await page.route("**/entries/*/beatmap-cache", async (route) => {
    const body = route.request().postData() ?? "";
    if (route.request().method() === "POST") {
      const operation = body.match(/name="action"\r\n\r\n(\w+)/)?.[1];
      requests.push(operation ?? "");
      if (operation === "sync")
        await new Promise<void>((resolve) => {
          completeSync = resolve;
        });
      status = {
        ...status,
        version: status.version + 1,
        package:
          operation === "remove"
            ? null
            : {
                ...cached,
                source: operation === "upload" ? "upload" : "mirror",
              },
      };
    } else statusReads++;
    await route.fulfill({ json: status });
  });
  const response = await page.goto("/mappool-actions?cache&manage&cached");
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toMatch(/script-src [^;]*'strict-dynamic'/);
  expect(policy).not.toContain("'unsafe-eval'");
  const entry = page.locator('[data-map-entry="entry-1"]');
  await expect(
    page.locator('[data-map-entry="entry-2"]').getByRole("button", {
      name: "Cached",
      exact: true,
    }),
  ).toBeVisible();
  const trigger = entry.locator(
    ".mappool-entry-action-row button[aria-controls$='-cache']",
  );
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAccessibleName("Beatmap cache");
  await entry
    .getByRole("button", { name: "Upload replays", exact: true })
    .click();
  const replays = entry.getByRole("dialog", { name: "Replays for NM1" });
  await expect(replays.getByText("No replays attached.")).toBeVisible();
  await expect(replays.getByText("Server beatmap cache")).toHaveCount(0);
  expect(statusReads).toBe(0);
  await replays.getByRole("button", { name: "Close", exact: true }).click();
  await trigger.click();
  const dialog = entry.getByRole("dialog", { name: "Server beatmap cache" });
  const sources = dialog.getByRole("combobox", { name: "Beatmap mirror" });
  await sources.selectOption({ label: "osu! official download" });
  await expect(
    dialog.getByRole("link", { name: "Download on osu!" }),
  ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/101");
  await expect(
    dialog.getByRole("button", { name: "Sync from mirror" }),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
  await sources.selectOption({ label: "Saved mirror" });
  await dialog.getByRole("button", { name: "Sync from mirror" }).click();
  await expect(dialog.getByText("Syncing beatmap package…")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect.poll(() => !!completeSync).toBe(true);
  completeSync?.();
  await expect(dialog.getByText("Cached OSZ · 1.0 MiB")).toBeVisible();
  await expect(trigger).toHaveText("Cached");
  await dialog
    .getByLabel("Beatmap package (.osz)", { exact: true })
    .setInputFiles({
      name: "synthetic.osz",
      mimeType: "application/zip",
      buffer: Buffer.from("synthetic archive"),
    });
  await dialog.getByRole("button", { name: "Upload beatmap package" }).click();
  await expect.poll(() => requests).toEqual(["sync", "upload"]);
  await dialog.getByRole("button", { name: "Remove cached package" }).click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog.getByText("No beatmap package cached.")).toBeVisible();
  await expect(trigger).toHaveText("Beatmap cache");
  expect(requests).toEqual(["sync", "upload", "remove"]);
  expect(evaluationViolations).toEqual([]);
  expect(
    await dialog.evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(
    await dialog.evaluate((element) => element.clientWidth),
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("suggester picker inherits a matching workbench candidate", async ({
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
  await page.goto("/mappool-actions?suggesters&manage");
  const entry = page.locator('[data-map-entry="entry-1"]');
  const trigger = entry.getByRole("button", { name: "Add suggester" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Add suggester" });
  const picker = dialog.getByRole("combobox", { name: "Suggester" });
  await expect(
    picker.getByRole("option", { name: "Synthetic Mappooler" }),
  ).toHaveCount(1);
  await picker.selectOption({ label: "Synthetic Candidate Author · NM" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  expect(writes).toEqual([
    {
      action: "entry_suggester_set",
      confirmed: true,
      poolId: "pool",
      expectedVersion: 7,
      entryId: "entry-1",
      suggester: {
        source: "workbench",
        candidateId: "5f994ec4-06be-48ab-a56c-5f3fbb5eca0c",
      },
    },
  ]);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("orders Mod tabs and selects or clears all saved maps", async ({
  page,
}) => {
  await page.goto("/mappool-actions");
  const tabs = page.getByRole("tablist", { name: "Mod categories" });
  await expect(tabs.getByRole("tab")).toHaveText([
    "NM (2)",
    "HD (0)",
    "HR (0)",
    "DT (0)",
    "FM (0)",
    "TB (0)",
  ]);

  await page.getByRole("tab", { name: "Batch edit" }).click();
  const table = page.getByRole("table", { name: "Saved map selection" });
  const selectAll = page.getByRole("button", {
    name: "Select all visible maps",
  });
  const clear = page.getByRole("button", { name: "Clear selection" });
  await selectAll.click();
  await expect(table.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await expect(
    page.getByText("2 maps selected", { exact: true }),
  ).toBeVisible();
  await expect(selectAll).toBeDisabled();

  await clear.click();
  await expect(table.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(
    page.getByText("0 maps selected", { exact: true }),
  ).toBeVisible();
  await expect(selectAll).toBeEnabled();
  await expect(clear).toBeDisabled();
});

test("bulk selection keeps checked maps and caps selection at 50", async ({
  page,
}) => {
  await page.goto("/mappool-actions?large-pool");
  await page.getByRole("tab", { name: "Batch edit" }).click();
  const table = page.getByRole("table", { name: "Saved map selection" });
  const first = table.getByRole("checkbox", {
    name: "Select NM1",
    exact: true,
  });
  const next = table.getByRole("checkbox", {
    name: "Select NM50",
    exact: true,
  });
  const last = table.getByRole("checkbox", {
    name: "Select NM51",
    exact: true,
  });
  await expect(page.getByText(/This pool has 51 maps/)).toBeVisible();
  await last.check();
  await page.getByRole("button", { name: "Select up to 50 maps" }).click();

  await expect(table.getByRole("checkbox", { checked: true })).toHaveCount(50);
  await expect(
    page.getByText("50 maps selected", { exact: true }),
  ).toBeVisible();
  await expect(last).toBeChecked();
  await expect(next).not.toBeChecked();
  await expect(next).toBeDisabled();

  await first.uncheck();
  await expect(next).toBeEnabled();
  await next.check();
  await expect(table.getByRole("checkbox", { checked: true })).toHaveCount(50);
  await expect(
    page.getByText("50 maps selected", { exact: true }),
  ).toBeVisible();
});
