import { expect, test } from "@playwright/test";
import catalog from "../../src/lib/player-reaction-catalog.json" with { type: "json" };

const playerReactions = catalog.filter(
  (reaction) => reaction.selectable !== false,
);

// Existing player-messages E2E covers the original toggle. The larger image
// catalog needs a focused native-popover/scroll/focus check, without a DB flow.
test("image picker loads one batch at a time and preserves reactions and pick counts", async ({
  page,
}) => {
  await page.goto("/player-reactions?locale=en");
  const first = page.locator(".event-player-row").first();
  const add = first.getByRole("button", { name: "Add reaction", exact: true });
  await add.click();
  const panel = page.locator(".reaction-picker:popover-open");
  const options = panel.locator("[data-reaction-id]");
  const scroll = panel.locator(".reaction-picker-scroll");
  const count = panel.locator(".reaction-picker-total");
  const search = panel.getByRole("searchbox");
  const frequent = panel.getByRole("button", { name: "Frequently used" });
  await expect(options).toHaveCount(40);
  await expect(count).toHaveText("40/407");
  const bounds = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  for (let limit = 80; limit < playerReactions.length + 40; limit += 40) {
    await scroll.evaluate((e) => e.scrollTo(0, e.scrollHeight));
    await expect(options).toHaveCount(Math.min(limit, playerReactions.length));
  }
  expect(
    await options.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-reaction-id")),
    ),
  ).toEqual(playerReactions.map((reaction) => reaction.id));
  await expect(count).toHaveText("407/407");
  const lastId = playerReactions.at(-1)!.id;
  await search.fill(lastId);
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveAttribute("data-reaction-id", lastId);
  await expect(count).toHaveText("1/1");
  await search.clear();
  await expect(options).toHaveCount(40);
  expect(await scroll.evaluate((e) => e.scrollTop)).toBe(0);
  await frequent.click();
  await expect(panel.getByRole("status")).toHaveText(
    "No frequently used emoji yet.",
  );
  await expect(count).toHaveText("0/0");
  await frequent.click();
  await search.fill("按按钮");
  await expect(options).toHaveCount(1);
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
  await add.click();
  await frequent.focus();
  await page.keyboard.press("Space");
  await expect(frequent).toHaveAttribute("aria-pressed", "true");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveAttribute("data-reaction-id", "qq-424");
  await options.first().click();
  await expect(reaction).toHaveCount(1);
  await page.goto("/player-reactions?locale=en");
  await reaction.click();
  await expect(reaction).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("oclr-reaction-picks")),
  ).toBe('{"qq-424":2}');
});

test("reduced motion uses still images, legacy reactions survive, and escape returns focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const recorded = Object.fromEntries(
    playerReactions.slice(-45).map((reaction) => [reaction.id, 1]),
  );
  await page.addInitScript((picks) => {
    localStorage.setItem(
      "oclr-reactions:synthetic-969:969001",
      // This source was PNG-labelled but contained an infinitely looping APNG.
      JSON.stringify(["💜", "qq-367", "osu-NM"]),
    );
    localStorage.setItem(
      "oclr-reaction-picks",
      JSON.stringify({ ...picks, "osu-NM": 99 }),
    );
  }, recorded);
  await page.goto("/player-reactions?locale=en&theme=dark");
  const row = page.locator(".event-player-row").first();
  await row
    .getByRole("button", { name: "React with No Mod", exact: true })
    .click();
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
  const panel = page.locator(".reaction-picker:popover-open");
  const search = panel.getByRole("searchbox");
  const scroll = panel.locator(".reaction-picker-scroll");
  const options = panel.locator("[data-reaction-id]");
  await scroll.evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await expect(options).toHaveCount(80);
  await panel.getByRole("button", { name: "Frequently used" }).click();
  await expect(options).toHaveCount(40);
  await expect(options.first()).toHaveAttribute(
    "data-reaction-id",
    playerReactions.at(-45)!.id,
  );
  expect(await scroll.evaluate((e) => e.scrollTop)).toBe(0);
  await scroll.evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await expect(options).toHaveCount(45);
  await search.fill(playerReactions.at(-1)!.id);
  await expect(options).toHaveCount(1);
  await search.fill("osu-NM");
  await expect(panel.getByRole("status")).toHaveText("No matching emoji.");
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
