import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("keeps the conflict and team draft until dismissal, then reopens current data", async ({
  page,
}) => {
  const versions: string[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/teams/synthetic-team",
    async (route) => {
      const body = route.request().postDataBuffer()!.toString();
      versions.push(body);
      await route.fulfill(
        versions.length === 1
          ? {
              status: 409,
              json: { error: "The action could not be completed." },
            }
          : { json: {} },
      );
    },
  );
  await page.goto("/team-editor");
  const open = page.getByRole("button", { name: "Edit team", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Team name", { exact: true })
    .fill("Unsaved team draft");
  await dialog
    .getByRole("button", { name: "Remove avatar", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "The action could not be completed.",
  );
  await expect(dialog.getByLabel("Team name", { exact: true })).toHaveValue(
    "Unsaved team draft",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await open.click();
  await expect(dialog.getByLabel("Team name", { exact: true })).toHaveValue(
    "Latest saved team",
  );
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(versions).toHaveLength(2);
  expect(versions[0]).toMatch(/name="expectedVersion"\r\n\r\n1/);
  expect(versions[1]).toMatch(/name="expectedVersion"\r\n\r\n2/);
  expect(versions[1]).toMatch(/name="removeAvatar"\r\n\r\nfalse/);
});

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
