import { test, expect } from "@playwright/test";

const replay = {
  id: "replay-1",
  filename: "synthetic.osr",
  size: 100,
  uploaderName: "Synthetic uploader",
  uploaderId: 42,
  createdAt: "2026-11-01T00:00:00Z",
  description: "",
  summary: {
    playerName: "Synthetic player",
    mode: "osu",
    mods: "NM",
    version: 20260101,
    beatmapMd5: "a".repeat(32),
    performance: {
      score: 987654,
      maxCombo: 1234,
      accuracy: 0.9825,
      grade: "S",
      fullCombo: true,
    },
  },
  verification: "matched",
};
const file = {
  name: "synthetic.osr",
  mimeType: "application/octet-stream",
  buffer: Buffer.from("synthetic mock upload"),
};

test("saved replays can set and clear the preferred replay", async ({
  page,
}) => {
  const first = { ...replay, id: "0a000000-0000-4000-8000-000000000001" };
  const second = {
    ...replay,
    id: "0a000000-0000-4000-8000-000000000002",
    filename: "Second.osr",
  };
  let preferredReplayId: string | null = null;
  let version = 7;
  await page.route("https://assets.ppy.sh/**", (route) => route.abort());
  await page.route("**/entries/entry-1/replays", (route) =>
    route.fulfill({
      json: [first, second].map((item) => ({
        ...item,
        preferred: item.id === preferredReplayId,
      })),
    }),
  );
  await page.route(`**/replays/${second.id}`, (route) => {
    const { preferred, ...confirmation } = route.request().postDataJSON();
    expect(route.request().method()).toBe("PATCH");
    expect(confirmation).toEqual({ confirmed: true, expectedVersion: version });
    preferredReplayId = preferred ? second.id : null;
    return route.fulfill({ json: { preferredReplayId, version: ++version } });
  });
  await page.goto("/mappool-actions?manage=1&playback=1");
  await page.getByRole("button", { name: "Saved replays (2)" }).click();
  const dialog = page.getByRole("dialog", { name: "Replays for NM1" });
  const row = dialog.getByRole("listitem").filter({ hasText: second.filename });
  const badge = row.getByText("Preferred replay", { exact: true });
  await row.getByRole("button", { name: "Set as preferred replay" }).click();
  await expect(badge).toBeVisible();
  await row.getByRole("button", { name: "Clear preferred replay" }).click();
  await expect(badge).toHaveCount(0);
});

test("the open player follows attachment changes from another tab and keeps a surviving selection", async ({
  context,
  page,
}) => {
  const first = { ...replay, id: "first", filename: "First.osr" };
  const second = { ...replay, id: "second", filename: "Second.osr" };
  const added = { ...replay, id: "added", filename: file.name };
  let items = [second, first];
  await context.route("https://assets.ppy.sh/**", (route) => route.abort());
  await context.route("**/entries/entry-1/replays", async (route) => {
    if (route.request().method() === "POST") {
      items = [added, ...items];
      await route.fulfill({ json: { version: 8, duplicate: false } });
    } else {
      await route.fulfill({ json: items });
    }
  });
  await context.route("**/entries/entry-1/replays/second", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    items = items.filter((item) => item.id !== second.id);
    await route.fulfill({ json: { version: 9, removed: true } });
  });
  await page.goto("/mappool-actions?manage=1&playback=1");
  const entry = page.locator('[data-map-entry="entry-1"]');
  await entry.getByRole("button", { name: "Open replay player" }).click();
  const viewer = page.getByRole("dialog", { name: "Replay player for NM1" });
  const choices = viewer.getByRole("combobox", { name: "Replay file" });
  await expect(choices).toHaveValue(second.id);
  const volume = viewer.getByRole("slider", { name: "Replay volume" });
  await volume.press("End");

  const manager = await context.newPage();
  await manager.goto("/mappool-actions?manage=1&playback=1");
  const attachments = manager
    .locator('[data-map-entry="entry-1"]')
    .getByRole("button", { name: /^Saved replays/ });
  const dialog = manager.getByRole("dialog", { name: "Replays for NM1" });
  await attachments.click();
  await dialog.getByLabel("Replay file", { exact: true }).setInputFiles(file);
  await dialog
    .getByRole("button", { name: "Upload replay", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Replay uploaded.");
  await expect(choices.getByRole("option")).toHaveText(
    items.map((item) => item.filename),
  );
  await expect(choices).toHaveValue(second.id);
  await expect(volume).toHaveValue("100");

  await dialog
    .getByRole("listitem")
    .filter({ hasText: second.filename })
    .getByRole("button", { name: "Delete replay" })
    .click();
  await manager
    .getByRole("dialog", { name: "Delete replay?", exact: true })
    .getByRole("button", { name: "Delete replay", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Replay deleted.");
  await expect(choices.getByRole("option")).toHaveText(
    items.map((item) => item.filename),
  );
  await expect(choices).toHaveValue(added.id);
  await expect(
    viewer.getByRole("group", {
      name: `Replay playback for ${added.filename}`,
    }),
  ).toBeVisible();
});

test("returning to the viewer clears the last replay when tab messages are unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
  });
  let items = [replay];
  await page.route("https://assets.ppy.sh/**", (route) => route.abort());
  await page.route("**/entries/entry-1/replays", (route) =>
    route.fulfill({ json: items }),
  );
  await page.goto("/mappool-actions?manage=1&playback=1");
  await page
    .locator('[data-map-entry="entry-1"]')
    .getByRole("button", { name: "Open replay player" })
    .click();
  const viewer = page.getByRole("dialog", { name: "Replay player for NM1" });
  const player = viewer.getByRole("group", {
    name: `Replay playback for ${replay.filename}`,
  });
  await expect(player).toBeVisible();
  items = [];
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(player).toHaveCount(0);
  await expect(viewer.getByRole("status")).toBeVisible();
});

for (const operation of ["upload", "delete"] as const) {
  test(`${operation} rejection stays visible after reloading and clears on a successful retry`, async ({
    page,
  }) => {
    let reads = 0;
    let writes = 0;
    const failure = "This pool changed. Refresh before confirming.";
    await page.route("https://assets.ppy.sh/**", (route) => route.abort());
    await page.route("**/api/**/replays**", async (route) => {
      if (route.request().method() === "GET") {
        reads++;
        await route.fulfill({
          json:
            operation === "delete"
              ? writes >= 2
                ? []
                : [replay]
              : writes >= 2
                ? [replay]
                : [],
        });
      } else {
        expect(route.request().method()).toBe(
          operation === "upload" ? "POST" : "DELETE",
        );
        writes++;
        await route.fulfill(
          writes === 1
            ? { status: 409, json: { error: failure } }
            : { json: { version: 8, duplicate: false, removed: true } },
        );
      }
    });
    await page.goto(
      `/mappool-actions?manage${operation === "delete" ? "&replay-count=1" : ""}`,
    );
    const entry = page.locator('[data-map-entry="entry-1"]');
    const initialLabel =
      operation === "delete" ? "Saved replays (1)" : "Upload replays";
    const trigger = entry.getByRole("button", {
      name: initialLabel,
      exact: true,
    });
    await expect(trigger).toHaveText(initialLabel);
    expect(reads).toBe(0);
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Replays for NM1",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: "Reload replay list" }),
    ).toBeEnabled();
    if (operation === "delete") {
      const performance = dialog.locator(".replay-performance");
      await expect(performance.locator("dd")).toHaveText([
        "98.25%",
        "987,654",
        "S",
        "1,234",
        "Yes",
      ]);
      await expect(performance.locator("dt").nth(3)).toHaveText("Max combo");
    }
    const act = async () => {
      if (operation === "upload") {
        await dialog
          .getByLabel("Replay file", { exact: true })
          .setInputFiles(file);
        await dialog
          .getByRole("button", { name: "Upload replay", exact: true })
          .click();
      } else {
        await dialog
          .getByRole("button", { name: "Delete replay", exact: true })
          .click();
        await page
          .getByRole("dialog", { name: "Delete replay?", exact: true })
          .getByRole("button", { name: "Delete replay", exact: true })
          .click();
      }
    };
    await act();
    await expect.poll(() => reads).toBe(2);
    await expect(
      dialog.getByRole("button", { name: "Reload replay list" }),
    ).toBeEnabled();
    await expect(dialog.getByRole("alert")).toHaveText(failure);
    await act();
    await expect.poll(() => reads).toBe(3);
    await expect(dialog.getByRole("status")).toHaveText(
      operation === "upload" ? "Replay uploaded." : "Replay deleted.",
    );
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog.locator("strong.replay-filename")).toHaveCount(
      operation === "upload" ? 1 : 0,
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    const savedLabel =
      operation === "upload" ? "Saved replays (1)" : "Upload replays";
    await expect(
      entry.getByRole("button", { name: savedLabel, exact: true }),
    ).toHaveText(savedLabel);
    expect(writes).toBe(2);
  });
}

test("list and deletion failures stay visible together until manual reload, without stale success", async ({
  page,
}) => {
  let reads = 0;
  let uploaded = false;
  const listFailure = "Could not load replays. Retry the list.";
  const deleteFailure = "This pool changed. Refresh before confirming.";
  await page.route("https://assets.ppy.sh/**", (route) => route.abort());
  await page.route("**/api/**/replays**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      reads++;
      await route.fulfill(
        reads === 1 || reads === 4
          ? { status: 503, json: { error: listFailure } }
          : { json: uploaded ? [replay] : [] },
      );
    } else if (method === "POST") {
      uploaded = true;
      await route.fulfill({ json: { duplicate: false, version: 8 } });
    } else {
      expect(method).toBe("DELETE");
      await route.fulfill({ status: 409, json: { error: deleteFailure } });
    }
  });
  await page.goto("/mappool-actions?manage");
  await page
    .locator('[data-map-entry="entry-1"]')
    .getByRole("button", { name: /^Upload replays/ })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Replays for NM1",
    exact: true,
  });
  const reload = dialog.getByRole("button", { name: "Reload replay list" });
  await expect(dialog.getByRole("alert")).toHaveText(listFailure);
  await reload.click();
  await expect.poll(() => reads).toBe(2);
  await expect(reload).toBeEnabled();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByLabel("Replay file", { exact: true }).setInputFiles(file);
  await dialog
    .getByRole("button", { name: "Upload replay", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Replay uploaded.");
  await dialog
    .getByRole("button", { name: "Delete replay", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete replay?", exact: true })
    .getByRole("button", { name: "Delete replay", exact: true })
    .click();
  await expect.poll(() => reads).toBe(4);
  await expect(reload).toBeEnabled();
  await expect(dialog.getByRole("alert")).toHaveText([
    listFailure,
    deleteFailure,
  ]);
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await reload.click();
  await expect.poll(() => reads).toBe(5);
  await expect(reload).toBeEnabled();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.locator("strong.replay-filename")).toHaveText(
    "synthetic.osr",
  );
});
