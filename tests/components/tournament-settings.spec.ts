import { expect, test } from "@playwright/test";

test("conflict refresh retains the name draft and adopts the saved coaching setting", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/tournaments/test-cup", async (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    await page.evaluate(
      (fields) =>
        window.dispatchEvent(
          new CustomEvent("synthetic-settings-saved", { detail: fields }),
        ),
      writes.length === 1
        ? { ...body, name: "Synthetic test edition", coachesEnabled: true }
        : body,
    );
    await route.fulfill(
      writes.length === 1
        ? { status: 409, json: { error: "The action could not be completed." } }
        : { json: {} },
    );
  });
  await page.goto("/tournament-settings");
  const general = page.locator(".general-settings");
  const name = general.getByLabel("Tournament name", { exact: true });
  const coaches = general.getByLabel("Enable coaches for this tournament", {
    exact: true,
  });
  const save = general.getByRole("button", {
    name: "Save general settings",
    exact: true,
  });
  await expect(coaches).not.toBeChecked();
  await name.fill("My name draft");
  await save.click();
  await expect(general.getByRole("alert")).toHaveText(
    "The action could not be completed.",
  );
  await expect(name).toHaveValue("My name draft");
  await expect(coaches).toBeChecked();
  await save.click();
  await expect(general.getByRole("alert")).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toMatchObject({
    expectedRevision: 4,
    name: "My name draft",
    coachesEnabled: false,
  });
  expect(writes[1]).toMatchObject({
    expectedRevision: 5,
    name: "My name draft",
    coachesEnabled: true,
  });
  // A later deliberate coaching edit must still be submitted.
  await coaches.uncheck();
  await save.click();
  await expect(save).toBeEnabled();
  await expect(coaches).not.toBeChecked();
  expect(writes[2]).toMatchObject({
    expectedRevision: 6,
    coachesEnabled: false,
  });
});

test("save row aligns status and action across locales, themes and appearances", async ({
  page,
  isMobile,
}, info) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
  for (const [locale, appearance] of [
    ["en", "default"],
    ["zh-Hans", "cute-pastel"],
    ["zh-Hant", "swiss-minimal"],
  ]) {
    for (const theme of ["light", "dark"]) {
      await page.goto(
        `/tournament-settings?locale=${locale}&theme=${theme}&appearance=${appearance}`,
      );
      const bar = page.locator(".general-settings .settings-save");
      const status = bar.locator("p").first();
      const button = bar.getByRole("button");
      await expect(status).toHaveText(/\S/);
      await expect(button).toBeEnabled();
      await expect(button).toHaveAccessibleName(/\S/);
      await bar.scrollIntoViewIfNeeded();
      const row = (await bar.boundingBox())!;
      const text = (await status.boundingBox())!;
      const action = (await button.boundingBox())!;
      expect(action.height).toBeGreaterThanOrEqual(44);
      if (isMobile) {
        expect(action.y).toBeGreaterThanOrEqual(text.y + text.height);
        expect(Math.abs(action.width - row.width)).toBeLessThanOrEqual(1);
      } else {
        expect(
          Math.abs(text.y + text.height / 2 - (action.y + action.height / 2)),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(action.x + action.width - (row.x + row.width)),
        ).toBeLessThanOrEqual(1);
      }
      expect(
        await bar.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await bar.screenshot({
        path: info.outputPath(`settings-save-${locale}-${theme}.png`),
        animations: "disabled",
      });
    }
  }
});

test("general settings preserve unsaved state on failure and save the current revision", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/tournaments/test-cup", async (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    if (writes.length === 1)
      await route.fulfill({
        status: 409,
        json: { error: "The action could not be completed." },
      });
    else {
      await page.evaluate(
        (fields) =>
          window.dispatchEvent(
            new CustomEvent("synthetic-settings-saved", { detail: fields }),
          ),
        body,
      );
      await route.fulfill({ json: {} });
    }
  });
  await page.goto("/tournament-settings");
  const general = page.locator(".general-settings");
  const bar = general.locator(".settings-save");
  await expect(bar.locator("p").first()).toHaveText("Saved settings");
  await general
    .getByRole("textbox", { name: "Tournament name", exact: true })
    .fill("Updated synthetic edition");
  await expect(bar.locator("p").first()).toHaveText("Unsaved changes");
  const save = bar.getByRole("button", {
    name: "Save general settings",
    exact: true,
  });
  await save.click();
  await expect(bar.getByRole("alert")).toHaveText(
    "The action could not be completed.",
  );
  expect(
    await bar.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await expect(bar.locator("p").first()).toHaveText("Unsaved changes");
  await save.click();
  await expect(bar.locator("p").first()).toHaveText("Saved settings");
  expect(writes).toHaveLength(2);
  for (const body of writes)
    expect(body).toMatchObject({
      action: "general",
      expectedRevision: 4,
      confirmed: true,
      name: "Updated synthetic edition",
      branding: {
        logo: "/oclr-s11-square-logo.webp",
        background: "/oclr-s11-website-background.webp",
        keyVisual: "/oclr-s11-key-visual.webp",
      },
    });
});

test("current S11 artwork loads through the existing branding choices", async ({
  page,
}, info) => {
  await page.goto("/tournament-settings");
  const artwork = page.locator(".settings-artwork-grid");
  const images = artwork.locator("img");
  await expect(images).toHaveCount(3);
  for (const [index, dimensions] of [
    [0, [1200, 1200]],
    [1, [3840, 1800]],
    [2, [1920, 1080]],
  ] as const) {
    await expect
      .poll(() =>
        images
          .nth(index)
          .evaluate((image: HTMLImageElement) => [
            image.naturalWidth,
            image.naturalHeight,
          ]),
      )
      .toEqual(dimensions);
  }
  await artwork.screenshot({
    path: info.outputPath("settings-artwork.png"),
    animations: "disabled",
  });
  const background = page.getByRole("combobox", {
    name: "Website background",
    exact: true,
  });
  await expect(background).toHaveValue("/oclr-s11-website-background.webp");
  await background.selectOption("");
  await expect(images).toHaveCount(2);
  await background.selectOption("/oclr-s11-website-background.webp");
  await expect(images).toHaveCount(3);
});

test("read-only save row keeps the action disabled", async ({ page }) => {
  await page.goto("/tournament-settings?readonly");
  await expect(
    page.locator(".general-settings .settings-save").getByRole("button"),
  ).toBeDisabled();
});
