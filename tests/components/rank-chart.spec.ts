import { test, expect } from "@playwright/test";
test("unranked days retain the dates of earlier ranks", async ({ page }) => {
  for (const gaps of ["none", "one", "two", "trailing"]) {
    await page.goto(`/rank-chart?gaps=${gaps}`);
    const chart = page.locator(".rank-chart-svg");
    await expect(chart).toBeVisible();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await expect(page.locator(".rank-chart-tip")).toContainText("#16,200");
    await expect(page.locator(".rank-chart-tip")).toContainText("Nov 1, 2026");
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
    await expect(page.locator(".rank-chart-tip")).toContainText("#15,000");
    await expect(page.locator(".rank-chart-tip")).toContainText("Nov 4, 2026");
  }
});
test("snapshot dates stay fixed across midnight and repeated pointer visits", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-02T00:00:00Z"));
  await page.goto("/rank-chart");
  const chart = page.locator(".rank-chart-svg");
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  const hover = () =>
    page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await hover();
  await expect(page.locator(".rank-chart-tip")).toContainText("Nov 1, 2026");
  await page.mouse.move(0, 0);
  await page.clock.setFixedTime(new Date("2026-11-04T00:00:00Z"));
  await hover();
  await expect(page.locator(".rank-chart-tip")).toContainText("Nov 1, 2026");
});
test("undated history shows ranks without inventing a calendar date", async ({
  page,
}) => {
  await page.goto("/rank-chart?undated");
  const chart = page.locator(".rank-chart-svg");
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await expect(page.locator(".rank-chart-tip")).toContainText("#12,345");
  await expect(page.locator(".rank-chart-tip span")).toHaveCount(0);
});
for (const theme of ["light", "dark"]) {
  test(`rank chart renders and inspects points (${theme})`, async ({
    page,
  }) => {
    await page.goto("/rank-chart");
    await page
      .locator("html")
      .evaluate((el, value) => el.setAttribute("data-theme", value), theme);
    const chart = page.locator(".rank-chart-svg");
    await expect(chart).toBeVisible();
    const line = page.locator(".rank-chart-line");
    await expect(line).toHaveAttribute("d", /^M[\d.]+ [\d.]+ L/);
    await expect(page.locator(".rank-chart-tip")).toHaveCount(0);
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tip = page.locator(".rank-chart-tip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("#");
    // The tooltip must stay inside the viewport while hovering the edge.
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    const edge = (await tip.boundingBox())!;
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.x + edge.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.mouse.move(0, 0);
    await expect(page.locator(".rank-chart-tip")).toHaveCount(0);
  });
}
test("statistics sit beside the chart and stack on narrow screens", async ({
  page,
}) => {
  await page.goto("/rank-chart");
  const viewport = page.viewportSize()!;
  const body = page.locator(".profile-body");
  const columns = await body.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns,
  );
  if (viewport.width >= 960) {
    expect(columns.split(" ")).toHaveLength(2);
    const chart = (await page.locator(".rank-chart-card").boundingBox())!;
    const stats = (await page.locator(".profile-statistics").boundingBox())!;
    expect(stats.x).toBeGreaterThan(chart.x + chart.width / 2);
  } else {
    expect(columns.split(" ")).toHaveLength(1);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the line uses most of the chart height", async ({ page }) => {
  await page.goto("/rank-chart");
  const svg = (await page.locator(".rank-chart-svg").boundingBox())!;
  const line = await page.locator(".rank-chart-line").evaluate((element) => {
    const { x, y, width, height } = (element as SVGGraphicsElement).getBBox();
    return { x, y, width, height };
  });
  // A fixed margin around the rank range left over a third of the box empty on
  // histories whose ranks barely move; the plot should stay mostly filled.
  expect(line.height).toBeGreaterThan(svg.height * 0.7);
  expect(line.y).toBeLessThan(svg.height * 0.15);
});
