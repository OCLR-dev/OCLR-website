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
  },
  verification: "matched",
};
const file = {
  name: "synthetic.osr",
  mimeType: "application/octet-stream",
  buffer: Buffer.from("synthetic mock upload"),
};

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
