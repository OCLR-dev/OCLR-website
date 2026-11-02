import { test, expect, type Page } from "@playwright/test";

async function selectRange(page: Page, mobile: boolean) {
  const calendar = page.locator(".schedule-calendar-root");
  await calendar.waitFor();
  await calendar.scrollIntoViewIfNeeded();
  const lane = page.locator('.schedule-day-lane[data-date="2026-11-01"]');
  const box = await lane.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + box!.width / 2,
    y = box!.y + (box!.height * 20) / 24;
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(1100); // FullCalendar's actual long-press selection gesture.
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + box!.height / 24 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + box!.height / 24, { steps: 12 });
    await page.mouse.up();
  }
}
async function fillRange(page: Page, end = "22:00") {
  await page
    .getByLabel("Available from: date", { exact: true })
    .fill("2026-11-01");
  await page
    .getByLabel("Available from: time (HH:mm)", { exact: true })
    .fill("20:00");
  await page
    .getByLabel("Available until: date", { exact: true })
    .fill("2026-11-01");
  await page
    .getByLabel("Available until: time (HH:mm)", { exact: true })
    .fill(end);
}
for (const theme of ["light", "dark"]) {
  test(`${theme}: fixture selection and edited ranges stay visible without saving`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/schedule-selection?fixture&theme=${theme}`);
    await selectRange(page, isMobile);
    await expect(page.locator(".schedule-own")).toHaveCount(2);
    await fillRange(page);
    await expect(page.locator(".schedule-selection")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Add time slot", exact: true })
      .click();
    await expect(page.locator(".schedule-selection")).toHaveCount(0);
    await expect(page.locator(".schedule-own")).toHaveCount(3);
    await page
      .locator(".schedule-slots li")
      .first()
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await expect(page.locator(".schedule-selection")).toHaveCount(1);
    await expect(page.locator(".schedule-own")).toHaveCount(2);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".schedule-selection")).toHaveCount(0);
    await expect(page.locator(".schedule-own")).toHaveCount(3);
    await expect(page.locator(".schedule-official")).toHaveCount(1);
  });
}
