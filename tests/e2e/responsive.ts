import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";

/** Keep responsive evidence with the workflow that owns the seeded page. */
export async function captureResponsiveLayout(
  page: Page,
  info: TestInfo,
  name: string,
) {
  const original = page.viewportSize()!;
  const measurements = [];
  try {
    for (const width of [320, 390, 760, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const measured = await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        const bounds = (selector: string) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
            display: style.display,
            gap: style.gap,
            margin: style.margin,
            padding: style.padding,
          };
        };
        return {
          width: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          rootOverflow: getComputedStyle(document.documentElement).overflowX,
          bodyOverflow: getComputedStyle(document.body).overflowX,
          header: bounds(".nav-wrap"),
          main: bounds("main"),
          context: bounds(".admin-context"),
          sidebar: bounds(".sidebar"),
          actions: [
            ...document.querySelectorAll(
              ".nav-actions > a, .nav-actions > .account-menu > button",
            ),
          ].map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              label: el.textContent,
              left: rect.left,
              right: rect.right,
              height: rect.height,
            };
          }),
        };
      });
      expect(
        measured.documentWidth,
        `${name} at ${width}px`,
      ).toBeLessThanOrEqual(width);
      expect(["hidden", "clip"]).not.toContain(measured.rootOverflow);
      expect(["hidden", "clip"]).not.toContain(measured.bodyOverflow);
      expect(measured.main!.right).toBeLessThanOrEqual(width);
      expect(measured.main!.left).toBeGreaterThanOrEqual(0);
      for (const action of measured.actions) {
        expect(
          Math.round(action.height * 100) / 100,
          action.label!,
        ).toBeGreaterThanOrEqual(44);
        expect(action.left, action.label!).toBeGreaterThanOrEqual(0);
        expect(action.right, action.label!).toBeLessThanOrEqual(width);
      }
      measurements.push(measured);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (process.env.OCLR_E2E_EVIDENCE !== "minimal")
        await page.screenshot({
          path: info.outputPath(
            `${process.env.OCLR_DESIGN_CAPTURE ?? "responsive"}-${name}-${width}.png`,
          ),
          fullPage: true,
          animations: "disabled",
        });
    }
    const path = info.outputPath(`${name}-responsive-measurements.json`);
    await writeFile(path, JSON.stringify(measurements, null, 2));
    await info.attach(`${name}-responsive-measurements`, {
      path,
      contentType: "application/json",
    });
  } finally {
    await page.setViewportSize(original);
  }
}
