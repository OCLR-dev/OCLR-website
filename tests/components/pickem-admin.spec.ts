import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/pickem/fixtures/fixture", (route) =>
    route.fulfill({ json: {} }),
  );
});

test("allows opening at kickoff and rejects a later deadline", async ({
  page,
}) => {
  await page.goto("/pickem-admin");
  await page.getByText("M1", { exact: true }).click();
  const time = page.getByLabel("Pick deadline: time (HH:mm)");
  const open = page.getByRole("button", { name: "Open predictions" });
  await expect(open).toBeEnabled();
  await time.fill("20:01");
  await expect(open).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("match start");
  await time.fill("20:00");
  await expect(open).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const request = page.waitForRequest("**/pickem/fixtures/fixture");
  await open.click();
  expect((await request).postDataJSON()).toMatchObject({
    action: "open",
    closesAt: "2040-01-05T12:00:00.000Z",
    fixtureVersion: 3,
  });
});

test("requires a strictly earlier instant to tighten an open window", async ({
  page,
}) => {
  await page.goto("/pickem-admin?active");
  await page.getByText("M1", { exact: true }).click();
  const time = page.getByLabel("Pick deadline: time (HH:mm)");
  const tighten = page.getByRole("button", { name: "Set earlier deadline" });
  await expect(tighten).toBeDisabled();
  await time.fill("19:01");
  await expect(tighten).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("current deadline");
  await expect(page.getByRole("button", { name: "Close now" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Void predictions" }),
  ).toBeEnabled();
  await time.fill("19:00");
  await expect(tighten).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await time.fill("18:59");
  await expect(tighten).toBeEnabled();
  const request = page.waitForRequest("**/pickem/fixtures/fixture");
  await tighten.click();
  expect((await request).postDataJSON()).toMatchObject({
    action: "tighten",
    closesAt: "2040-01-05T10:59:00.000Z",
    windowId: "window",
    expectedVersion: 4,
  });
});
