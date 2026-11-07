import { expect, test } from "@playwright/test";

// Existing player-messages E2E covers the original toggle. The larger image
// catalog needs a focused native-popover/scroll/focus check, without a DB flow.
test("image picker stays within the viewport and preserves choices per player and edition", async ({
  page,
}) => {
  await page.goto("/player-reactions?locale=en");
  const first = page.locator(".event-player-row").first();
  const add = first.getByRole("button", { name: "Add reaction", exact: true });
  await add.click();
  const panel = page.locator(".reaction-picker:popover-open");
  await expect(panel.locator("[data-reaction-id]")).toHaveCount(408);
  await expect(panel.locator("[data-reaction-id]").first()).toHaveAttribute(
    "data-reaction-id",
    "qq-13",
  );
  const bounds = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await panel.locator("[data-reaction-id]").last().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      panel.locator(".reaction-picker-scroll").evaluate((e) => e.scrollTop),
    )
    .toBeGreaterThan(0);
  await panel.getByRole("searchbox").fill("按按钮");
  await expect(panel.locator("[data-reaction-id]")).toHaveCount(1);
  const button = panel.locator('[data-reaction-id="qq-424"]');
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);
  await expect(add).toBeFocused();
  const reaction = first.locator(".player-reaction");
  await expect(reaction).toHaveCount(1);
  await expect
    .poll(() =>
      reaction
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await expect(
    page.locator(".event-player-row").nth(1).locator(".player-reaction"),
  ).toHaveCount(0);
  await page.reload();
  await expect(first.locator(".player-reaction")).toHaveCount(1);
  await page.goto("/player-reactions?locale=en&edition=synthetic-other");
  await expect(page.locator(".player-reaction")).toHaveCount(0);
  await page.goto("/player-reactions?locale=en");
  await first.locator(".player-reaction").click();
  await expect(first.locator(".player-reaction")).toHaveCount(0);
});

test("reduced motion uses still images, legacy reactions survive, and escape returns focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem(
      "oclr-reactions:synthetic-969:969001",
      // This source was PNG-labelled but contained an infinitely looping APNG.
      JSON.stringify(["💜", "qq-367"]),
    );
  });
  await page.goto("/player-reactions?locale=en&theme=dark");
  const row = page.locator(".event-player-row").first();
  await expect(row.locator(".player-reaction")).toHaveCount(2);
  await expect
    .poll(() =>
      row
        .locator(".player-reaction img")
        .evaluate((image: HTMLImageElement) => image.currentSrc),
    )
    .toContain("-png.png");
  const add = row.getByRole("button", { name: "Add reaction", exact: true });
  await add.click();
  const search = page
    .locator(".reaction-picker:popover-open")
    .getByRole("searchbox");
  await search.fill("no-such-emoji");
  await expect(
    page.locator(".reaction-picker:popover-open").getByRole("status"),
  ).toHaveText("No matching emoji.");
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await add.click();
  await expect(search).toHaveValue("");
  await search.fill("osu-HD");
  const mod = page.locator('[data-reaction-id="osu-HD"]');
  await expect
    .poll(() =>
      mod
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await mod.click();
  await expect(row.locator(".player-reaction")).toHaveCount(3);
});
