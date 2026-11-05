import { expect, test } from "@playwright/test";

test("day/week breakpoint changes retain the browsed date in both directions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/schedule-selection?fixture");
  const days = page.locator(".schedule-day-lane");
  await expect(days).toHaveCount(1);
  const next = page.getByRole("button", { name: /^Next / });
  for (let i = 0; i < 10; i++) await next.click();
  await expect(days).toHaveAttribute("data-date", "2026-11-11");
  await page.setViewportSize({ width: 430, height: 844 });
  await expect(days).toHaveAttribute("data-date", "2026-11-11");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(days).toHaveCount(7);
  await expect(
    page.locator('.schedule-day-lane[data-date="2026-11-11"]'),
  ).toHaveCount(1);
  await next.click();
  await next.click();
  const week = await days.evaluateAll((elements) =>
    elements.map((e) => e.getAttribute("data-date")),
  );
  expect(week).toContain("2026-11-25");
  await page.setViewportSize({ width: 900, height: 430 });
  await expect(days.first()).toHaveAttribute("data-date", week[0]!);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(days).toHaveCount(1);
  expect(week).toContain(await days.getAttribute("data-date"));
  await expect(page.locator(".schedule-time-scroller")).toHaveAttribute(
    "tabindex",
    "0",
  );
});
