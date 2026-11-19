import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

// Real lightbox interactions need a browser: focus restoration, zoom gestures,
// native downloads, and reopening the newly shuffled image. No DB workflow.
test("previews in place, restores focus and downloads the current card and artwork", async ({
  page,
  isMobile,
  context,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/wiki-gallery?theme=${isMobile ? "light" : "dark"}`);
  const showcase = page.getByRole("region", { name: "Liru Card Showcase" });
  const trigger = showcase.locator('a[aria-haspopup="dialog"]');
  const shuffle = showcase.getByRole("button", { name: "Show another look" });
  const originalUrl = page.url();
  await expect(trigger).toBeVisible();
  // The panel aligns to the article edges, with space around its own contents.
  const article = (await page.getByRole("article").boundingBox())!;
  const panel = (await showcase.boundingBox())!;
  const heading = (await showcase.getByRole("heading").boundingBox())!;
  const cardBox = (await trigger.locator(".wiki-gallery-card").boundingBox())!;
  const button = (await shuffle.boundingBox())!;
  expect(panel.x).toBeCloseTo(article.x, 0);
  expect(panel.width).toBeCloseTo(article.width, 0);
  expect(heading.x - panel.x).toBeGreaterThanOrEqual(16);
  expect(heading.y - panel.y).toBeGreaterThanOrEqual(16);
  expect(cardBox.y - heading.y - heading.height).toBeGreaterThanOrEqual(16);
  if (isMobile) {
    const gap = button.y - cardBox.y - cardBox.height;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(40);
    expect(button.x + button.width / 2).toBeCloseTo(
      cardBox.x + cardBox.width / 2,
      0,
    );
  } else {
    await expect(shuffle).toBeInViewport({ ratio: 1 });
    expect(button.x).toBeGreaterThan(cardBox.x + cardBox.width);
    expect(button.x - cardBox.x - cardBox.width).toBeLessThanOrEqual(40);
    expect(button.y + button.height / 2).toBeCloseTo(
      cardBox.y + cardBox.height / 2,
      0,
    );
  }
  expect(button.x + button.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await expect(trigger).toHaveAccessibleName(/Elegant maid outfit \(SSR\)$/);
  await trigger.focus();
  if (isMobile) await trigger.tap();
  else await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Elegant maid outfit" });
  await expect(dialog).toBeVisible();
  const toolbar = await dialog
    .locator(".yarl__toolbar :is(button, a)")
    .evaluateAll((controls) =>
      controls.map((control) => {
        const { x, y, width, height } = control.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
  expect(toolbar).toHaveLength(5);
  for (const control of toolbar) {
    expect(control.y).toBeCloseTo(toolbar[0].y);
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.x + control.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  }
  const image = dialog.getByRole("img");
  await expect(image).toHaveJSProperty("naturalWidth", 1024);
  const width = (await image.boundingBox())!.width;
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () => (await image.boundingBox())!.width)
    .toBeGreaterThan(width);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await shuffle.click();
  await expect(trigger).toHaveAccessibleName(/Purple punk \(SR\)$/);
  await trigger.click();
  const nextDialog = page.getByRole("dialog", {
    name: "Purple punk",
  });
  await expect(nextDialog.getByRole("img")).toHaveAttribute(
    "src",
    "/mascot/liru/gallery/purple-punk.webp",
  );
  const downloadPromise = page.waitForEvent("download");
  await nextDialog
    .getByRole("link", { name: "Download transparent artwork" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Purple punk.webp");
  expect(await readFile((await download.path())!)).toEqual(
    await readFile("public/mascot/liru/gallery/purple-punk.webp"),
  );
  const cardPromise = page.waitForEvent("download");
  await nextDialog.getByRole("button", { name: "Download card" }).click();
  const card = await cardPromise;
  expect(card.suggestedFilename()).toBe("Purple punk - SR.png");
  const cardImage = sharp((await card.path())!);
  await expect(cardImage.metadata()).resolves.toMatchObject({
    format: "png",
    width: 1024,
    height: 1536,
  });
  const { data, info } = await cardImage
    .extract({ left: 70, top: 80, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(4);
  // This point is outside the portrait area but inside the blue SR frame.
  expect(data[3]).toBe(255);
  expect(data[2]).toBeGreaterThan(data[0]);
  await nextDialog.getByRole("button", { name: "Close" }).click();
  await expect(nextDialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(page.url()).toBe(originalUrl);
  expect(context.pages()).toHaveLength(1);
});
