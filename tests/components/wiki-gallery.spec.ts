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
  await page.goto(`/wiki-gallery?theme=${isMobile ? "light" : "dark"}`);
  const trigger = page.locator('.wiki-gallery a[aria-haspopup="dialog"]');
  const originalUrl = page.url();
  await expect(trigger).toHaveAccessibleName(/Elegant maid outfit \(SSR\)$/);
  await trigger.focus();
  if (isMobile) await trigger.tap();
  else await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Elegant maid outfit" });
  await expect(dialog).toBeVisible();
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

  await page.getByRole("button", { name: "Show another look" }).click();
  await expect(trigger).toHaveAccessibleName(/Purple punk streetwear \(SR\)$/);
  await trigger.click();
  const nextDialog = page.getByRole("dialog", {
    name: "Purple punk streetwear",
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
  expect(download.suggestedFilename()).toBe("Purple punk streetwear.webp");
  expect(await readFile((await download.path())!)).toEqual(
    await readFile("public/mascot/liru/gallery/purple-punk.webp"),
  );
  const cardPromise = page.waitForEvent("download");
  await nextDialog.getByRole("button", { name: "Download card" }).click();
  const card = await cardPromise;
  expect(card.suggestedFilename()).toBe("Purple punk streetwear - SR.png");
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
