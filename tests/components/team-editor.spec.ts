import { expect, test } from "@playwright/test";
import sharp from "sharp";
test("decodes PNG/JPEG/WebP under the actual CSP and releases previews on replace/remove/cancel/unmount", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { created: [] as string[], revoked: [] as string[] };
    Object.assign(window, { previewUrls: state });
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      state.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      state.revoked.push(url);
      revoke(url);
    };
  });
  const response = await page.goto("/team-editor");
  expect(response!.headers()["content-security-policy"]).toContain("blob:");
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await expect(
    page.getByLabel("Roster capacity (optional)", { exact: true }),
  ).toHaveCount(0);
  const dialog = page.getByRole("dialog"),
    preview = dialog.getByAltText("Pending team image");
  const choose = async (format: "png" | "jpeg" | "webp") => {
    const buffer = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "purple" },
    })
      .toFormat(format)
      .toBuffer();
    await dialog.getByLabel("Team avatar", { exact: true }).setInputFiles({
      name: `synthetic.${format}`,
      mimeType: `image/${format}`,
      buffer,
    });
    await expect(preview).toHaveJSProperty("complete", true);
    await expect(preview).toHaveJSProperty("naturalWidth", 12);
  };
  const allReleased = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { created, revoked } = (
            window as typeof window & {
              previewUrls: { created: string[]; revoked: string[] };
            }
          ).previewUrls;
          return (
            created.length > 0 && created.every((url) => revoked.includes(url))
          );
        }),
      )
      .toBe(true);
  };
  for (const format of ["png", "jpeg", "webp"] as const) await choose(format);
  await dialog
    .getByRole("button", { name: "Remove avatar", exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  await allReleased();
  await choose("webp"); // reselecting the same file after removal must work
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await allReleased();
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await choose("jpeg");
  await page.keyboard.press("Escape");
  await allReleased();
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await choose("png");
  // The surrounding host may unmount the component while the dialog is open.
  await page.evaluate(() =>
    (document.querySelector("button") as HTMLButtonElement).click(),
  );
  await allReleased();
});
