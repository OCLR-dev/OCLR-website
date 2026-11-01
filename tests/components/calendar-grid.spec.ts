import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

async function todayGridContrast(page: Page) {
  const calendar = page.locator(".schedule-calendar");
  // Finish the view's initial scroll before sampling the early-morning slots.
  await page.clock.runFor(100);
  await calendar.scrollIntoViewIfNeeded();
  await page.locator(".schedule-time-scroller").evaluate((element) => {
    element.scrollTop = 0;
  });
  // Locator screenshots may scroll the page; measure coordinates afterwards.
  const screenshot = await calendar.screenshot({ scale: "css" });
  const day = await page
    .locator('.schedule-day-lane[aria-current="date"]')
    .boundingBox();
  const frame = await calendar.boundingBox();
  expect(day).toBeTruthy();
  expect(frame).toBeTruthy();
  const { data, info } = await sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => {
    const offset = (y * info.width + x) * 4;
    return [data[offset], data[offset + 1], data[offset + 2]];
  };
  const distance = (a: number[], b: number[]) =>
    a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / 3;
  const left = Math.ceil(day!.x - frame!.x + 8);
  const right = Math.floor(day!.x + day!.width - frame!.x - 8);
  const contrasts: number[] = [];
  for (const time of ["01:00:00", "01:30:00"]) {
    // The time-axis label and the full-width slot share data-time; the slot is last.
    const line = await calendar
      .locator(`[data-time="${time}"]`)
      .last()
      .boundingBox();
    expect(line).toBeTruthy();
    const top = Math.floor(line!.y - frame!.y);
    expect(
      top,
      JSON.stringify({ day, frame, line, image: info }),
    ).toBeGreaterThan(0);
    expect(
      top + 6,
      JSON.stringify({ day, frame, line, image: info }),
    ).toBeLessThan(info.height);
    const rows = [-1, 0, 1].map((offset) => {
      let difference = 0;
      for (let x = left; x <= right; x++)
        difference += distance(pixel(x, top + offset), pixel(x, top + 6));
      return difference / (right - left + 1);
    });
    contrasts.push(Math.max(...rows));
  }
  const neighbors = calendar.locator(
    '.schedule-day-lane:not([aria-current="date"])',
  );
  let tintContrast: number | undefined;
  if (await neighbors.count()) {
    const neighbor = (await neighbors.first().boundingBox())!;
    const top = Math.floor(day!.y - frame!.y + 12);
    tintContrast = distance(
      pixel(left, top),
      pixel(Math.ceil(neighbor.x - frame!.x + 8), top),
    );
  }
  return { contrasts, tintContrast };
}

for (const theme of ["light", "dark"]) {
  test(`${theme}: today's highlight preserves hourly and half-hour gridlines in day and week views`, async ({
    page,
  }, info) => {
    await page.clock.install({ time: new Date("2026-11-01T08:00:00Z") });
    await page.goto(`/schedule-selection?theme=${theme}`);
    await page.locator(".schedule-time-scroller").waitFor();
    for (const view of ["Day", "Week"]) {
      await page
        .locator(".schedule-calendar button")
        .filter({ hasText: new RegExp(`^${view}$`) })
        .click();
      const { contrasts, tintContrast } = await todayGridContrast(page);
      for (const contrast of contrasts) expect(contrast).toBeGreaterThan(5);
      if (view === "Week") expect(tintContrast).toBeGreaterThan(1);
      await page.locator(".schedule-calendar").screenshot({
        path: info.outputPath(`today-grid-${theme}-${view}.png`),
      });
    }
  });
}
