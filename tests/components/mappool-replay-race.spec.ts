import { test, expect } from "@playwright/test";

for (const stale of ["success", "error"]) {
  test(`reopening keeps the latest replay list when an old ${stale} arrives`, async ({
    page,
  }) => {
    let reads = 0;
    let release: (() => void) | undefined;
    let finish: Promise<void> | undefined;
    const writes: string[] = [];
    const replay = (id: number) => ({
      id: String(id),
      filename: `${id === 1 ? "one" : "two"}.osr`,
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
    });
    await page.route("https://assets.ppy.sh/**", (route) => route.abort());
    await page.route("**/api/**/replays", async (route) => {
      if (route.request().method() !== "GET")
        writes.push(route.request().method());
      reads += 1;
      if (reads === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        finish = route
          .fulfill(
            stale === "success"
              ? { json: [replay(1)] }
              : { status: 503, json: { error: "Synthetic stale failure" } },
          )
          .catch(() => {});
        await finish;
      } else await route.fulfill({ json: [replay(1), replay(2)] });
    });
    await page.goto("/mappool-actions?replay-count=1");
    const trigger = page
      .locator('[data-map-entry="entry-1"]')
      .getByRole("button", { name: "Saved replays (1)", exact: true });
    await trigger.click();
    await expect.poll(() => Boolean(release)).toBe(true);
    const dialog = page.getByRole("dialog", { name: "Replays for NM1" });
    const reload = dialog.getByRole("button", { name: "Reload replay list" });
    await expect(dialog.getByRole("status")).toHaveCount(0);
    await expect(reload).toBeEnabled();
    await expect(dialog.getByText("No replays attached.")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await trigger.click();
    await expect(dialog.getByText("two.osr", { exact: true })).toBeVisible();
    release!();
    await expect.poll(() => Boolean(finish)).toBe(true);
    await finish;
    await expect(dialog.locator("strong.replay-filename")).toHaveText([
      "one.osr",
      "two.osr",
    ]);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(reload).toBeEnabled();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page
        .locator('[data-map-entry="entry-1"]')
        .getByRole("button", { name: "Saved replays (2)", exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
}
