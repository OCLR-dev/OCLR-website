import { expect, test } from "@playwright/test";
import { historicalArchive } from "../fixtures/historical-archive";

const draft = (note: string) =>
  JSON.stringify({ ...historicalArchive, notes: [note] });
const oldText = draft("Synthetic older file");
const latestText = draft("Synthetic latest draft");
type ControlledWindow = Window & {
  releaseArchiveRead?: (fail?: boolean) => void;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = File.prototype.text;
    File.prototype.text = async function () {
      const text = await original.call(this);
      if (this.name === "delayed.json") {
        await new Promise<void>((resolve, reject) => {
          (window as ControlledWindow).releaseArchiveRead = (fail) =>
            fail ? reject(new Error("Synthetic file failure")) : resolve();
        });
      }
      return text;
    };
  });
  await page.goto("/archive-importer");
});

for (const replacement of ["file", "manual", "manual-error"] as const) {
  test(`a delayed file cannot replace the latest ${replacement} draft or its reviewed save`, async ({
    page,
  }) => {
    const writes: { archive: { notes: string[] } }[] = [];
    await page.route("**/api/admin/tournaments/history-test", async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: { saved: true } });
    });
    const upload = page.getByLabel("Archive JSON file", { exact: true });
    const editor = page.getByRole("textbox", {
      name: "Archive JSON",
      exact: true,
    });
    await upload.setInputFiles({
      name: "delayed.json",
      mimeType: "application/json",
      buffer: Buffer.from(oldText),
    });
    await expect
      .poll(() =>
        page.evaluate(() => !!(window as ControlledWindow).releaseArchiveRead),
      )
      .toBe(true);
    if (replacement === "file") {
      await upload.setInputFiles({
        name: "latest.json",
        mimeType: "application/json",
        buffer: Buffer.from(latestText),
      });
    } else {
      await editor.fill(latestText);
    }
    await expect(editor).toHaveValue(latestText);
    await page
      .getByRole("button", { name: "Validate and review archive", exact: true })
      .click();
    await expect(
      page.getByText("Synthetic latest draft", { exact: true }),
    ).toBeVisible();
    await page.evaluate(async (fail) => {
      (window as ControlledWindow).releaseArchiveRead!(fail);
      // Let React commit the completed read before asserting it was ignored.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    }, replacement === "manual-error");
    await expect(editor).toHaveValue(latestText);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Save archive draft", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].archive.notes).toEqual(["Synthetic latest draft"]);
  });
}

test("selecting a new file cannot validate the previous buffer while reading", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", {
    name: "Archive JSON",
    exact: true,
  });
  const validate = page.getByRole("button", {
    name: "Validate and review archive",
    exact: true,
  });
  await editor.fill(oldText);
  await validate.click();
  await expect(
    page.getByRole("button", { name: "Save archive draft", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Archive JSON file", { exact: true }).setInputFiles({
    name: "delayed.json",
    mimeType: "application/json",
    buffer: Buffer.from(latestText),
  });
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as ControlledWindow).releaseArchiveRead),
    )
    .toBe(true);
  await expect(editor).toHaveValue("");
  await expect(validate).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save archive draft", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => (window as ControlledWindow).releaseArchiveRead!());
  await expect(editor).toHaveValue(latestText);
  await validate.click();
  await expect(
    page.getByText("Synthetic latest draft", { exact: true }),
  ).toBeVisible();
});
